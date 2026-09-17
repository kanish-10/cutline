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

### Mobile release hardening

- **HTTPS is enforced at runtime for non-dev builds.** `apiOrigin()` in `apps/mobile/api.ts` rejects any non-HTTPS API origin unless the app is running in a development client (`__DEV__`) *and* the host is localhost or a private LAN address (loopback, `10.x`, `172.16–31.x`, `192.168.x`). Release builds and unknown runtimes (`__DEV__` undefined) fail closed: plain-HTTP URLs to public hosts are refused before any cookie is read or request is sent. If a release build shows the "Use HTTPS for the API" setup error, the baked `EXPO_PUBLIC_API_URL` is not HTTPS.
- **expo-secure-store (auth cookies/token storage).** `expo-secure-store` is configured in `apps/mobile/app.json` via the `expo-secure-store` plugin. Better Auth's Expo client (`expoClient` in `apps/mobile/clients.ts`) is passed `storage: SecureStore` with the `cutline` scheme as `storagePrefix`, so session cookies/tokens are stored in the iOS Keychain / Android Keystore rather than AsyncStorage. Do not swap in plain storage; the `expo-client` also caches the cookie in memory for the running session and re-reads it per request (`createMobileApi` in `apps/mobile/api.ts` attaches it as the `Cookie` header per request, never persisting it in app state).
- **Device secure storage caveat.** A small percentage of Android devices may not have secure storage available; `expo-secure-store` throws if the Keychain/Keystore is unavailable. Users on such devices cannot store the session cookie — the app surfaces a "Storage unavailable" error from the cookie bridge rather than silently falling back to plaintext storage. This is a deliberate fail-closed trade-off.
- **No secrets in the bundle.** Only the public API origin is baked in. `BETTER_AUTH_SECRET` stays server-side; the mobile app holds no other credentials.

## Database: backups & maintenance

SQLite is a single file, but never `cp` the live file — use the backup command:

```bash
# /etc/cron.daily/cutline-backup
#!/bin/bash
sqlite3 /var/lib/cutline/cutline.db ".backup /backups/cutline-$(date +%F).db"
find /backups -name 'cutline-*.db' -mtime +30 -delete
```

Restoring: stop the API, replace the file, restart (boot self-migrates; on restore the file is already fully migrated).

### Managed migrations

Schema changes are generated from `apps/api/src/schema.ts` with `npm run db:generate -w @cutline/api`. Review and commit the versioned SQL and `meta/` journal/snapshots in `apps/api/migrations/`; never edit applied migrations. Run `npm run db:check -w @cutline/api` and the API tests before deployment. Do not use `drizzle-kit push` or its direct migrate command: those bypass Cutline's legacy adoption and history checks.

Ship the entire `apps/api/migrations/` directory, including `legacy/` and `meta/`, alongside `apps/api/dist/`. Assets resolve relative to the module, not the working directory; `DATABASE_URL` still resolves relative to the process working directory, so use an absolute production path.

For upgrades, stop the API, take and verify a SQLite backup, deploy the build and migration assets, then run from the repository root:

```bash
node --env-file=apps/api/.env apps/api/dist/migrate.js
```

Restart the API only after success. Boot also invokes the same idempotent runner. `npm run db:migrate -w @cutline/api` is the source-based equivalent when development dependencies are installed. Both use Node 24 and the configured `DATABASE_URL`.

The runner serializes migration writers with `BEGIN IMMEDIATE` and records Drizzle hashes/timestamps in `__drizzle_migrations`. All pending SQL, legacy adoption, and journal writes commit together or roll back together on failure. Changed, missing, or unknown applied history is refused. Backups remain necessary: there are no automatic down migrations. Restore with the API stopped and a compatible application release.

Existing databases created by the original inline v1 migration are adopted only if their complete stored schema matches the frozen `legacy/v1.sql` reference, `schema_migrations` contains exactly version 1, and foreign keys are valid. Adoption preserves all rows and original tables, retains `schema_migrations`, and adds the three generated named unique indexes before recording the baseline. The original implicit unique indexes remain. Partial schemas, extra objects, altered definitions (even equivalent reformatted DDL), and unknown versions are refused without migration writes; investigate a backup copy and reconcile explicitly rather than deleting data or manually stamping the journal.

Review future generated table-rebuild migrations on a populated backup: foreign keys remain enabled, so referenced-table drops may fail or cascade. `PRAGMA foreign_keys = OFF` inside the transaction is ineffective. Transaction-control SQL, `VACUUM`, and operations requiring foreign keys disabled are not supported by this runner; design and test an explicit maintenance procedure instead. `db:check` checks generated metadata consistency, not live schema drift or data preservation.

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
