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
| Public submit       | `POST /v1/forms/{form}/submissions`, no auth, called from the browser (CORS). Returns `{ data: { redirect, message } }`, never a 3xx. Unknown fields dropped.                                                                                                                                      | `lib/snippets.ts`, test-submit               |
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
├─ hooks/                  useListQuery (nuqs), useUnsavedChanges, useCopy, useNow, useExportsWatcher, useExportActions
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
   - **Tests:** 110 unit and component tests (plus 2 Redis tests when `REDIS_URL` is set). 25 Playwright tests (13 auth, 12 forms) pass against the reference Backend with Redis. Against the mock, 24 passed at the time; the entry-counts test needed public submissions and entries, which the mock got in milestone 4.
   - **Backend fix found by the contract suite:** `POST /v1/forms` answered `active: null` for a new form (the model didn't load the column's database default after `create()`). Fixed in The Backend on 2026-10-02. The dashboard never cached the create response, so it wasn't affected.
   - **Contract clarified:** `settings` is `null` on a form whose settings were never sent; once sent, every key is present (`docs/backend-contract.md`).
   - **Known noise in dev:** sonner flushes toasts with `flushSync` in a timer, which React warns about when that timer lands mid-render; next-themes' inline script triggers a React warning on the 404/403 pages. Neither affects behaviour.
   - **Server Actions (FR-6 open question):** not adopted. Optimistic updates, Undo and 422 mapping all worked through the proxy without special cases.
4. ✅ **Fields and Integrate** (built 2026-10-02). Schema builder, snippets, test-submit.
   - **Pure logic:** `lib/schema/builder.ts` and `lib/snippets.ts`, ported from the Nuxt project with their unit tests. One change: a row's key is its field ID rather than a module-level counter, so server and browser renders agree (the counter caused a hydration mismatch).
   - **Fields tab** (`components/forms/schema-builder.tsx`, `schema-field-row.tsx`): rows with label, input name (follows the label until typed), read-only ULID with copy, rule presets, min/max, one-of and other-rules tags. Reorder by @dnd-kit (pointer and keyboard, with announcements naming the field and position) or move up/down buttons. The browser checks names before saving. A warning appears when entries exist and an input name is renamed or removed. The unsaved-changes guard compares the serialised schema.
   - **Integrate tab** (`integrate-panel.tsx`, `test-submit.tsx`): endpoint with copy, an inactive banner with Turn on, HTML + JavaScript and plain HTML snippets in a `CodeBlock`, and a test form that posts with `credentials: 'omit'`, maps 422s onto fields, warns when this host isn't an allowed domain, fills sample data, and has a "Simulate a bot" honeypot. A success refreshes the form's entry queries and the forms list counts.
   - **Shared:** the domains input became `components/shared/tags-input.tsx`, used for domains, one-of values and other rules. A comma only separates values where the list allows it, since rules like `regex:/a,b/` contain commas.
   - **Mock backend:** public submissions (CORS, inactive 403, `Referer` domain check, honeypot, the preset rules with the reference Backend's messages, unknown fields dropped) and minimal entries (list with `filter[trashed]`, `PUT` of `read_at`/`spam`/`starred`, counts in the forms list). The rest of entries comes with milestone 5.
   - **Contract:** submissions answer `{ data: { redirect, message } }`, not `{ redirect, message }` as this plan and `docs/backend-contract.md` said; both are corrected. A submission check was added (24 checks), passing against the mock and the reference Backend.
   - **Tests:** 138 unit and component tests (plus 2 Redis tests when `REDIS_URL` is set). 34 Playwright tests (13 auth, 12 forms, 9 fields/integrate) pass against both the reference Backend and the mock, including the snippet pasted into a blank signed-out page and keyboard-only reordering.
   - **Finding:** the reference Backend throttles forgot-password per IP, so running the contract suite and the auth e2e tests many times in a row can give a 429 on that check for a few minutes.
5. ✅ **Entries** (built 2026-10-02). List, tabs, detail slide-over, bulk actions, trash, spam-check polling.
   - **Routes:** `entries/layout.tsx` renders `children` and a `@detail` slot. From the list, `@detail/(.)[entryId]` intercepts an entry link into a slide-over (shadcn `Sheet`), and the list stays mounted behind it with its query and scroll position. `@detail/page.tsx` and `default.tsx` return `null`, so closing (a push to the list URL) or a full load clears the slot. A direct link or reload renders `[entryId]/page.tsx` as a full page with a link back to the list.
   - **Previous/next:** in the slide-over only (buttons and `k`/`j`), across page boundaries. On the full page they'd navigate within the entries layout and be intercepted into a slide-over over the full page, so the full page has just "Back to entries".
   - **Shared state without context:** the list and the detail both read the list query from the URL (`useListQuery` / `parseListQuery`) and share the TanStack Query cache. The detail starts from the list's copy of the row (`initialData`) and refetches; in Trash it uses the list's row, because The Backend's show endpoint skips deleted entries.
   - **Logic:** `lib/entries/entries.ts` (ported from Nuxt with its tests), `lib/entries/queries.ts`, `lib/entries/dates.ts` (UTC days ↔ calendar dates), `lib/config.ts` (2-minute check window, 10 s poll), `hooks/use-entry-actions.ts` (optimistic updates that patch every cached copy, delete with Undo, restore, permanent delete, bulk with `affected` and stale-selection handling), `hooks/use-now.ts` (starts from the server's render time, so hydration matches).
   - **Polling:** the list query's `refetchInterval` returns 10 s while any row on the page is checking, and the counts query follows it; an open entry polls itself the same way, and toasts "Moved to Spam" when a check flags it.
   - **Shared UI:** `DataTable` gained row selection (TanStack Table 9's `rowSelectionFeature`), row click and row classes; `useConfirm` (shadcn `AlertDialog`) for permanent deletes; a range calendar (react-day-picker 10) with Apply/Clear.
   - **Mock backend:** the full entries API: list filters, sorts and their 422s, owner-created entries, show, update (submission fields read-only), delete/restore/force, and bulk actions with `affected`.
   - **Contract:** 6 entries checks added (30 in total). They found that the reference Backend answers **409** (not 403) to permanently deleting an entry that isn't in Trash, that bulk returns `{ data: { action, affected } }`, and that owners can add entries with `POST /v1/forms/{form}/entries`; `docs/backend-contract.md` now says so.
   - **Tests:** 161 unit and component tests (plus 2 Redis tests when `REDIS_URL` is set). 45 Playwright tests (13 auth, 12 forms, 9 fields/integrate, 11 entries) pass against the reference Backend and the mock, including hostile payloads rendered as text, previous/next across a page boundary, select all at page size 100, and a direct link opening the full page.
   - **Not done:** Export CSV (milestone 6). AC-9's scroll position is kept by design (the list stays mounted and closing uses `scroll: false`) but isn't asserted by a test.
6. ✅ **Exports** (built 2026-10-02). Export CSV, popover, `/exports`, polling, fresh-link download, expiry handling.
   - **Logic:** `lib/exports/exports.ts` (ported from Nuxt with its tests: parameters from the table's query, normalised comparison for the duplicate warning, filter summaries, poll delays, expiry) and `lib/exports/queries.ts` (API calls, `recentExportsQuery` = the account's 100 newest, and cache helpers that patch, remove or add an export in every cached list).
   - **One poller for the whole dashboard:** `hooks/use-exports-watcher.ts`, mounted once in the dashboard layout (`components/exports/exports-watcher.tsx`). It loads the recent exports, subscribes to the query cache, and gives every in-progress export in any exports list its own timer (2 s, then 10 s after 30 s, paused while the tab is hidden). Trackers survive refetches and page changes and are cleared on unmount. A 404 drops the export from every list. `onExportSettled(id, listener)` lets the Entries tab announce exports it started. The in-progress IDs never pass through React state.
   - **Actions** (`hooks/use-export-actions.ts`): Download re-fetches the export for a fresh signed link and clicks a plain `<a download>`; a 404 or a passed `expires_at` removes it with an "Export again" toast; a not-yet-completed answer goes back into the lists for polling. Try again starts a new export from `parameters`.
   - **UI:** `components/exports/` (`export-status`, `export-actions`, `export-list`, `exports-table`) and `components/entries/export-button.tsx` (Export CSV + Exports popover with this form's rows, in-progress badge, duplicate warning with Export anyway, "Export ready" toast with Download when the popover is closed, "What's in the file?"). The sidebar's Exports link shows a badge while any export is in progress. `/exports` prefetches the page and the form names while rendering (`lib/backend/exports.ts`, `fetchFormNames`); names reload when an export of an unknown form appears, and fall back to the filename.
   - **Mock backend:** exports advance `pending` → `processing` → `completed` over 0.8 s (or `failed` if the form was deleted first), the CSV is written as the reference `WriteEntriesCsv` does it, and downloads use HMAC-signed links valid for 5 minutes with 403/409/410 answers.
   - **Contract:** 5 exports checks added (35 in total): 202 + `Location`, `parameters` echo without `per_page` (`{}` when empty), 24-hour expiry, the index's order and bounds, completion with a token-free signed download (column order, labels, formula escaping), a tampered signature's 403, and deleted forms' exports left out. All pass against the mock and the reference Backend.
   - **Tests:** 175 unit and component tests (plus 2 Redis tests when `REDIS_URL` is set), including the poller under fake timers. 52 Playwright tests (13 auth, 12 forms, 9 fields/integrate, 11 entries, 7 exports) pass against the mock and the reference Backend (with Redis and a queue worker), including the downloaded link's host matching The Backend's public URL (NFR-1). Run straight after the contract suite, one auth test can hit The Backend's auth throttle (6 a minute per IP); it passed on a re-run a minute later.
   - **Findings:** the reference Backend's queue is the database driver, not `sync` as `.env.example` suggests, so exports stay `pending` until `php artisan queue:work` runs. Its queue had a day of unprocessed jobs; it was cleared before the run (2026-10-02). PHP's `fputcsv` also quotes cells containing spaces (`"Full name"`), which the mock copies.
   - **Not done:** AC-2 (a download more than 5 minutes after completion) isn't timed by a test; it follows from Download always re-fetching, which is tested. Deleting an export early stays an open question (the contract has no endpoint).
7. ✅ **Notifications** (built 2026-10-03). Recipient list, add/edit dialog (email or E.164), optimistic Enabled switch, Remove with Undo, delivery-error and SMS badges, help text on when alerts are sent.
   - **Logic:** `lib/notifications/notifications.ts` (ported from Nuxt with its tests: types, the zod schema matching The Backend's rules, `tidyPhoneNumber`, plus `pageFrom` for `?page=`), `lib/notifications/queries.ts` (API calls and `patchCachedNotification`), `lib/backend/notifications.ts` (the page the URL asks for, fetched while rendering), `hooks/use-notification-actions.ts` (Enabled switch with a mutation key so each row knows it's saving; Remove with Undo).
   - **UI:** `components/notifications/recipient-list.tsx` (table, empty state, pagination without a page-size choice, help text with the form's timezone and a Settings link) and `notification-dialog.tsx` (type as a radio group, phone tidied on blur, SMS notice, 422s on fields). `ListPagination`'s rows-per-page choice is now optional.
   - **Stable columns:** the table's columns are built once at module level, with the switch and menu as components (Edit/Remove come from a small context). Columns rebuilt on every render remounted the switch after each refetch and lost keyboard focus. The Entries and Exports tables still rebuild their columns per render; worth checking in milestone 9.
   - **Session fix (`renderCall`):** a render whose call gets a 401 now retries once with the token another request refreshed it to (`RefreshCoordinator.refreshedTo`, which follows up to 3 refreshes and never refreshes itself). Found by reloading while a switch update was in flight: the list refetch refreshed the token `proxy.ts` had just handed the render, and the page went to `/login?reason=expired`. It failed 4 runs out of 4 without the retry, and passes with it.
   - **Mock backend:** recipients CRUD with the reference Backend's validation (`error` and `form_id` refused even as `null`), soft delete/restore, 403 for others' recipients and those of a deleted form, alerts "sent" to enabled email recipients of non-spam public entries (clearing `error`), and mock-only `POST /__mock/notifications/{id}/bounce` and `GET /__mock/alerts`.
   - **Contract:** 5 notifications checks added (40 in total): default `enabled`, the fixed page size, value-by-type validation, `error` refused, update requiring all three fields and refusing `form_id`, soft delete/restore, and 403/404 ownership. All pass against the mock and the reference Backend. The list's order isn't part of the contract, so the checks don't assume one.
   - **Tests:** 189 unit and component tests (plus 2 Redis tests when `REDIS_URL` is set). 58 Playwright tests (13 auth, 12 forms, 9 fields/integrate, 11 entries, 7 exports, 6 notifications) pass against the reference Backend (Redis and a queue worker) and the mock. In one full run against the reference Backend, the revoked-session auth test failed once and then passed in 3 isolated runs, 13/13 in its spec and 58/58 on a full rerun; it doesn't go through `renderCall`'s retry.
   - **Checked by hand:** AC-1 against the reference Backend (log mailer): an enabled recipient was alerted after a public submission; a disabled one wasn't.
8. **Account.**
9. **Polish.** Accessibility scan (light/dark, 375 px), journey test, empty/error/loading audit, README with deploy notes.
10. **Backend independence check.** Run the full e2e suite against the MSW mock backend as well as The Backend; document how to point the app at a new backend.

## 8. Testing

- **Unit (Vitest):** `lib/` helpers ported from the Nuxt project's tested `app/utils` (schema serialisation, entries tabs/spam state, export polling, snippets, settings diffing), plus token timing, the refresh coordinator, proxy path rules, `BackendError` → field mapping, and the `models.ts` type guards. Port the Nuxt unit cases as the starting test list.
- **Contract (`tests/contract/`):** a small suite that runs against any `BACKEND_API_URL` and checks the conventions in §2: login/refresh/logout semantics (old token rejected after refresh), pagination envelope, 422 shape, `per_page` bounds, sort/filter syntax, the schema list round-trip, public submit `{ data: { redirect, message } }`, export lifecycle statuses. This is the gate for "works with any backend".
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
