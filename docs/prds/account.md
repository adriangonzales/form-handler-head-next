# PRD: Account

**Status:** Built (milestone 8, 2026-10-03) · **Owner area:** `app/(dashboard)/account/page.tsx`, `components/account/*` (`profile-form`, `password-form`, `delete-account-dialog`), `lib/account/queries.ts`, `app/api/auth/me/route.ts` (GET, PATCH, DELETE), `app/api/auth/password/route.ts`, `withBackendSession` in `lib/session/server.ts`

## 1. Summary

The **Account** page lets a signed-in user update their name and email, change their password, and permanently delete their account and everything it owns. These calls go through dedicated Next.js route handlers, not the generic proxy, because they change the session as well as calling The Backend. (The proxy refuses `auth/*` paths, so they can't be reached any other way.)

## 2. Users

- **Account holder:** manages their own account. There are no admin features.

## 3. Goals

- Keep profile changes simple, and say plainly what side effects they have.
- A password change must not log the user out of the session they made it from.
- Account deletion is hard to do by accident and impossible to misunderstand.

## 4. Functional requirements

**FR-1 Profile.**

- The page loads the user from The Backend while rendering, so the fields start from what's stored, not from the session's copy.
- Name (max 255) and email (max 255), saved with `PATCH /api/auth/me` → `PATCH /v1/auth/me`. Only changed fields are sent: an unchanged email would still be checked for uniqueness. A change of case only isn't a change. **Save profile** stays disabled until something changed.
- The route handler stores The Backend's answer as the session's user, starting from the session `withBackendSession` returns (so a token refreshed for this call is kept), and the page refreshes the server-rendered layout (`router.refresh()`), so the header and sidebar reflect the change straight away.
- Changing the email shows a notice before saving: "The change is immediate: once you save, sign in with the new address." The Backend also clears the address's verified status (_Backend Auth FR-10_), but email verification isn't planned (decided 2026-10-02), so the notice doesn't mention it.
- A 422 on `email` (already taken) shows on the field.

**FR-2 Change password.**

- Current password, new password and confirmation. `PUT /api/auth/password` calls `PUT /v1/auth/password` and answers 204.
- The browser checks that the confirmation matches and that the new password differs from the current one before sending anything.
- The Backend revokes every token, including the current one, and returns a new one. The route handler stores the new token and `expiresAt` in the session, so the user stays signed in here.
- `refreshableUntil` is reset to now plus the refresh window, because the new token starts a new refresh chain.
- The section says so up front, and the success toast repeats it: other browsers and devices are signed out.
- The fields are cleared after success.
- **Errors:** a wrong current password shows on `current_password`; password-policy failures show on `password` with The Backend's message.
- **Requirements text** comes from `NEXT_PUBLIC_PASSWORD_REQUIREMENTS`, so it can match the policy of whichever backend is configured. For the reference Backend: "at least 12 characters with upper- and lower-case letters, numbers and symbols, and not a known breached password" in production, or 8 characters elsewhere.

**FR-3 Delete account.**

- A danger-zone section lists exactly what's deleted:
  - all forms, including deleted ones;
  - their entries;
  - their notification recipients;
  - their exports.
- It says the deletion is permanent.
- **Delete account…** opens a confirmation dialog that asks for the current password. The confirm button stays disabled until the password is entered and the user types their email (case and surrounding spaces ignored). The dialog's fields are unmounted when it closes, so the password doesn't outlive it.
- The browser sends the password in the body of `DELETE /api/auth/me`. The route handler calls `DELETE /v1/auth/me?password=…`, as the contract requires. On 204 it destroys the session, and the browser does a full load of `/login?reason=deleted` ("Your account has been deleted.") with `location.replace`, so no cached data or exports poller from the deleted account survives, and Back doesn't return to the Account page.
- A wrong password shows a 422 on the password field, and nothing is deleted.

## 5. Non-functional requirements

- **NFR-1:** passwords are only ever sent to Next.js route handlers, over HTTPS in production. They're never logged, never put in a URL by the browser, and never kept in client state after submission.
- **NFR-2:** the route handlers share `withBackendToken`'s logic ([Authentication & Session](authentication-and-session.md) FR-5), so they refresh and retry once on a 401 like the proxy. They use its `withBackendSession` form, which also returns the session the call was made with; the handlers save their changes on top of that one. A 401 from these routes sends the browser to `/login?reason=expired` like the proxy (`sessionRequest` in `lib/api-client.ts`).

## 6. Acceptance criteria

- **AC-1:** change the name, and the header updates without a reload.
- **AC-2:** change the password. This session keeps working; a second browser's session is signed out on its next request.
- **AC-3:** deleting the account with the wrong password changes nothing. With the right one, the user lands on `/login`, and the old credentials no longer work.
- **AC-4:** changing to an email that's taken shows the error on the email field.

The e2e tests for this PRD create throwaway users with `E2E_CREATE_USER_CMD` and delete them through the dashboard's `DELETE /api/auth/me`, so the only backend-specific step is creating a user. All four criteria are covered by `tests/e2e/account.spec.ts`, which passes against the reference Backend and the mock. AC-3 also reloads after the wrong password to show the account is untouched. The contract suite checks the three endpoints themselves (profile changes, a taken email, the password change revoking old tokens and their refresh, the old password no longer signing in).

## 7. API dependencies

_Backend Auth_ FR-10 (profile; changing the email clears verification), FR-11 (password change revokes all tokens and returns a new one), FR-12 (password policy), FR-13 (account deletion and what it removes).

## 8. Gaps

- **No active-sessions list, and no "log out other sessions"** without changing the password.
- **The contract takes the deletion password as a query parameter** (`DELETE /v1/auth/me?password=`), so it can end up in The Backend's access logs. The dashboard keeps it out of browser URLs, but the server-to-server call has to use the query. Accepting it in the body would be safer.
- **Known edge:** a request already in flight with the old token when the password changes gets a 401, and its refresh fails because the token chain was revoked, so that tab is signed out. Rare, because the account page is the only thing making requests at that moment.

## 9. Open questions

None. Whether to show `email_verified_at` was settled by decision 2 in `PLAN.md` §10: it isn't shown.
