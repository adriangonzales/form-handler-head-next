# PRD: App Shell & Architecture

**Status:** Partly built. Milestone 1 (2026-10-02): configuration (FR-1), generated types (FR-2), tooling. Milestone 2 (2026-10-02): the backend boundary (FR-3), proxy (FR-4, FR-5), layouts and navigation (FR-7), validation errors (FR-12), basic error pages (FR-13), and the mock backend's auth endpoints with the contract suite passing against it (FR-15). Milestone 3 (2026-10-02): TanStack Query data fetching with server prefetch (FR-6), form tabs (FR-8), toasts with Undo (FR-10), the 403 page (FR-13), and the mock backend's form endpoints. Milestone 5 (2026-10-02): `useConfirm` for permanent deletes (FR-11), and row selection in `DataTable`. Planned: polish (9), and the full mock-backend run (10)

## 1. Summary

This PRD covers the foundation every feature builds on:

- the **backend boundary**: the one place that knows how to talk to The Backend;
- the Next.js server that sits between the browser and The Backend;
- how configuration reaches it;
- the generated API types;
- the page chrome (layouts, navigation);
- the behaviour every screen shares: loading, errors, toasts, confirmation of destructive actions, and mapping validation errors onto fields;
- the mock backend and contract tests that keep the dashboard independent of any one backend.

## 2. Users

- **Account holder:** uses every screen.
- **Developer:** runs, configures and extends the app, and may point it at a different backend.

## 3. Goals

- Keep API credentials out of browser JavaScript.
- Make every API call typed against the live OpenAPI spec, so API changes surface as type errors.
- Give every screen the same, predictable feedback for loading, success, validation errors and failures.
- Make swapping The Backend a matter of configuration, provided the new backend meets [the contract](../backend-contract.md).

## 4. Functional requirements

**FR-1 Configuration from environment.**

- The server reads `BACKEND_API_URL` (The Backend's API base, server-only), `BACKEND_REFRESH_WINDOW_SECONDS`, `AUTH_REFRESH_AHEAD_SECONDS`, `SESSION_SECRET` and `REDIS_URL` from the environment. The browser gets `NEXT_PUBLIC_BACKEND_PUBLIC_URL` (the base shown in embed snippets and used by the test-submit tool) and `NEXT_PUBLIC_PASSWORD_REQUIREMENTS`.
- Server-only values are read at request time through one typed, zod-validated `lib/env.ts`, so a production build can be configured at runtime. The app fails to start with a clear message if a required value is missing or malformed (for example `SESSION_SECRET` under 32 characters).
- `NEXT_PUBLIC_*` values are inlined at build time, as Next.js requires. The README says so, because changing them needs a rebuild.
- `.env.example` documents every variable, including the test-only ones (`E2E_CREATE_USER_CMD`, `E2E_PORT`).
- No variable is named after a backend framework.

**FR-2 Generated API types.**

- `pnpm api:types` loads `.env` and writes `types/api.d.ts`. It fetches the spec from `BACKEND_SPEC_URL`, or derives it from `BACKEND_API_URL` (`…/api` → `…/docs/api.json`).
- `types/models.ts` gives the API types short names (`Form`, `FormListItem`, `FormEntry`, `FormEntryExport`, `FormSchemaBody`, …) and adds the `Paginated<T>` and `ValidationErrorBody` shapes.
- `tests/unit/models.test.ts` asserts the shapes the dashboard depends on, ported from the Nuxt project's type tests (including the four spec fixes of 2026-10-02), so a regenerated spec that regresses fails `pnpm typecheck`.

**FR-3 Backend boundary.**

- Everything that knows The Backend's conventions lives in `lib/backend/`, marked `import 'server-only'`:
  - `client.ts`: an `openapi-fetch` client built from `BACKEND_API_URL`, adding the bearer token and the forwarded headers (FR-5);
  - `auth.ts`: login, refresh, logout and me, returning a normalised `TokenSet { token, expiresAt }` and rejecting a response without a string token;
  - `errors.ts`: turns any non-2xx response into a `BackendError { status, message, fieldErrors, retryAfter }`;
  - `pagination.ts` and `query.ts`: read the `links`/`meta` envelope, and write `sort` and `filter[…]` query strings.
- Outside `lib/backend/`, code uses the aliases in `types/models.ts` and never imports the generated `paths` directly. A backend with an equivalent but different convention is adapted here, and nowhere else.

**FR-4 Authenticated API proxy.**

- `app/api/backend/[...path]/route.ts` forwards any `/api/backend/**` request (method, query, JSON body) to `{BACKEND_API_URL}/v1/**` with `Authorization: Bearer` taken from the session. The API version lives here only, so client code calls `/api/backend/forms`, not `/api/backend/v1/forms`.
- It returns The Backend's status code and JSON body unchanged, so 401/403/404/409/410/422/429 reach the page as The Backend sent them, along with `Retry-After`.
- Token refresh and session expiry rules are in [Authentication & Session](authentication-and-session.md) FR-5 and FR-6.
- Requests without a session get 401 without calling The Backend.
- **Refused paths** (404 without calling The Backend): `auth/*` (handled by dedicated routes, so the proxy can't bypass them), `webhooks/*` (backend-to-provider only), and any path with `.` or `..` segments, checked after percent-decoding.
- **Lesson from Nuxt:** the path checks run on the decoded path; an encoded `%2e%2e` otherwise slips through.

**FR-5 The Backend base must be the public origin.**

- The proxy calls The Backend through its public URL, because The Backend builds signed export links from the host it sees on the request ([Entry Exports](entry-exports.md) NFR-1).
- If production routes server-to-server traffic through an internal address, the proxy sends `X-Forwarded-Host` and `X-Forwarded-Proto` instead, and The Backend must be configured to trust them from the Next.js server. This is a deployment requirement on any backend, documented in [the contract](../backend-contract.md).
- The proxy also sends the browser's IP in `X-Forwarded-For` ([Authentication & Session](authentication-and-session.md) NFR-5).

**FR-6 Data fetching.**

- Pages are Server Components. They read the session and route params, prefetch the first page of data through `lib/backend` into a TanStack Query client, and pass it down with `HydrationBoundary`. The first view never shows a loading state.
- Client components read and write through `/api/backend/**` with TanStack Query, via `lib/api-client.ts`. It throws `BackendError` for non-2xx responses, and on a 401 sends the user to `/login?next=<current path>`.
- Query keys come from one factory (`lib/query-keys.ts`). Mutations invalidate the keys they affect, so lists and counts stay current without manual refreshes.
- Server Components never refresh tokens or set cookies ([Authentication & Session](authentication-and-session.md) FR-5).
- API mutations go through the proxy, not Server Actions, so error handling, 401 handling and optimistic updates work the same way everywhere. Revisit after milestone 3.

**FR-7 Layouts and navigation.**

- `(auth)` layout: a centred card for login, forgot-password and reset-password.
- `(dashboard)` layout:
  - a sidebar with **Forms**, **Exports** (with a badge while any export is in progress; see [Entry Exports](entry-exports.md) FR-7) and **Account**;
  - a header with the signed-in user's name and a **Log out** action;
  - the colour-mode toggle;
  - a sidebar that collapses into a sheet at mobile widths.
- `/` redirects to `/forms`.

**FR-8 Form tabs.** `/forms/[formId]` has the tabs **Entries** (default), **Fields**, **Settings**, **Notifications** and **Integrate**. Each tab is its own route under a shared `[formId]/layout.tsx`, so it can be linked to and survives a reload. The form's name and Active switch stay visible above the tabs.

**FR-9 Loading states.**

- The first render of each page has its data (FR-6). Route segments have `loading.tsx` skeletons for navigations that aren't prefetched.
- After that, tables show a loading bar while refetching, and the entry slide-over (when opened from a link) and the Exports popover show skeletons.
- Buttons that trigger a change show a loading state and are disabled until the request settles, which prevents double submission.

**FR-10 Toasts.**

- Every successful change shows a short success toast (sonner).
- Failures other than 422 show an error toast with The Backend's `message`.
- Destructive actions that can be undone (deleting a form, entry or recipient) offer **Undo** in the toast, which calls the matching `restore` endpoint.

**FR-11 Confirmation.** Actions that can't be undone use a shared confirmation (`useConfirm` in `components/shared/confirm-dialog.tsx`, an `AlertDialog`) that names what will be lost: permanently deleting entries, deleting the account. Deletes that can be undone (FR-10) don't ask for confirmation.

**FR-12 Validation errors.** `lib/form-errors.ts` maps a 422 `BackendError` onto react-hook-form fields with `setError`, including nested paths such as `settings.honeypot_name` and `ids.3`. Errors with no matching field go in an alert at the top of the form.

**FR-13 Error pages.**

- `not-found.tsx` renders 404 ("Not found"). A 403 renders "You don't have access to this" through `forbidden.tsx`. `error.tsx` renders a generic error with a way back to `/forms`. `global-error.tsx` covers the root layout.
- Server Components translate a `BackendError` 404 into `notFound()` and a 403 into `forbidden()`.
- **As built (milestone 3):** `forbidden()` needs Next's experimental `authInterrupts` flag. It's used because `error.tsx` only receives a digest in production, so it can't tell a 403 from any other error. `app/(dashboard)/forms/` has its own `not-found.tsx` and `forbidden.tsx`, so a missing or foreign form renders inside the dashboard shell.
- A 401 at any point sends the user to `/login?next=<current path>`.

**FR-14 Rate limiting.** A 429 shows The Backend's message, without retrying automatically.

**FR-15 Mock backend and contract tests.**

- `tests/mocks/` has MSW handlers for every endpoint the dashboard uses, typed from `types/api.d.ts`, with in-memory state and seed data. They follow [the contract](../backend-contract.md), including token refresh invalidating the old token, pagination, 422 shapes, and the export lifecycle.
- Component tests use the mock. `pnpm dev:mock` runs the dashboard against it, so frontend work can continue with The Backend offline.
- `tests/contract/` checks the contract's conventions against any `BACKEND_API_URL`. It runs against the mock on every push, and against The Backend in the e2e job. A new backend is ready for this dashboard when it passes.
- Milestone 10 runs the Playwright suite against the mock as well as The Backend.

## 5. Non-functional requirements

- **NFR-1 Security:**
  - The access token never appears in browser-visible responses, `document.cookie`, the RSC payload, or client JavaScript.
  - `lib/backend/` and `lib/session/` can't be imported by client components (`server-only`).
  - Submitted entry data is always rendered as text, never with `dangerouslySetInnerHTML`. See [Entries](entries.md) NFR-1.
- **NFR-2 Typing:** strict TypeScript. `pnpm typecheck` covers `app/`, `components/`, `hooks/`, `lib/`, `types/` and `tests/`.
- **NFR-3 Quality gate:** `pnpm check` (lint, Prettier check, typecheck, unit tests) passes on every change.
- **NFR-4 Accessibility:**
  - Every interactive control can be reached and operated with the keyboard and has an accessible name.
  - Focus moves into dialogs and returns to the trigger when they close.
  - Colour isn't the only signal for state (read/unread, spam, errors).
  - Text meets WCAG AA contrast in light and dark mode. **Lesson from Nuxt:** the UI library's default muted text, placeholders and subtle badges failed contrast; check the shadcn theme tokens the same way and adjust them in `globals.css`.
  - Checked by `tests/e2e/accessibility.spec.ts`: an axe scan (WCAG 2.1 A/AA) of every screen in both modes and at 375 px, keyboard-only navigation of the layout, and dialog focus. `<html>` has a `lang`.
- **NFR-5 Responsiveness:** usable down to 375 px wide. Wide tables scroll horizontally inside their container, never the whole page.
- **NFR-6 Theming:** light and dark mode with `next-themes`, without a flash of the wrong theme on load. Primary colour indigo, neutral zinc, to match the Nuxt dashboard.
- **NFR-7 Independence:** no file outside `lib/backend/`, `.env.example` and the README names a backend framework.

## 6. Acceptance criteria

- **AC-1:** `pnpm dev` serves the app on :3000, `pnpm check` passes, and `pnpm api:types` regenerates the types from the URL configured in `.env`.
- **AC-2:** a 422 from any form puts each error on its field; a 404 shows the not-found page; a 401 sends the user to `/login` with a `next` back to the page.
- **AC-3:** the dashboard layout works at 375 px and with the keyboard alone.
- **AC-4:** `pnpm dev:mock` runs the whole dashboard with The Backend stopped.
- **AC-5:** `pnpm test:contract` passes against the mock and against The Backend.
- **AC-6:** the proxy refuses `auth/login`, `webhooks/x`, `forms/%2e%2e/x` and `forms/../x` without calling The Backend.

## 7. API dependencies

- Errors use the contract's shapes: 422 `{message, errors}`, and `{message}` for 401/403/404/409/410/429.
- Every response is JSON, including errors. Guests are never redirected (_Backend Auth FR-3_).
- The OpenAPI spec is served at a URL the dashboard can fetch at build time.

## 8. Open questions

1. Should mutations move to Server Actions after milestone 3, once the proxy-based pattern has been used in anger? **Milestone 3 finding:** optimistic updates, Undo toasts and 422 mapping all worked through the proxy without special cases, so there's no reason to switch yet.
