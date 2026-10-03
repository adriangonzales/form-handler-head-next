# Product Requirements — Form Handler Dashboard (Next.js)

These documents describe the Next.js dashboard for the Headless Form Handler API, referred to throughout as **The Backend**. They were written on 2026-10-02 from [`PLAN.md`](../../PLAN.md) and the PRDs of the sibling Nuxt dashboard (`../form-handler-head-nuxt/docs/prds`), which is built and covers the same features.

They are forward-looking targets, one per milestone. Each PRD's **Status** line says whether it is planned or built. As each milestone is built, update its PRD to describe what was actually built, as the Nuxt project does.

## Product summary

The Backend is headless: it stores forms, accepts public submissions, and alerts recipients, but it has no interface. This dashboard is that interface for account holders. In it they:

- sign in;
- define forms and their fields;
- get the snippet to put a form on their site;
- triage incoming entries and export them;
- choose who gets alerted;
- manage their account.

The feature set matches the Nuxt dashboard. **Both dashboards are maintained** (decided 2026-10-02): a feature or contract change is made in both projects, and in both sets of PRDs.

## Backend independence

The Backend is a Laravel application today (`../form-handler-headless-laravel`), but this dashboard must work with **any server that implements the same API design**. So these PRDs:

- describe The Backend only by its API: paths, payloads, status codes, auth flow and error shapes, as listed in [`../backend-contract.md`](../backend-contract.md);
- never rely on Laravel internals, artisan commands, or Laravel environment variable names. Where a requirement depends on how The Backend is configured (for example its token lifetime, or the URL its reset emails link to), it says what The Backend must do, not how Laravel does it;
- cite The Backend's own PRDs as, for example, _Backend Forms FR-4_. Today those live in `../form-handler-headless-laravel/docs/prds/`, and they describe the reference implementation of the contract.

## Documents

| PRD                                                         | Scope                                                                                                               | Milestone |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------- |
| [App Shell & Architecture](app-shell-and-architecture.md)   | Backend boundary, proxy, configuration, layout, navigation, shared UI behaviour, error handling, API types, tooling | 1, 2, 9   |
| [Authentication & Session](authentication-and-session.md)   | Login, logout, forgot/reset password, the session cookie, token refresh with Redis, route protection                | 2         |
| [Forms](forms.md)                                           | Forms list, create, settings, activate/deactivate, delete/restore, duplicate                                        | 3         |
| [Form Fields & Integration](form-fields-and-integration.md) | Schema builder, embed snippets, test submission                                                                     | 4         |
| [Entries](entries.md)                                       | Entry inbox, filters, detail view, triage, bulk actions, trash                                                      | 5         |
| [Entry Exports](entry-exports.md)                           | Queued CSV export, status polling, signed download, recent exports and the Exports page                             | 6         |
| [Notifications](notifications.md)                           | Email/SMS alert recipients and delivery errors                                                                      | 7         |
| [Account](account.md)                                       | Profile, password change, account deletion                                                                          | 8         |

Milestone 0 (these PRDs and the backend contract) and milestone 9 (polish, accessibility, end-to-end coverage, README) have no PRD of their own. Milestone 10 (running the suite against the mock backend) is covered by [App Shell & Architecture](app-shell-and-architecture.md) FR-15.

## System at a glance

```
Browser ──(sealed session cookie)──▶ Next.js server ─────────(Bearer token)──▶ The Backend /api/v1
   │                                   • proxy.ts              session gate + refresh before render
   │                                   • /api/auth/*           login, logout, me, password, reset
   │                                   • /api/backend/**       authenticated pass-through proxy
   │                                   • Server Components     first-page reads via lib/backend
   │                                   • Redis                 shared refresh coordination
   │
   ├──▶ The Backend directly: public form submissions (test-submit tool)
   └──▶ The Backend directly: signed CSV download links
```

