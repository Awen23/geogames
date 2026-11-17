# Geogames

Daily geography puzzles. Currently ships one game: **Where Most** — guess which country leads the world in a given metric.

## Prerequisites

- Node.js 22 (see `.nvmrc`)
- Docker (for local Postgres)

## First-time setup

```bash
# Install all dependencies
npm install
npm install --prefix api
npm install --prefix web

# Start Postgres and apply migrations
npm run dev:db:up
npm run db:migrate
```

## Running locally

```bash
npm run dev
```

This starts both servers concurrently:

| Server | URL |
|---|---|
| API (Express) | http://localhost:3001 |
| Web (Vite) | http://localhost:5173 |

The web server proxies `/api/*` to the API, so you only need to open http://localhost:5173.

## Database commands

```bash
npm run dev:db:up       # Start Postgres container (idempotent)
npm run dev:db:down     # Stop container, keep data
npm run dev:db:reset    # Nuke volume, recreate, re-migrate
npm run dev:db:logs     # Tail Postgres logs
npm run db:migrate      # Apply pending migrations
npm run db:generate     # Regenerate SQL from schema changes (api/src/db/schema.ts)
```

## Testing

```bash
npm test          # Vitest unit tests (13 tests — scoring, daily seed, distance)
npm run test:e2e  # Playwright E2E tests (requires Postgres running)
npm run typecheck # TypeScript across api + web
```

E2E tests never touch the dev database. Each run recreates a separate database (`geogames_e2e` by default, or `E2E_DATABASE_URL`), migrates it and schedules known puzzles for today (`e2e/support/`). Playwright then starts its own api (port 3201) and web (port 5273) servers against it, so dev servers can keep running.

`gameResults.spec.ts` runs first, as its own Playwright project, so it sees exact play counts. If it fails, the UI specs are skipped, and running any single spec also runs it unless you pass `--no-deps`.

## Project layout

```
geogames/
  shared/       # Types, distance utils, country centroids (shared by api + web)
  api/          # Express 5 backend — routes, services, Drizzle ORM
  web/          # Vite + React 18 frontend — Globe, game UI, hub
  e2e/          # Playwright tests
  tools/        # One-shot scripts (e.g. regenerate centroids.json)
```

## Regenerating centroids

If you need to rebuild `shared/centroids.json` (e.g. after updating world-atlas):

```bash
./node_modules/.bin/tsx tools/generateCentroids.ts
```

## Environment variables

Copy `.env.example` to `.env` and adjust if needed:

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgres://geogames:geogames@localhost:5432/geogames` | Postgres connection string |
| `PORT` | `3001` | API server port |
| `WEB_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |
