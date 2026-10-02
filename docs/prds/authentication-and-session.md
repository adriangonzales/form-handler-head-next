# PRD: Authentication & Session

**Status:** Built (milestone 2, 2026-10-02). The emailed reset link hasn't been verified end to end (AC-6) · **Owner area:** `proxy.ts`, `lib/session/*` (`session.ts`, `session-token.ts`, `server.ts`, `coordinator.ts`, `refresh-coordinator.ts`, `refresh-store.ts`, `redis-refresh-store.ts`, `token-action.ts`), `lib/backend/auth.ts`, `lib/backend/render.ts`, `app/api/auth/*/route.ts`, `app/api/backend/[...path]/route.ts`, `app/(auth)/*`, `components/auth/*`, `hooks/use-hydrated.ts`, iron-session, ioredis

## 1. Summary

Account holders sign in with email and password. The Next.js server exchanges those credentials for an access token from The Backend and keeps it in a sealed, httpOnly session cookie that browser JavaScript can't read. It attaches the token to every proxied call and refreshes it before it expires. Refreshes are coordinated through Redis, so they never overlap, however many server instances are running. The session ends when the user logs out, when The Backend's refresh window runs out, or when the token is revoked by a password change.

## 2. Users

- **Account holder:** signs in, stays signed in across reloads and tabs, signs out, recovers a forgotten password.
- **Operator:** creates accounts with The Backend's own tooling. There is no sign-up in the dashboard.

## 3. Goals

- No credential that can be used against The Backend is ever exposed to browser JavaScript.
- Users aren't interrupted while the session is valid: refresh happens on the server, without the user noticing.
- When a session can't continue, the user lands on the login page with a clear reason, and returns to where they were after signing in.

## 4. Functional requirements

**FR-1 Log in.**

- `/login` has email and password fields. On submit, `POST /api/auth/login` calls The Backend's `POST /v1/auth/login`, then `GET /v1/auth/me`.
- It stores `{ user, token, expiresAt, refreshableUntil }` in the iron-session cookie:
  - `expiresAt` is now plus The Backend's `expires_in`;
  - `refreshableUntil` is login time plus `BACKEND_REFRESH_WINDOW_SECONDS`.
- On success the user goes to the `next` query parameter if it's a same-site path (NFR-3), and to `/forms` otherwise.
- **Errors:**
  - 422 shows The Backend's message on the email field (for example "These credentials do not match our records.");
  - 429 shows the throttle message, which says how many seconds remain.
- The page says that accounts are created by an administrator. There's no sign-up link.

**FR-2 Current user.** `GET /api/auth/me` returns the session's user (never the token). The dashboard layout reads the user on the server and shows the name. The user is reloaded from The Backend after a profile update ([Account](account.md) FR-1).

**FR-3 Log out.**

- **Log out** calls `POST /api/auth/logout`. That calls The Backend's `POST /v1/auth/logout` to invalidate the token, then destroys the session, whatever The Backend returned.
- The user lands on `/login`. Other open tabs find out on their next request (401 → login).

**FR-4 Route protection.**

- `proxy.ts` sends unauthenticated visitors to `/login?next=<path>` from every route except `/login`, `/forgot-password`, `/reset-password`, and static assets. The check runs before rendering, so protected pages are never rendered for guests.
- Signed-in users who visit `/login` go to `/forms`.
- The dashboard layout checks the session again on the server (defence in depth), because `proxy.ts` matching is configured by pattern and a missed pattern must not expose a page.

**FR-5 Token refresh.**

Next.js-specific constraint: **Server Components can't set cookies.** A refresh during a render couldn't be saved, and because refreshing invalidates the old token, the next request would then fail. So refreshes only happen where cookies can be written:

- **Before rendering (`proxy.ts`):** on every dashboard navigation, if `expiresAt` is less than `AUTH_REFRESH_AHEAD_SECONDS` (default 120) away, it refreshes and writes the new cookie on the request and the response, so Server Components rendering that request read the fresh token.
- **In the proxy route (`/api/backend/**`):** the same check before forwarding. After a 401 from The Backend, it refreshes once and retries the original request once. If the refresh or the retry fails, it destroys the session and returns 401.
- **In the auth route handlers** that call The Backend with the token (`me`, `password`, account deletion): the same refresh-and-retry-once rule, through one shared `withBackendToken` helper.
- Server Components never refresh. If a token turns out to be invalid during a render anyway, the render redirects to `/login?next=…`.

Refreshing invalidates the old token, so refreshes must never overlap — across requests, browser tabs, and server instances:

- `RefreshCoordinator` takes a Redis lock per old token (`SET key NX PX`, 10 s), keyed by a SHA-256 hash of the token, never the token itself (`form-handler:refresh:lock:{hash}`). The request holding the lock refreshes; others poll for its result. Only the lock's owner releases it (a compare-and-delete script).
- The result (the new token set, encrypted with `SESSION_SECRET`) is kept under the old token's hash for 60 s. Requests still carrying the old token in that time reuse the result instead of sending the invalidated token, and save the new token to their own cookie. This covers parallel requests from one page, a browser that hasn't received the new cookie yet, and several server instances.
- **Redis unavailable:** fail closed. Commands time out after a second, so the proxy route and the auth route handlers answer 503 ("Service temporarily unavailable. Please try again.") within about that, the session is kept, and no refresh happens without the lock. A page navigation renders with the current token instead of failing, since it stays valid for `AUTH_REFRESH_AHEAD_SECONDS`. **Lesson from this build:** `ioredis` with its offline queue turned off fails every command sent before the first connection completes, so each server's first refresh answered 503. The queue stays on, bounded by `commandTimeout`.
- **Without `REDIS_URL`** (unit tests, `pnpm dev:mock`, and optional in local dev) an in-memory store with the same interface is used. Production refuses to start without `REDIS_URL`.
- A refresh that fails because The Backend is unreachable returns 502 and keeps the session. Only a 401 from The Backend ends it.
- **Lesson from Nuxt:** the 60 s reuse window is needed, not just the lock. Without it, a request that started with the old cookie just after another request refreshed sends an invalidated token and signs the user out.

**FR-6 Session expiry.**

- The session cookie's `maxAge` equals The Backend's refresh window (`BACKEND_REFRESH_WINDOW_SECONDS`, 604800 s = 7 days today). Keep it in sync with The Backend's configuration.
- Refreshing doesn't extend `refreshableUntil`, because the contract anchors the refresh window to the original login (_Backend Auth FR-4_).
- After `refreshableUntil`, `proxy.ts` and the proxy route destroy the session without calling The Backend. Navigations redirect to `/login?reason=expired&next=…`, API calls return 401. The login page then says "Your session has expired. Please sign in again."
- The decision ("use", "refresh", or "expired") is one pure function, `tokenAction(session, now)`, unit-tested with a fixed clock.

**FR-7 Revoked tokens.**

- If The Backend rejects a refresh (password changed elsewhere, or reset), the session is destroyed and the login page says the session ended.
- The dashboard can't tell this apart from an expired refresh window, so both show the same message.

**FR-8 Forgot password.**

- `/forgot-password` takes an email and calls `POST /v1/auth/forgot-password` through `POST /api/auth/forgot-password`.
- It always shows The Backend's neutral message ("If an account exists for that email, a password reset link has been sent."), and nothing that reveals whether the account exists.
- 429 shows the throttle message.

**FR-9 Reset password.**

- `/reset-password?token=…&email=…` is the page The Backend's reset email links to. The Backend must be configured to link to this dashboard's `/reset-password` (_Backend Auth FR-12_; see [the contract](../backend-contract.md)). It shows the email read-only, with new password and confirmation fields, and the password requirements text from `NEXT_PUBLIC_PASSWORD_REQUIREMENTS`.
- It calls `POST /v1/auth/reset-password` through `POST /api/auth/reset-password`. On success it goes to `/login?reason=password-reset` with a "Password reset. Sign in with your new password." notice.
- 422 on `email` (invalid or expired token) shows the error with a link back to `/forgot-password`.
- Password-policy errors appear on the password field.
- If `token` or `email` is missing, the page shows "This reset link is incomplete" and the forgot-password link.

## 5. Non-functional requirements

- **NFR-1:** the session cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` in production. The token is never in any client-visible payload, including props passed from Server to Client Components. Only the user resource is exposed.
- **NFR-2:** login, logout, and forgot/reset password are Next.js route handlers. The browser never calls The Backend's auth endpoints directly, and the proxy refuses them (App Shell FR-4).
- **NFR-3:** the `next` parameter only accepts relative paths starting with a single `/` (not `//` or `/\`), so it can't be used as an open redirect.
- **NFR-4:** auth forms are disabled until the page hydrates (`useHydrated`). **Lesson from Nuxt:** before hydration, a native submit would send the fields, including the password, as a GET query string.
- **NFR-5:** the Next.js server forwards the browser's IP to The Backend in `X-Forwarded-For`. The Backend's per-IP login and reset throttles only see it if The Backend trusts the Next.js server as a proxy. Otherwise every user shares the server's limit. The README's deploy notes say so.
- **NFR-6:** Redis keys hold only hashes of tokens, and values are encrypted, so a Redis dump doesn't expose usable tokens. Keys expire after 60 s.

## 6. Acceptance criteria

- **AC-1:** after logging in, a hard reload keeps the user signed in.
- **AC-2:** with `AUTH_REFRESH_AHEAD_SECONDS` set above The Backend's token lifetime (so every request refreshes), the user keeps working across navigations, parallel requests and reloads, and no request fails.
- **AC-3:** firing 10 requests in parallel when the token is about to expire calls `/v1/auth/refresh` exactly once.
- **AC-4:** two server processes sharing one Redis, each receiving requests with the same about-to-expire token, call `/v1/auth/refresh` exactly once between them (unit-tested with two coordinators on one store, and checked once by hand with two `next start` processes).
- **AC-5:** a session past `refreshableUntil` is logged out cleanly with the expiry message (unit-tested with a fixed clock).
- **AC-6:** the reset link from The Backend's email works end to end, and the user can then sign in with the new password.
- **AC-7:** the token doesn't appear in `document.cookie`, the page HTML, the RSC payload, or any `/api/**` response body.
- **AC-8:** with Redis stopped, an API call that needs a refresh returns 503 and the user stays signed in once Redis is back.

## 7. API dependencies

_Backend Auth_ FR-1 (login), FR-2 (throttling), FR-4 (refresh invalidates the old token; the refresh window is measured from the original login), FR-5 (logout), FR-6 (me), FR-8 (revocation), FR-12 (password reset; the reset URL is configurable; throttled to 6/min). Summarised in [the contract](../backend-contract.md) §Auth.

## 8. Gaps

- **No sign-up, email verification or MFA:** The Backend doesn't support them, and email verification isn't planned (decided 2026-10-02).
- **No "log out everywhere":** a user can only revoke other sessions by changing their password.

## 9. Open questions

1. Should the login page offer "remember me"? Today every session lasts up to the full refresh window.