- **Stack:** Next.js (App Router, React 19), shadcn/ui (Tailwind 4), TanStack Query and Table, nuqs, react-hook-form + zod, iron-session, Redis, openapi-typescript + openapi-fetch, Vitest, Playwright, MSW. TypeScript 5 and pnpm 10, both pinned.
- **Auth model:** the access token never reaches browser JavaScript. It lives in a sealed, httpOnly session cookie, and the Next.js server attaches it to API calls and refreshes it.
- **API contract:** types are generated from The Backend's OpenAPI spec (`pnpm api:types`) into `types/api.d.ts`, with short names in `types/models.ts`. The spec's known inaccuracies were fixed in The Backend on 2026-10-02, so no overrides are needed.
- **Identifiers:** forms, entries, notifications, exports and schema fields use ULID strings. Users use integers.
- **Pagination:** list endpoints return 15 items per page by default, with a `links`/`meta` envelope. The forms, entries and exports lists accept `per_page` from 1 to 100; the notifications list is fixed at 15.
- **Spam:** The Backend checks every public submission for spam after storing it, and sends alerts only after that check. Entries can therefore move into Spam shortly after they arrive. `spam_checked_at` records when the check finished, and stays null while it's pending or if it couldn't run.

## Differences from the Nuxt dashboard

The behaviour is the same. These are the mechanisms that differ, and why.

| Concern                  | Nuxt dashboard                             | This dashboard                                                                                                    |
| ------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Session                  | nuxt-auth-utils                            | iron-session                                                                                                      |
| Refresh during a render  | `$api` copies `Set-Cookie` from SSR calls  | Server Components can't set cookies, so `proxy.ts` refreshes before rendering and Server Components never refresh |
| Refresh coordination     | In-memory, per Nitro instance              | Redis, shared by every instance (decided 2026-10-02)                                                              |
| Authenticated proxy path | `/api/v1/**`                               | `/api/backend/**`                                                                                                 |
| Backend-specific code    | `server/utils/laravel.ts`                  | Confined to `lib/backend/` (server-only), named for The Backend rather than Laravel                               |
| Entry detail             | Child route in a slide-over                | Intercepting + parallel route: a slide-over from the list, a full page from a direct link                         |
| List state in the URL    | `useListQuery` composable                  | `useListQuery` hook on nuqs                                                                                       |
| Mock backend             | None                                       | MSW handlers typed from the spec, used by component tests and `pnpm dev:mock`                                     |
| Contract tests           | None                                       | `tests/contract/` runs against any backend URL                                                                    |
| Test user provisioning   | `php artisan user:create` in `E2E_API_DIR` | `E2E_CREATE_USER_CMD`, supplied by the environment; deleted through the API                                       |

## Cross-cutting status

| Capability                                                                                    | Status                                                                                |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| PRDs and backend contract                                                                     | Written (milestone 0, 2026-10-02)                                                     |
| Project scaffold, config from `.env`, generated API types, lint/format/typecheck/test tooling | Built (milestone 1, 2026-10-02)                                                       |
| Backend boundary, login, session, token refresh, route protection, password reset             | Built (milestone 2, 2026-10-02)                                                       |
| Form management                                                                               | Built (milestone 3, 2026-10-02)                                                       |
| Schema builder, embed snippets, test submit                                                   | Built (milestone 4, 2026-10-02)                                                       |
| Entry inbox and triage                                                                        | Built (milestone 5, 2026-10-02)                                                       |
| CSV export                                                                                    | Built (milestone 6, 2026-10-02)                                                       |
| Notification recipients                                                                       | Built (milestone 7, 2026-10-03)                                                       |
| Account self-service                                                                          | Planned (milestone 8)                                                                 |
| Accessibility (WCAG 2.1 AA scan), end-to-end happy path, README                               | Planned (milestone 9)                                                                 |
| Full suite against the mock backend                                                           | Planned (milestone 10)                                                                |
| Sign-up                                                                                       | **Not planned.** The API has no registration; accounts are created by an operator     |
| Email verification, MFA                                                                       | **Not planned** (email verification decided 2026-10-02). The API doesn't support them |

## Conventions used in these PRDs

- **FR-x:** a functional requirement the dashboard must satisfy. Each is the unit to build and test against.
- **NFR-x:** a non-functional requirement (security, performance, accessibility).
- **AC:** acceptance criteria that close the milestone.
- **API dependency:** Backend behaviour the requirement relies on, linked to the contract and to The Backend's PRDs.
- **Gap:** something users would expect that the API doesn't support, so the dashboard can't offer it.
- **Open question:** a product decision that isn't settled.
- **Lesson from Nuxt:** a requirement that differs from the Nuxt PRD's original wording because building the Nuxt dashboard showed the original didn't work. These are written into the requirement, and flagged so the reason isn't lost.
