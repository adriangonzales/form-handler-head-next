# form-handler-head-next

A Next.js dashboard for the Headless Form Handler API, called **The Backend** throughout this project. It works with any backend that implements the [backend contract](docs/backend-contract.md). The reference Backend is the Laravel project in `../form-handler-headless-laravel`.

- [`PLAN.md`](PLAN.md): architecture and milestones.
- [`docs/prds/`](docs/prds/README.md): requirements for each area.
- [`docs/backend-contract.md`](docs/backend-contract.md): what a backend must implement.

## Requirements

- Node 22 and pnpm 10 (pinned in `packageManager`; `corepack enable` picks it up).
- A running backend, and its OpenAPI spec for type generation.
- From milestone 2: Redis (optional in development). `pnpm services:up` runs one in Docker.

## Setup

```sh
pnpm install
cp .env.example .env
# Set SESSION_SECRET (openssl rand -base64 32) and point BACKEND_API_URL at The Backend.
pnpm api:types
pnpm services:up   # development Redis in Docker (compose.yaml)
pnpm dev
```

The app runs on <http://localhost:3000>.

## Configuration

Every variable is documented in [`.env.example`](.env.example).

- **Server variables** are read at runtime. They're checked when the server starts: if one is missing or invalid, the server exits and lists the problems. In production, `REDIS_URL` is required.
- **`NEXT_PUBLIC_*` variables** are inlined at build time, so changing one needs a rebuild.

## Commands

| Command              | What it does                                                                      |
| -------------------- | --------------------------------------------------------------------------------- |
| `pnpm dev`           | Development server                                                                |
| `pnpm build`         | Production build                                                                  |
| `pnpm start`         | Serve the production build                                                        |
| `pnpm check`         | Lint, Prettier check, typecheck, unit and component tests (run before committing) |
| `pnpm test`          | Unit (`tests/unit`) and component (`tests/component`, jsdom + MSW) tests          |
| `pnpm test:contract` | Check the backend at `BACKEND_API_URL` against the contract                       |
| `pnpm test:e2e`      | Playwright tests; starts `pnpm dev` unless `E2E_BASE_URL` is set                  |
| `pnpm api:types`     | Regenerate `types/api.d.ts` from the backend's OpenAPI spec                       |
| `pnpm services:up`   | Start development services (Redis on `127.0.0.1:6379`) with Docker Compose        |
| `pnpm services:down` | Stop them                                                                         |

## Tests against a backend

`pnpm test:contract` and the Playwright tests call a real backend. The contract's public checks need only `BACKEND_API_URL`.

The checks that sign in need test users, and the contract has no sign-up endpoint. So `E2E_CREATE_USER_CMD` is a shell command that creates a user, with `{name}`, `{email}` and `{password}` replaced. For the reference Backend:

```sh
E2E_CREATE_USER_CMD="cd ../form-handler-headless-laravel && php artisan user:create --name={name} --email={email} --password={password} --no-interaction"
```

Tests delete these users afterwards through the API.

## Project layout

```
app/          routes (App Router)
components/   UI; components/ui holds the shadcn/ui primitives
lib/          logic; lib/env.ts is the server configuration
types/        api.d.ts (generated) and models.ts (short names for the API types)
tests/        unit/, component/, contract/, e2e/, mocks/ (MSW), support/
scripts/      type generation
```
