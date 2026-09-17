# Cutline — Development Guide

Everything needed to run Cutline locally: three services in one npm-workspaces monorepo.

## Repository layout

```
cutline/
├── apps/
│   ├── api/        Hono + SQLite API server       → http://localhost:3001
│   ├── web/        Next.js website                → http://localhost:3000
│   └── mobile/     Expo (iOS + Android)           → Metro on :8081
├── packages/
│   └── shared/     Zod schemas, types, constants, API client (used by all three)
├── package.json    Root scripts: dev, lint, typecheck, test, build
├── biome.json      Linter/formatter
└── tsconfig.base.json
```

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | **24.x** (required) | `better-sqlite3` native module is built for Node 24; Node 20 segfaults |
| npm | 11.x | bundled with Node 24 |
| Xcode / Android Studio | for simulators | only if developing mobile |

`.nvmrc` pins Node 24: `nvm use` before anything else. Verify with `node --version`.

## First-time setup

```bash
# 1. Install all workspace dependencies
npm install

# 2. API environment (secret is mandatory)
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env and set:
#   BETTER_AUTH_SECRET=<openssl rand -hex 32>

# 3. Web environment
cp apps/web/.env.example apps/web/.env.local

# 4. (optional) Mobile environment
cp apps/mobile/.env.example apps/mobile/.env
```

## Starting the dev servers

### Everything at once

```bash
npm run dev
```

Runs API (:3001), web (:3000), and Expo (:8081) concurrently with colored output.

### One service at a time

```bash
npm run dev:api      # API only       — tsx watch, hot reload, port 3001
npm run dev:web      # website only   — next dev, port 3000
npm run dev:mobile   # Expo only      — expo start, Metro on 8081
```

### First run behavior

- The API **self-migrates** the SQLite database on boot (`migrate()` in `apps/api/src/server.ts`). No manual migration step needed.
- Sign up at http://localhost:3000 → pick a creator type (video/podcast/written) → board with default stages is generated.

### Mobile on a device

A phone cannot reach your machine's `localhost`. Set your LAN IP in `apps/mobile/.env`:

```
EXPO_PUBLIC_API_URL=http://192.168.1.x:3001
```

Then `npm run dev:mobile` and scan the QR (Expo Go), or press `i` / `a` for simulators. Find your IP with `hostname -I` (Linux) or `ipconfig` (Windows).

## Environment variables

### `apps/api/.env` (from `.env.example`)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `BETTER_AUTH_SECRET` | **yes** | — | Session signing key, min 32 chars |
| `DATABASE_URL` | no | `./cutline.db` | SQLite file path; `:memory:` for tests |
| `PORT` | no | `3001` | API port |
| `API_URL` | no | `http://localhost:3001` | Public API origin (cookies/CORS) |
| `WEB_ORIGIN` | no | `http://localhost:3000` | Allowed browser origin |

### `apps/web/.env.local` (from `.env.example`)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | API URL compiled into the browser bundle |
| `API_URL` | Server-side API URL |

### `apps/mobile/.env` (from `.env.example`)

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | API URL compiled into the app bundle |

Changing any `*_PUBLIC_*` / `EXPO_PUBLIC_*` variable requires restarting that dev server.

## Daily workflow

```bash
npm run lint          # Biome: format + lint + import order
npm run format        # auto-fix lint/format issues
npm run typecheck     # tsc --noEmit in every workspace
npm test              # vitest: shared (3) + api (3) + mobile (19)
npm run build         # shared → api → web production builds
npm run db:migrate    # manual migration (usually unnecessary — boot self-migrates)
```

Run everything before committing; see DEPLOYMENT.md for the production checklist.

## Common tasks

| I want to… | Do this |
|---|---|
| Add/edit API constants or limits | `packages/shared/src/index.ts` (single source of truth) |
| Change DB schema | `apps/api/src/schema.ts` + add migration in `apps/api/src/database.ts` |
| Add/modify an endpoint | `apps/api/src/app.ts` (routes) + schema in `packages/shared` |
| Change stage templates/checklists | `TEMPLATES` / `CHECKLISTS` in `packages/shared/src/index.ts` |
| Reset the database | stop API, delete `apps/api/cutline.db*`, restart (self-migrates) |

### Editing `packages/shared`

Dev servers consume the TS source directly, so edits hot-reload. The **compiled** API resolves the built `dist/`, so before testing a compiled build:

```bash
npm run build -w @cutline/shared
```

## Troubleshooting (dev)

| Symptom | Cause | Fix |
|---|---|---|
| `Segmentation fault` on API start | Node 20 + Node-24-built native module | `nvm use` (Node 24), restart |
| Zod error: `BETTER_AUTH_SECRET` invalid | Missing/short secret | Set 32+ chars in `apps/api/.env` |
| Signup 500, stale responses | Old server process on the port | `pkill -f 'src/server.ts'`, restart |
| `EADDRINUSE` | Port taken | change `PORT` in `.env` or kill the process |
| Mobile can't log in | Phone hitting `localhost` | Use LAN IP in `EXPO_PUBLIC_API_URL` |
| 401 right after login | Origin/cookie mismatch | `WEB_ORIGIN` must match the web URL exactly (scheme+host+port) |
| 409 "changed on another device" | Optimistic-concurrency guard tripped | Reload the board and retry |

## Verification before you push

```bash
npm run lint && npm run typecheck && npm test
```

All three must be green (CI is not configured yet).
