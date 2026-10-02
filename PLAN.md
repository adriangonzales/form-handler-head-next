# form-handler-head-next — Project Plan

Next.js frontend (dashboard) for the **Headless Form Handler** API, referred to throughout as **The Backend**.

- The Backend today is the Laravel project in `../form-handler-headless-laravel`. This frontend must not depend on that: it must work with **any server that implements the same API design** (same paths, payloads, status codes, auth flow and error shapes).
- Contract: `http://127.0.0.1:8001/docs/api.json` (OpenAPI 3.1, "Headless Form Handler" 0.0.1, 36 operations). Base URL: `http://127.0.0.1:8001/api`.
- Functional reference: the sibling Nuxt frontend `../form-handler-head-nuxt` is complete for the same API. Its `PLAN.md` and `docs/prds/` describe every screen, acceptance criterion and edge case found while building it. This project aims for **feature parity**; the PRDs are copied and adapted (milestone 0) rather than rewritten from scratch.
- **Both dashboards are maintained** (decided 2026-10-02). A feature or contract change is made in both projects and in both PRD sets.

## 1. Goals and non-goals

**Goals**

1. Same feature set as the Nuxt dashboard: auth, forms, schema builder, embed/test-submit, entries triage, exports, notifications, account.
2. **Backend-agnostic.** Everything The Backend-specific lives behind one boundary (§4). Swapping The Backend means changing env vars, and nothing else, as long as the new backend passes the contract suite (§8).
3. The access token never reaches browser JavaScript.
4. Every API call is typed from the OpenAPI spec, so contract changes surface as type errors.

**Non-goals**

- No sign-up (the API has none).
- No backend-specific tooling in the app or its tests (no `php artisan`, no Laravel env names, no assumptions about Laravel internals).
- The Postmark bounce webhook (`POST /v1/webhooks/postmark/bounces`) is backend-to-provider and is never called or proxied by this app.

## 2. The API contract (what "same API design" means)

These are the conventions the app relies on. Each is handled in exactly one place in the code (listed), so a backend that differs slightly can be adapted there.

