# form-handler-head-next

A Next.js dashboard for the Headless Form Handler API, called **The Backend** throughout this project. It works with any backend that implements the [backend contract](docs/backend-contract.md). The reference Backend is the Laravel project in `../form-handler-headless-laravel`.

- [`PLAN.md`](PLAN.md): architecture and milestones.
- [`docs/prds/`](docs/prds/README.md): requirements for each area.
- [`docs/backend-contract.md`](docs/backend-contract.md): what a backend must implement.

## Requirements

- Node 22 and pnpm 10 (pinned in `packageManager`; `corepack enable` picks it up).
- A running backend, and its OpenAPI spec for type generation.
- Redis: required in production, optional in development. `pnpm services:up` runs one in Docker.

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

| Command                   | What it does                                                                      |
| ------------------------- | --------------------------------------------------------------------------------- |
| `pnpm dev`                | Development server                                                                |
| `pnpm dev:mock`           | Development server against the mock backend (no Backend or Redis needed)          |
| `pnpm mock:backend`       | Just the mock backend, on `127.0.0.1:8010`                                        |
| `pnpm build`              | Production build                                                                  |
| `pnpm start`              | Serve the production build                                                        |
| `pnpm check`              | Lint, Prettier check, typecheck, unit and component tests (run before committing) |
| `pnpm test`               | Unit (`tests/unit`) and component (`tests/component`, jsdom + MSW) tests          |
| `pnpm test:contract`      | Check the backend at `BACKEND_API_URL` against the contract                       |
| `pnpm test:e2e`           | Playwright tests; starts `pnpm dev` unless `E2E_BASE_URL` is set                  |
| `pnpm test:contract:mock` | The contract suite against a fresh mock backend (no Backend needed)               |
| `pnpm test:e2e:mock`      | The Playwright tests against a fresh mock backend (no Backend or Redis needed)    |
| `pnpm api:types`          | Regenerate `types/api.d.ts` from the backend's OpenAPI spec                       |
| `pnpm services:up`        | Start development services (Redis on `127.0.0.1:6379`) with Docker Compose        |
| `pnpm services:down`      | Stop them                                                                         |

## Tests against a backend

`pnpm test:contract` and the Playwright tests call a real backend. The contract's public checks need only `BACKEND_API_URL`.

The checks that sign in need test users, and the contract has no sign-up endpoint. So `E2E_CREATE_USER_CMD` is a shell command that creates a user, with `{name}`, `{email}` and `{password}` replaced. For the reference Backend:

```sh
E2E_CREATE_USER_CMD="cd ../form-handler-headless-laravel && php artisan user:create --name={name} --email={email} --password={password} --no-interaction"
```

`.env.example` has the equivalent for the mock backend. Tests delete their users afterwards through the API.

`pnpm test:e2e` starts its own dev server on port 3100 (`E2E_PORT`), with the token refreshed on every request, so the refresh path is always exercised. It creates its own user for the run. Exports are processed by The Backend's queue, so for the reference Backend run `php artisan queue:work` alongside it; the mock backend needs nothing extra.

Besides one spec per area, `tests/e2e/accessibility.spec.ts` scans every screen with axe (WCAG 2.1 A and AA) in light and dark mode and at 375 px wide, and checks keyboard use: the phone sidebar, focus returning from dialogs, and focus kept in tables as they update. `tests/e2e/journey.spec.ts` is the happy path through the UI alone, from sign-in to a downloaded CSV and sign-out.

The Redis tests in `tests/unit/redis-refresh-store.test.ts` run when `REDIS_URL` is set (`pnpm services:up`), and are skipped otherwise.

## The mock backend

`tests/mocks/backend/` is an in-memory implementation of [the contract](docs/backend-contract.md), built with MSW and sharing no code with the reference Backend. It covers every endpoint the dashboard uses. It also has mock-only helpers:

- `POST /__mock/users` creates a user;
- `POST /__mock/notifications/{id}/bounce` records a delivery problem on a recipient;
- `GET /__mock/alerts` lists the alerts it has "sent".

`pnpm dev:mock` runs the dashboard against it (port 8010); sign in as `demo@example.com` / `password`.

`pnpm test:contract:mock` and `pnpm test:e2e:mock` run the contract suite and the Playwright tests against a fresh mock on port 8011 (`MOCK_BACKEND_PORT`). They override `.env` where it would point elsewhere, and need no Backend, Redis or test-user command. Both suites pass against the mock and against the reference Backend, which is the evidence that the dashboard depends on the contract rather than on either implementation.

