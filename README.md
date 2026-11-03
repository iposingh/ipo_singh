# IPO Singh

Indian IPO information platform. This repository is an npm workspaces monorepo. The public site is a Next.js App Router application in `apps/web`. The backend is an Express application in `apps/api`.

## Node.js

Development targets **Node.js 24 LTS**. `.nvmrc` contains `24`, and the root `package.json` `engines` field is `24.x`.

```bash
nvm use
```

npm warns if another Node version is active. It does not switch the installed Node binary. Change the system Node installation only when you choose to.

## Structure

```text
IPO_Singh/
├── apps/web/          Next.js 16, React 19, TypeScript, Tailwind CSS v4
├── apps/api/          Express API on Node.js 24
├── apps/mobile/       Expo 58, React Native, Expo Router
├── packages/          Shared contracts, calculations, and design tokens
├── docs/
├── infra/
├── AGENTS.md          Engineering rules
├── .nvmrc
└── package.json       Workspace root
```

Run commands from the repository root.

## Scripts

```bash
npm install
npm run dev
npm run dev:web
npm run dev:api
npm run dev:mobile
npm run lint
npm run typecheck
npm run test
npm run build
npm run start
npm run start:api
```

`npm run dev` serves the web app at [http://localhost:3000](http://localhost:3000) and the API at [http://localhost:4000](http://localhost:4000). Copy `apps/api/.env.example` to `apps/api/.env` to change the API port, allowed browser origins, or local MongoDB URI. The example file contains no secrets. The API connects to MongoDB when `MONGODB_URI` is set. A development database name must include `dev` or `test`. It uses Redis when `REDIS_URL` is set, and keeps serving with an explicit stale fallback if Redis or an upstream provider is unavailable. Cache TTLs, India-time refresh slots, and provider quotas in `apps/api/.env.example` are application settings, not vendor limits. The refresh planner does not start a scheduler and does not call a provider. `IPO_DATA_PROVIDER=ipo-guru` selects the IPO Guru Pro v2 adapter. Catalogue synchronization runs only when `IPOGURU_ENABLED=true`. The worker then calls `GET /ipos` and one `GET /gmp` collection. It does not call a GMP URL per IPO. A disabled client performs no catalogue I/O. Public clients never call a provider directly. Background synchronization is a separate worker, documented in [docs/sync.md](docs/sync.md). It does not start with the website or the API process. The website reads IPO Singh's API. Set `IPO_SINGH_API_ORIGIN` when that API is not at `http://127.0.0.1:4000`.

Public read routes are under `/api/v1`. They return stored IPO records and an empty page when the database has none. They do not call IPO Guru. Catalogue, search, and detail requests are rate limited. The API does not accept PAN or application numbers. See [docs/api.md](docs/api.md). Operational counts are available only at `GET /internal/status` with `OPS_TOKEN`. When the IPO Guru account client is enabled, `GET /internal/ipoguru/account` with the same header reads `GET /me` once. The backend readiness notes are in [docs/backend-readiness.md](docs/backend-readiness.md).

## Tailwind CSS

Tailwind v4 is loaded from `apps/web/app/globals.css`. `apps/web/postcss.config.mjs` uses `@tailwindcss/postcss`, so webpack production builds process utility classes. The Turbopack CSS loader in `apps/web/next.config.ts` covers the default dev and production bundler.
