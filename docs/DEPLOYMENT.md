# Cutline — Deployment Guide

Production deployment for the Cutline monorepo: Next.js website, Expo mobile app, and a Hono + SQLite API.

## Architecture

```
[Next.js web]  ──┐
                 ├──> [Hono API :3001] ──> [SQLite file on disk]
[Expo mobile]  ──┘          (single Node 24 process)
```

- **One API process, one SQLite file.** WAL mode + busy timeout handle the concurrency this app needs at target scale (solo creators). No managed Postgres required.
- Web and mobile are both static-ish clients hitting the same public API over HTTPS.
- Sessions: Better Auth cookies, 7-day expiry, `Secure` + `SameSite=Lax` when `NODE_ENV=production`.
- The API **refuses to boot** in production with non-HTTPS origins — configure TLS first.

## What you need

| Requirement | Detail |
|---|---|
| A server | Any Linux box / VM with Node **24.x** (Vercel **cannot** host the API — no writable disk for SQLite) |
| Domains | `yourdomain.com` (web) + `api.yourdomain.com` (API) — two origins keep cookie scoping simple |
| TLS | Caddy (automatic) or nginx + certbot — **mandatory** |
| Process manager | pm2, systemd, or Docker |

## Step-by-step: single VPS

### 1. Server prep

```bash
# Node 24 (NodeSource) — verify `node --version` ≥ 24.3
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs caddy
sudo npm install -g pm2
```

### 2. Deploy code

```bash
sudo mkdir -p /opt/cutline /var/lib/cutline && sudo chown $USER /var/lib/cutline
git clone <repo-url> /opt/cutline && cd /opt/cutline
npm install
```

### 3. Configure environment

`/opt/cutline/apps/api/.env`:

```ini
NODE_ENV=production
DATABASE_URL=/var/lib/cutline/cutline.db
BETTER_AUTH_SECRET=<openssl rand -hex 32>
API_URL=https://api.yourdomain.com
WEB_ORIGIN=https://yourdomain.com
PORT=3001
```

`/opt/cutline/apps/web/.env.local`:

```ini
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
API_URL=https://api.yourdomain.com
```

> `BETTER_AUTH_SECRET` never leaves this file. `.env*` is gitignored.

### 4. Build

```bash
npm run build
# builds in order: packages/shared → apps/api → apps/web
# the compiled API imports @cutline/shared from its dist/ — build shared first
```

### 5. Run

```bash
pm2 start "node --env-file=apps/api/.env apps/api/dist/server.js" --name cutline-api
pm2 start "npm run start -w @cutline/web" --name cutline-web
pm2 save && pm2 startup   # survive reboots
```

(The server self-migrates the database on first boot — `/var/lib/cutline/cutline.db` is created automatically.)

### 6. Reverse proxy (Caddy, auto-HTTPS)

`/etc/caddy/Caddyfile`:

```
yourdomain.com {
    reverse_proxy localhost:3000
}
api.yourdomain.com {
    reverse_proxy localhost:3001
}
```

```bash
sudo systemctl reload caddy
```

### 7. Verify

```bash
curl https://api.yourdomain.com/health          # {"ok":true}
# Sign up via the website and create a board
```

## Alternative: split hosting

| Piece | Where | Notes |
|---|---|---|
| `apps/web` | Vercel / Netlify | Set `NEXT_PUBLIC_API_URL` at build time |
| `apps/api` | Railway / Fly.io / Render / any VPS | **Attach a persistent volume** for the SQLite file; point `DATABASE_URL` at it |
| `apps/mobile` | EAS Build | See below |

## Mobile app release

```bash
cd apps/mobile
npm run build                    # expo export → static iOS/Android bundles
npx eas build --platform ios     # store submission via Expo Application Services
npx eas build --platform android
```

The mobile bundle bakes in `EXPO_PUBLIC_API_URL` (from `apps/mobile/.env`) — set it to the **production** API URL before building store artifacts. Auth uses the `cutline://` deep-link scheme (registered in `apps/mobile/app.json`).

## Database: backups & maintenance

SQLite is a single file, but never `cp` the live file — use the backup command:

```bash
# /etc/cron.daily/cutline-backup
#!/bin/bash
sqlite3 /var/lib/cutline/cutline.db ".backup /backups/cutline-$(date +%F).db"
find /backups -name 'cutline-*.db' -mtime +30 -delete
```

Restoring: stop the API, replace the file, restart (boot self-migrates; on restore the file is already fully migrated).

Schema changes in development: edit `apps/api/src/schema.ts`, add a migration statement to `MIGRATIONS` in `apps/api/src/database.ts` (applied on next boot, tracked in `schema_migrations`).

## Security checklist (go-live)

- [ ] `BETTER_AUTH_SECRET` freshly generated, 32+ chars, never committed
- [ ] `NODE_ENV=production` — enables Secure cookies + HTTPS-origin enforcement
- [ ] `API_URL` and `WEB_ORIGIN` are real HTTPS URLs and match exactly what browsers/apps use
- [ ] SQLite file outside the repo: `chmod 600 /var/lib/cutline/cutline.db`
- [ ] Backup cron installed and tested once
- [ ] Rate limits confirmed on (default: 30 auth req/min, 120 API req/min per user)
- [ ] `.env` files absent from the repo: `git status` clean of secrets

## Scaling notes

- SQLite comfortably handles this app's write pattern at small-to-medium scale; WAL mode allows concurrent readers with one writer.
- If you ever outgrow it: the Drizzle schema is portable to Postgres with minimal changes (`drizzle-orm/pg-core`), and the API is stateless apart from the DB file.
- Realtime sync (currently polling) would be the next addition — SSE or WebSockets behind the same proxy.

## Troubleshooting (production)

| Symptom | Cause | Fix |
|---|---|---|
| API won't boot: "Production origins require HTTPS" | `API_URL`/`WEB_ORIGIN` not https | Put TLS in front, update env, restart |
| 500 on signup after fresh deploy | DB path not writable | Check `DATABASE_URL` dir permissions |
| Login loops between web and API | Cookie dropped — `Secure` cookie over plain HTTP | Serve both origins over HTTPS |
| `ERR_MODULE_NOT_FOUND` in dist | Stale build / shared not built | `npm run build` (builds shared first) |
| Slow first request after deploy | Next.js cold start (static gen) | Expected; warms up on first hit |