## Using another backend

The dashboard works with any backend that implements [the contract](docs/backend-contract.md). To switch to one:

1. **Check the contract.** Run `BACKEND_API_URL=https://new-backend.example/api pnpm test:contract`. Without a test-user command, only the public checks run (endpoints, guest 401s, error shapes). Set `E2E_CREATE_USER_CMD` to a shell command that creates a user on the new backend, with `{name}`, `{email}` and `{password}` placeholders, and the signed-in checks run too. Fix the backend until all of them pass.
2. **Regenerate the types.** Run `BACKEND_SPEC_URL=https://new-backend.example/docs/api.json pnpm api:types`, then `pnpm typecheck`. A type error shows where the new spec differs from the old one. `git diff types/api.d.ts` shows the whole change.
3. **Adapt, if a convention differs.** Each convention the dashboard relies on is handled in exactly one module, listed in [`PLAN.md`](PLAN.md) §2. Backend-specific code goes in `lib/backend/`. A unit test fails if a backend framework is named anywhere else.
4. **Configure.** Point `BACKEND_API_URL` and `NEXT_PUBLIC_BACKEND_PUBLIC_URL` at the new backend, and set `BACKEND_REFRESH_WINDOW_SECONDS` and `NEXT_PUBLIC_PASSWORD_REQUIREMENTS` to match its policy. Then rebuild. On the backend, set the reset-email link, CORS, the trusted proxy and its public origin, as listed under [Deploying](#deploying).
5. **Run the end-to-end tests** with `pnpm test:e2e`, using the same `E2E_CREATE_USER_CMD`, and with any background workers the backend needs (exports must complete).

## Deploying

`pnpm build`, then `pnpm start` (`next start`, port 3000 or `PORT`) on Node 22. It needs Node's runtime: `proxy.ts` and the route handlers use Node APIs, and pages are rendered per request.

**Build time.** `NEXT_PUBLIC_BACKEND_PUBLIC_URL` and `NEXT_PUBLIC_PASSWORD_REQUIREMENTS` are inlined by `pnpm build`, so set them before building, and rebuild to change them. `types/api.d.ts` is committed, so the build doesn't need The Backend.

**Run time.** Every server variable in [`.env.example`](.env.example). The server checks them when it starts and exits with a list of problems, and in production that includes a missing `REDIS_URL`.

- **`SESSION_SECRET`** must be the same on every instance and across restarts. Changing it signs everyone out.
- **Redis** (`REDIS_URL`) coordinates token refreshes between instances, so the app can run on several instances or serverless. If Redis is unreachable, requests that need a refresh answer 503 within about a second, and the session is kept for a retry.
- **HTTPS.** In production the session cookie is `Secure`, so the dashboard must be served over HTTPS (a TLS-terminating proxy in front of `next start` is fine).
- **`BACKEND_REFRESH_WINDOW_SECONDS`** must match The Backend's refresh window. Set too long, sessions outlive their token and end with "your session expired". Set too short, people are signed out early.

**What The Backend must be configured to do.** These are deployment requirements of [the contract](docs/backend-contract.md), not code in this app:

- **Export links.** The Backend signs CSV download links with the host it saw on the request, and that request came from this server. So set `BACKEND_API_URL` to The Backend's **public** origin. If this server reaches The Backend at an internal address instead, a proxy in front of The Backend must set `X-Forwarded-Host` and `X-Forwarded-Proto` to the public ones, and The Backend must trust them. This app only forwards `X-Forwarded-For`.
- **Client IPs.** The Backend should trust this server as a proxy, so its per-IP throttles (login, password reset) see each browser's IP from `X-Forwarded-For`, not this server's. Otherwise every user shares one throttle.
- **Reset emails** must link to this dashboard's `/reset-password` (The Backend appends `?token=…&email=…`).
- **Public submissions** are sent from the browser, so The Backend must allow CORS from any origin (without credentials). That covers this dashboard's test-submit tool and customers' sites.

## Project layout

```
app/          routes (App Router)
components/   UI; components/ui holds the shadcn/ui primitives
lib/          logic; lib/env.ts is the server configuration
types/        api.d.ts (generated) and models.ts (short names for the API types)
tests/        unit/, component/, contract/, e2e/, mocks/ (MSW), support/
scripts/      type generation
```