| Convention          | Contract                                                                                                                                                                                                                                                                                           | Handled in                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Auth                | `POST /v1/auth/login` → `{ access_token, token_type: "bearer", expires_in }`. Bearer token on every call. `POST /v1/auth/refresh` exchanges a current or recently expired token and **invalidates the old one**. `POST /v1/auth/logout`. `GET /v1/auth/me`.                                        | `lib/backend/auth.ts`                        |
| Refresh window      | A token can be refreshed until a fixed time after the original login (7 days for The Backend today). The window doesn't slide on refresh. Configured, not hard-coded: `BACKEND_REFRESH_WINDOW_SECONDS`.                                                                                            | `lib/session/`                               |
| Password change     | `PUT /v1/auth/password` revokes every token and returns a new one, which the session must store.                                                                                                                                                                                                   | `app/api/auth/password/route.ts`             |
| Account deletion    | `DELETE /v1/auth/me?password=…` (password as a query parameter — only ever sent server to server).                                                                                                                                                                                                 | `app/api/auth/me/route.ts`                   |
| Password reset      | `forgot-password` always returns the same response (anti-enumeration). The Backend emails a link to a configured URL with `?token=…&email=…`, which must point at this app's `/reset-password`.                                                                                                    | `app/(auth)/reset-password`                  |
| Pagination          | `{ data, links: {first,last,prev,next}, meta: {current_page, last_page, per_page, total, from, to, …} }`. 15 per page by default; `per_page` 1–100 on forms and entries; notifications fixed at 15.                                                                                                | `lib/backend/pagination.ts` → `Paginated<T>` |
| Sorting / filtering | `sort=field` / `sort=-field`; `filter[key]=value` bracket syntax.                                                                                                                                                                                                                                  | `lib/backend/query.ts`                       |
| Errors              | 422 `{ message, errors: { field: string[] } }`; 401, 403, 404, 409, 410 with `{ message }`.                                                                                                                                                                                                        | `lib/backend/errors.ts` → `BackendError`     |
| IDs                 | ULID strings for forms, entries, notifications, exports, and schema field IDs; integer user IDs.                                                                                                                                                                                                   | `lib/ulid.ts`, types                         |
| Form schema         | A list of `{ id (ULID), order (int), label?, name?, rules? }`. Other keys rejected; responses sorted by `order`. `name` defaults to the id. `rules` are validation rule strings in the API's rule syntax (`required`, `email`, `max:N`, `in:a,b`, …), as an array or comma-separated string.       | `lib/schema/`                                |
| Form settings       | `redirect`, `timezone`, `domains: string[]`, `message`, `honeypot_enabled`, `honeypot_name` — all optional and nullable; unknown keys rejected.                                                                                                                                                    | `lib/forms/settings.ts`                      |
| Public submit       | `POST /v1/forms/{form}/submissions`, no auth, called from the browser (CORS). Returns `{ redirect, message }`, never a 3xx. Unknown fields dropped.                                                                                                                                                | `lib/snippets.ts`, test-submit               |
| Spam check          | Asynchronous after submission. `spam_checked_at` null while pending (or if it couldn't run); `spam_score` is a 0–1 likelihood; entries may move to Spam after arriving.                                                                                                                            | `lib/entries/spam.ts`                        |
| Exports             | Queued: create → poll → download. `download_url` is a short-lived (~5 min) signed absolute URL needing no bearer token, `null` until complete. `/download` returns 409 not ready, 410 expired, 403 bad/expired signature. The URL's host is whatever host The Backend saw on the request — see §4. | `lib/exports/`                               |

### Spec accuracy (fixed in The Backend 2026-10-02)

The four spec quirks found while planning are fixed in The Backend, so the generated types are used as they are:

- `access_token` is `string` (was `boolean | string`);
- `FormEntryResource.spam_score` is a `number` — the API now returns `0.125`, not `"0.125"`;
- `FormEntryExportResource.parameters` is an object `{ sort?, filter? }` (was `string`);
- form store/update request `schema` items require only `id` and `order`; `label`, `name` and `rules` are optional.

The Backend's `tests/Feature/OpenApiDocumentTest.php` keeps them from regressing. One modelling choice stays in `models.ts`: `FormListItem` makes the three entry counts required for list rows, since only the list includes them.

## 3. Stack

| Concern         | Choice                                                                                                             | Why                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework       | **Next.js** latest stable (16.x at time of writing — confirm at scaffold), App Router, React 19, TypeScript strict | Requested. Server route handlers give us the BFF                                                                                                   |
| UI              | **shadcn/ui** (Radix, Tailwind v4) + **lucide-react** icons                                                        | Closest match to Nuxt UI: owned components, accessible primitives                                                                                  |
| Tables          | **TanStack Table**                                                                                                 | Schema-driven entry columns, row selection for bulk actions                                                                                        |
| Server state    | **TanStack Query**                                                                                                 | Polling (exports, spam checks), optimistic toggles, invalidation after mutations                                                                   |
| URL state       | **nuqs**                                                                                                           | Filters, sort, page and page size kept in the URL (the Nuxt `useListQuery`)                                                                        |
| Forms           | **react-hook-form** + **zod**                                                                                      | 422 errors mapped onto fields with `setError`                                                                                                      |
| Session         | **iron-session** (sealed, httpOnly cookie)                                                                         | Equivalent of nuxt-auth-utils                                                                                                                      |
| Shared state    | **Redis** (`ioredis`)                                                                                              | Refresh coordinator across instances and serverless invocations                                                                                    |
| API types       | **openapi-typescript** + **openapi-fetch** (server)                                                                | Typed paths, params and bodies from the spec                                                                                                       |
| Drag and drop   | **@dnd-kit**                                                                                                       | Schema field reordering, with keyboard support                                                                                                     |
| Toasts          | **sonner** (shadcn)                                                                                                | Undo actions on delete                                                                                                                             |
| Dates           | **date-fns** + `date-fns-tz`                                                                                       | Ranges and form timezones                                                                                                                          |
| Testing         | **Vitest** (+ Testing Library), **Playwright** + `@axe-core/playwright`, **MSW**                                   | MSW mock backend generated from the spec — see §8                                                                                                  |
| Lint/format     | ESLint 9 (next config) + `eslint-config-prettier`, Prettier with the Tailwind plugin                               | ESLint 10 crashes `eslint-plugin-react`, which `eslint-config-next` 16.3 depends on (checked 2026-10-02). Revisit when the Next config supports it |
| Package manager | pnpm 10 (pinned in `packageManager`)                                                                               | Same as the Nuxt project                                                                                                                           |
| TypeScript      | 5.x (pinned `^5`)                                                                                                  | `openapi-typescript` needs the JS compiler API that TS 7 lacks (same finding as the Nuxt project)                                                  |

## 4. Architecture

```
Browser ──(sealed cookie)──▶ Next.js server ─────────────(Bearer token)──▶ The Backend /api/v1
   │                          • proxy.ts               session gate + proactive refresh
   │                          • app/api/auth/*         login, logout, me, password, reset
   │                          • app/api/backend/[...]  authenticated pass-through
   │                          • Server Components      read via lib/backend (server-only)
   │
   ├──▶ The Backend directly: public form submissions (test-submit tool, embed snippets)
   └──▶ The Backend directly: signed CSV download links
```

### The backend boundary — `lib/backend/` (server-only)

The only code that knows The Backend's base URL, auth header, token format, pagination and error shapes. Marked `import 'server-only'`.

- `client.ts` — `openapi-fetch` client built from `BACKEND_API_URL`, injecting the bearer token and forwarding `X-Forwarded-For/-Host/-Proto`.
- `auth.ts` — login / refresh / logout / me, returning a normalised `TokenSet { token, expiresAt }`.
- `errors.ts` — turns any non-2xx into `BackendError { status, message, fieldErrors }`.
- `pagination.ts`, `query.ts` — normalise list responses and build `sort` / `filter[...]` query strings.

Nothing outside `lib/backend/` imports the generated `api.d.ts` paths directly; UI code uses the aliases in `types/models.ts`. A backend with a different but equivalent convention (e.g. another pagination envelope) is adapted here.

### Session and token refresh

- **Login** (`app/api/auth/login/route.ts`): calls login then `me`, stores `{ user, token, expiresAt, refreshableUntil }` in the iron-session cookie (`maxAge` = `BACKEND_REFRESH_WINDOW_SECONDS`). `refreshableUntil` is fixed at first login.
- **Next.js-specific constraint:** Server Components cannot set cookies. A refresh during an RSC render could not be saved, and since refresh invalidates the old token, the next request would fail. So:
  1. `proxy.ts` (Next 16's middleware, Node runtime) runs on every dashboard navigation. It refreshes the token when it's within `AUTH_REFRESH_AHEAD_SECONDS` (default 120) of expiry and writes the new cookie **before** rendering, so Server Components always read a fresh token and never refresh themselves. Past `refreshableUntil` it clears the session and redirects to `/login?next=…`.
  2. The route handler proxy (`app/api/backend/[...path]/route.ts`) does the same check, and on a 401 refreshes once and retries. If that fails it clears the session and returns 401; the client's query/mutation layer redirects to `/login`.
- **Refresh coordinator** (`lib/session/refresh-coordinator.ts`): one in-flight refresh per token, result reused for 60 s for late requests still carrying the old token (the Nuxt project needed this for SSR and parallel requests). **Backed by Redis** (decided 2026-10-02): a `SET NX PX` lock per token, with the refreshed token set stored under the old token's hash for 60 s, so every instance shares one refresh. Behind an interface with an in-memory implementation used by unit tests and `pnpm dev:mock` when `REDIS_URL` is unset; production requires `REDIS_URL`. Tokens are stored only as hashes in keys, and values are encrypted with `SESSION_SECRET`.
- **Proxy rules:** refuse `auth/*`, `webhooks/*` and dot segments (checked after decoding); forward method, query, body and the client IP.
- **Password change** stores the returned token and restarts the refresh window.

### Data flow

- Pages are Server Components that read the session and the route params, prefetch the first page of data through `lib/backend` with TanStack Query's `HydrationBoundary`, and render client components.
- Client components fetch and mutate through `/api/backend/**` with TanStack Query. One `queryKeys.ts` factory; mutations invalidate the affected keys.
- No Server Actions for API mutations in v1: one client path (the proxy) keeps error handling, 401 handling and optimistic updates uniform. Revisited after milestone 3 (see §7): no reason to change.

### Export downloads

The UI re-fetches the export just before download to get a fresh `download_url`, then follows a plain link so the CSV goes straight from The Backend to the browser. The signed URL uses the host The Backend saw, and that request came from the Next server, so either `BACKEND_API_URL` is The Backend's **public** origin, or the server calls an internal address and The Backend trusts the forwarded `Host`/`Proto` headers. Documented as a deployment requirement for any backend.

### Configuration (`.env.example`)

| Variable                            | Scope     | Purpose                                                                                                                                                                                                                                                                                     |
| ----------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BACKEND_API_URL`                   | server    | The Backend's API base (e.g. `http://127.0.0.1:8001/api`)                                                                                                                                                                                                                                   |
| `BACKEND_SPEC_URL`                  | build/dev | OpenAPI spec for type generation and contract tests; derived from `BACKEND_API_URL` if unset                                                                                                                                                                                                |
| `NEXT_PUBLIC_BACKEND_PUBLIC_URL`    | browser   | Base shown in embed snippets and used by test-submit                                                                                                                                                                                                                                        |
| `BACKEND_REFRESH_WINDOW_SECONDS`    | server    | Session lifetime = The Backend's refresh window (604800 today)                                                                                                                                                                                                                              |
| `AUTH_REFRESH_AHEAD_SECONDS`        | server    | Refresh this long before expiry (120)                                                                                                                                                                                                                                                       |
| `SESSION_SECRET`                    | server    | ≥32 chars, seals the cookie and encrypts refresh results in Redis                                                                                                                                                                                                                           |
| `REDIS_URL`                         | server    | Refresh coordinator store; required in production, optional in dev (falls back to in-memory)                                                                                                                                                                                                |
| `NEXT_PUBLIC_PASSWORD_REQUIREMENTS` | browser   | Password rules text shown on Account / reset                                                                                                                                                                                                                                                |
| `E2E_PORT`                          | tests     | Port of the dev server Playwright starts for itself (default 3100). The suite creates and deletes its own user with `E2E_CREATE_USER_CMD`, so there's no shared test account                                                                                                                |
| `E2E_CREATE_USER_CMD`               | tests     | Shell command that creates a throwaway user, with `{name}`, `{email}` and `{password}` placeholders (for the reference Backend: `php artisan user:create …`). Backend-specific, so supplied by env, never in the code. Tests delete these users through the contract's `DELETE /v1/auth/me` |

## 5. Folder layout

```
form-handler-head-next/
├─ app/
│  ├─ (auth)/              login, forgot-password, reset-password  (centred card layout)
│  ├─ (dashboard)/         layout.tsx (sidebar + header)
│  │  ├─ forms/            page.tsx, new/, [formId]/(entries|fields|settings|notifications|integrate)
│  │  │                    [formId]/entries/@detail + (.)[entryId]   intercepting route → slide-over
│  │  ├─ exports/
│  │  └─ account/
│  ├─ api/auth/            login, logout, me (GET/PATCH/DELETE), password, forgot-password, reset-password
│  ├─ api/backend/[...path]/route.ts
│  ├─ error.tsx, not-found.tsx, global-error.tsx
├─ components/
│  ├─ ui/                  shadcn primitives
│  ├─ forms/ entries/ exports/ notifications/ account/
│  └─ shared/              ConfirmDialog, DataTable, Pagination, EmptyState, ErrorState, CodeBlock, RelativeTime
├─ hooks/                  useListQuery (nuqs), useUnsavedChanges, useCopy, useNow, useExportPolling
├─ lib/
│  ├─ backend/             the backend boundary (server-only) — §4
│  ├─ session/             iron-session config, refresh coordinator, tokenAction
│  ├─ api-client.ts        browser fetch to /api/backend, BackendError, 401 → /login
│  ├─ query-keys.ts
│  ├─ schema/              schemaToDrafts / draftsToSchema, rule presets
│  ├─ entries/ exports/ forms/ notifications/   pure helpers (port of the Nuxt app/utils)
│  ├─ snippets.ts, ulid.ts, form-errors.ts (BackendError → react-hook-form)
├─ types/                  api.d.ts (generated), models.ts (aliases, FormListItem)
├─ proxy.ts
├─ tests/                  unit/, contract/, e2e/, mocks/ (MSW handlers + fixtures)
├─ scripts/generate-api-types.mjs
├─ docs/prds/
└─ .env.example, next.config.ts, package.json
```

Scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:contract`, `test:e2e`, `api:types`, `check` (lint + format + typecheck + unit and component tests), and from milestone 2 `dev:mock` (runs against the MSW mock backend).

## 6. Pages and features

Behaviour matches the Nuxt PRDs; only the Next.js mechanism is noted here.

| Route                         | Purpose                                                                                                                                                                                                                                                                                                                           | Next.js notes                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `/login`                      | Email + password, 422 message, link to forgot password, "accounts are created by an admin" note; `?next=` return                                                                                                                                                                                                                  | Route handler sets cookie; client redirects                                                        |
| `/forgot-password`            | Always the same "check your inbox" message                                                                                                                                                                                                                                                                                        |                                                                                                    |
| `/reset-password?token&email` | New password + confirmation, then login                                                                                                                                                                                                                                                                                           |                                                                                                    |
| `/` → `/forms`                |                                                                                                                                                                                                                                                                                                                                   | `redirect()`                                                                                       |
| `/forms`                      | Table: name, active, entries/unread/spam counts (linking to entries tabs), updated. Active filter tabs, sort, page size 15/25/50/100 in the URL. Row actions: open, duplicate, activate/deactivate, delete with Undo (`restore`)                                                                                                  | nuqs; page size remembered in `localStorage`                                                       |
| `/forms/new`                  | Name + settings; templates Blank / Contact / Newsletter (ULID field ids)                                                                                                                                                                                                                                                          |                                                                                                    |
| `/forms/[formId]`             | Header (name, optimistic Active switch, Duplicate/Delete menu) and tabs: Entries · Fields · Settings · Notifications · Integrate                                                                                                                                                                                                  | Nested layout                                                                                      |
| `…/entries`                   | Inbox/Unread/Starred/Spam/Trash with count badges; date range; sort (newest/oldest/spam likelihood); schema-driven columns; inline star; Checking… / Not checked spam state with polling; selection + bulk bar (all bulk actions, ≤100 ids, Undo on delete, stale-selection 422); Trash actions; **Export CSV** + Exports popover | TanStack Table; `refetchInterval` while any row is Checking                                        |
| `…/entries/[entryId]`         | Slide-over detail: full input, IP/location, user agent, referer, spam likelihood/reason/time; marks read; star/read/spam toggles; delete/restore/force; prev/next (`j`/`k`) across pages; polls while the check is pending                                                                                                        | **Intercepting + parallel route**, so a direct link renders full page and the list keeps its state |
| `…/fields`                    | Schema builder: label, input name (follows label until edited), rule presets (required, email, numeric, url, min/max, one-of), free-text rules, drag/keyboard reorder, read-only ULID; saves `order` renumbered from 1, rules as arrays; warns on rename/remove when entries exist; unsaved-changes guard                         | @dnd-kit; `beforeunload` + router guard                                                            |
| `…/settings`                  | Name, active, redirect, message, timezone (`Intl.supportedValuesOf`), domains tags, honeypot toggle/name; sends only set keys; delete with Undo                                                                                                                                                                                   |                                                                                                    |
| `…/notifications`             | Email/SMS recipients, enabled switch, delivery-error badge, add/edit modal (email or E.164), remove with Undo                                                                                                                                                                                                                     |                                                                                                    |
| `…/integrate`                 | Endpoint + copy, inactive banner, HTML+JS and plain HTML snippets (escaped, honeypot included), test-submit from the browser with no credentials, 422 → fields, allowed-domain warning, "Simulate a bot"                                                                                                                          | Client component calling `NEXT_PUBLIC_BACKEND_PUBLIC_URL`                                          |
| `/exports`                    | All recent exports: form name, filter summary, status/rows, expiry, Download / Try again; polling every 2 s → 10 s after 30 s, paused when hidden                                                                                                                                                                                 |                                                                                                    |
| `/account`                    | Profile (email-change warning), change password (stays signed in), delete account (password + typed email)                                                                                                                                                                                                                        |                                                                                                    |

Cross-cutting: toasts on every mutation, shared confirm dialog, `error.tsx` / `not-found.tsx` for 403/404, loading skeletons (`loading.tsx` + Suspense), dark mode (`next-themes`), forms disabled until hydration (avoids passwords in the URL on a pre-hydration native submit), WCAG 2.1 AA.

## 7. Milestones

0. ✅ **Contract & docs** (done 2026-10-02). [`docs/prds/`](docs/prds/README.md) adapts the Nuxt PRDs: Next.js mechanisms, "The Backend" instead of Laravel, and the Nuxt build's lessons written into the requirements (flagged "Lesson from Nuxt"). [`docs/backend-contract.md`](docs/backend-contract.md) is the checklist a replacement backend must meet. Writing it found two harmless spec inaccuracies: create endpoints documented as 200 but returning 201, and schema `rules` documented as array-only. It also found that entry updates are documented as `PUT` only, so this dashboard uses `PUT` (the Nuxt one sends `PATCH`).
1. ✅ **Scaffold** (done 2026-10-02). Next.js 16.3.8 (React 19.2, App Router, `typedRoutes`), TypeScript 5 strict (plus `noUncheckedIndexedAccess`), Tailwind 4, shadcn/ui (Radix, Nova preset) with zinc/indigo theme tokens, ESLint 9 + Prettier, Vitest (`unit`, `component` and `contract` projects), Playwright, MSW 3. `pnpm api:types` → `types/api.d.ts`; `types/models.ts` aliases with type tests. `lib/env.ts` validates server config with zod, and `instrumentation-node.ts` exits at startup with the list of problems (production also requires `REDIS_URL`). `.env.example`, `pnpm check`.
   - **Contract suite started:** `pnpm test:contract` checks the spec's endpoints, guest 401s, login/forgot-password/submission error shapes, and (with `E2E_CREATE_USER_CMD`) login, pagination, `per_page` bounds, refresh invalidating the old token, and account deletion. 13 checks pass against the reference Backend. Error bodies are matched loosely, because the reference Backend adds a trace in debug mode.
   - **Test users:** only creation is backend-specific (`E2E_CREATE_USER_CMD` with `{name}`/`{email}`/`{password}` placeholders); tests delete users through `DELETE /v1/auth/me`, so `E2E_DELETE_USER_CMD` was dropped.
   - **Findings:** shadcn 4's `cn` helper comes from shadcn's own `cn` package (it replaces `clsx` + `tailwind-merge`). MSW 3 renamed `onUnhandledRequest` to `onUnhandledFrame`; under the old name the option is silently ignored. Next.js compiles `instrumentation.ts` for Edge too, so Node-only startup code is in `instrumentation-node.ts`.
   - **Tests:** 22 unit and component tests, 13 contract checks, 1 Playwright smoke test. `pnpm build` passes.
   - **Not done here:** `dev:mock` and the MSW handlers come with milestone 2's auth flow. A development Redis (8, no persistence, localhost only) runs from `compose.yaml` with `pnpm services:up` (added 2026-10-02).
2. ✅ **Backend boundary, auth and BFF** (built 2026-10-02).
   - **Backend boundary** (`lib/backend/`): typed `openapi-fetch` client with the forwarded client IP, `login`/`currentUser`/`refreshToken`/`logout`, `BackendError`, and `renderCall` for Server Components (redirects to login on a 401, never refreshes).
   - **Session** (`lib/session/`): iron-session `sealData` cookie `form_handler_session` (`HttpOnly`, `SameSite=Lax`, `Secure` in production, `maxAge` until `refreshableUntil`). `resolveSessionToken` decides use/refresh/ended/unavailable; `withBackendToken` refreshes and retries once on a 401 in route handlers.
   - **Refresh coordinator:** a lock and a sealed 60 s result per token hash, in Redis (`SET NX PX`, compare-and-delete release) or memory. Redis commands wait for the first connection but time out after a second, so an outage answers 503 fast and keeps the session.
   - **`proxy.ts`:** guests to `/login?next=…`; refreshes before every page render and passes the new cookie both to the render (request header override) and to the browser; ended sessions to `/login?reason=expired&next=…`.
   - **Routes:** `/api/backend/**` → `{BACKEND_API_URL}/v1/**` (refuses `auth/*`, `webhooks/*` and dot segments; Next.js decodes `%2e`/`%2f` before the check). `/api/auth/` login, logout, me, forgot-password, reset-password.
   - **UI:** login, forgot and reset pages (forms disabled until hydration; 422s on fields), the dashboard layout with shadcn's sidebar (collapsible, a sheet on phones), the user menu with theme toggle and log out, placeholder Forms/Exports/Account pages (Account loads the user from The Backend while rendering), error and not-found pages. Login notices use `?reason=expired|signed-out|password-reset|deleted`.
   - **Mock backend:** `tests/mocks/backend/` implements the auth contract (tokens with lifetime and refresh window, invalidation on refresh and logout), the forms list envelope, and a mock-only `POST /__mock/users`. `pnpm mock:backend` serves it on :8010 (seeded `demo@example.com` / `password`); `pnpm dev:mock` runs it with the dashboard, overriding `.env` where it would point elsewhere (an empty `REDIS_URL` counts as unset, so the memory store is used). `pnpm api:types` also saves `types/openapi.json`, which the mock serves.
   - **Tests:** 69 unit and component tests (plus 2 Redis tests when `REDIS_URL` is set), 13 contract checks passing against both the reference Backend and the mock, and 13 Playwright auth tests passing against both (Redis with the reference Backend, memory with the mock). Playwright starts its own server on :3100 with `AUTH_REFRESH_AHEAD_SECONDS=4000`, so every request refreshes, and creates and deletes its own user, so `E2E_EMAIL`/`E2E_PASSWORD` were dropped.
   - **Checked by hand:** Redis stopped mid-session gives 503 in 0.4 s and the session survives; `next start` sets a `Secure` cookie and Redis holds only hashed keys.
   - **Fixes found while building:** the in-memory store's `setIfAbsent` awaited between check and set, so concurrent callers all took the lock (now synchronous). shadcn's `use-mobile` hook set state in an effect (now `useSyncExternalStore`).
   - **Not verified end to end:** the emailed reset link (needs a real reset email), and the refresh window ending (covered by `tokenAction` unit tests).
3. ✅ **Forms** (built 2026-10-02). List, create (templates), header/tabs, settings, activate, duplicate, delete/Undo. `useListQuery` and `DataTable` built here for reuse.
   - **Data layer:** TanStack Query 5 (`lib/query-client.ts`, `lib/query-keys.ts`), with the providers (query client, nuqs, theme, tooltips, sonner) in `app/providers.tsx`. Server Components fetch through `lib/backend/forms.ts` and seed a per-request query client that `HydrationBoundary` passes down, so first views don't show a loading state. Browser calls are in `lib/forms/queries.ts`; `hooks/use-form-actions.ts` holds activate (optimistic), duplicate and delete with Undo for the list, the header and the Settings tab.
   - **Lists:** `lib/list-query.ts` (parse/serialise, ported from Nuxt) + `lib/backend/query.ts` (the contract's `page`/`per_page`/`sort`/`filter[…]`) + `hooks/use-list-query.ts` (nuqs, `history: push`, page size remembered in `localStorage`). `components/shared/data-table.tsx` uses **TanStack Table 9** (`useTable` + `tableFeatures`; v8's `useReactTable` is gone), with sorting and pagination left to The Backend.
   - **Form pages:** `/forms/new`, and `/forms/[formId]/layout.tsx`, which fetches the form (cached per request with React `cache`, shared with `generateMetadata`) and renders the header and tab links. Settings is built; Entries, Fields, Notifications and Integrate are placeholders until their milestones.
   - **403:** `forbidden()` with `forbidden.tsx`, behind Next's experimental `authInterrupts` flag, instead of `error.tsx`: in production `error.tsx` only gets a digest, so it can't tell a 403 from other errors. Missing forms use `notFound()`. Both have `forms/`-level files, so they render inside the dashboard shell, and answer 404/403.
   - **Unsaved changes:** `useUnsavedChanges` covers `beforeunload` and in-app link clicks (caught in the capture phase, before Next's `Link`). The App Router has no navigation events to cancel, so browser back/forward isn't guarded.
   - **Mock backend:** forms CRUD, list sort/filter, soft delete/restore, duplicate, settings validation (unknown keys, domains per index, honeypot generation and clash), and 403 for other users' forms.
   - **Contract suite:** 10 forms checks added (23 in total). All pass against the mock and the reference Backend.
   - **Tests:** 110 unit and component tests (plus 2 Redis tests when `REDIS_URL` is set). 25 Playwright tests (13 auth, 12 forms) pass against the reference Backend with Redis. Against the mock, 24 pass; the entry-counts test needs public submissions and entries, which the mock gets in milestones 4–5.
   - **Backend fix found by the contract suite:** `POST /v1/forms` answered `active: null` for a new form (the model didn't load the column's database default after `create()`). Fixed in The Backend on 2026-10-02. The dashboard never cached the create response, so it wasn't affected.
   - **Contract clarified:** `settings` is `null` on a form whose settings were never sent; once sent, every key is present (`docs/backend-contract.md`).
   - **Known noise in dev:** sonner flushes toasts with `flushSync` in a timer, which React warns about when that timer lands mid-render; next-themes' inline script triggers a React warning on the 404/403 pages. Neither affects behaviour.
   - **Server Actions (FR-6 open question):** not adopted. Optimistic updates, Undo and 422 mapping all worked through the proxy without special cases.
4. **Fields and Integrate.** Schema builder, snippets, test-submit.
5. **Entries.** List, tabs, detail slide-over, bulk actions, trash, spam-check polling.
6. **Exports.** Export CSV, popover, `/exports`, polling, fresh-link download, 409/410 handling.
7. **Notifications.**
8. **Account.**
9. **Polish.** Accessibility scan (light/dark, 375 px), journey test, empty/error/loading audit, README with deploy notes.
10. **Backend independence check.** Run the full e2e suite against the MSW mock backend as well as The Backend; document how to point the app at a new backend.

## 8. Testing

- **Unit (Vitest):** `lib/` helpers ported from the Nuxt project's tested `app/utils` (schema serialisation, entries tabs/spam state, export polling, snippets, settings diffing), plus token timing, the refresh coordinator, proxy path rules, `BackendError` → field mapping, and the `models.ts` type guards. Port the Nuxt unit cases as the starting test list.
- **Contract (`tests/contract/`):** a small suite that runs against any `BACKEND_API_URL` and checks the conventions in §2: login/refresh/logout semantics (old token rejected after refresh), pagination envelope, 422 shape, `per_page` bounds, sort/filter syntax, the schema list round-trip, public submit `{redirect, message}`, export lifecycle statuses. This is the gate for "works with any backend".
- **Mock backend:** MSW handlers typed from `api.d.ts`, with in-memory state, used by component tests and `pnpm dev:mock`. Proves the UI has no hidden dependency on Laravel behaviour, and lets frontend work proceed with The Backend offline.
- **E2E (Playwright):** the Nuxt project's flows (≈58 tests: auth, forms, fields/integrate, entries, exports, notifications, account, accessibility, journey) against a running Backend with its queue worker running (exports, spam checks and user-agent parsing are queued there). User provisioning only through `E2E_CREATE_USER_CMD` / `E2E_DELETE_USER_CMD`.
- **CI:** lint, typecheck, unit and contract-against-mock on every push; e2e in a job that boots The Backend and a Redis service.

## 9. Risks

| Risk                                                                             | Mitigation                                                                                                                                                       |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Refresh invalidates the old token, and Server Components can't persist a new one | Refresh only in `proxy.ts` and route handlers; coordinator with 60 s reuse; e2e with `AUTH_REFRESH_AHEAD_SECONDS` above the token TTL so every request refreshes |
| Concurrent refreshes across instances double-refresh and sign users out          | Redis-backed coordinator; a unit test runs two coordinators on one store and checks a single refresh call                                                        |
| Redis unavailable                                                                | Fail closed for that request (503 with a retry toast), never refresh without the lock                                                                            |
| Signed export links pointing at an internal host                                 | Deployment requirement in §4; e2e checks the link host                                                                                                           |
| "Same API design" drifting between backends                                      | Contract suite (§8) + `docs/backend-contract.md`; adapters confined to `lib/backend/`                                                                            |
| Rule syntax is The Backend's validation language                                 | Treated as part of the contract; presets limited to the documented rules; free text passed through unchanged                                                     |

## 10. Decisions (2026-10-02)

1. **Export index:** no form filter or form name will be added. The Entries popover filters the most recent exports client-side, and `/exports` joins form names from the forms list, as in the Nuxt app.
2. **Email verification:** not planned. `email_verified_at` is shown nowhere beyond the email-change warning.
3. **Refresh coordinator:** Redis (§4). The Next app can therefore run on serverless or several instances.
4. **Nuxt dashboard:** kept alongside this one. Both are maintained, and the PRDs exist in each project.
5. **Spec quirks:** fixed in The Backend's spec on 2026-10-02 (§2); no type overrides needed.
