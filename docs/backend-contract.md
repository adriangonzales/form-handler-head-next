# The Backend contract

This is what any backend must implement for this dashboard to work with it. The reference implementation is the Laravel project in `../form-handler-headless-laravel`; its OpenAPI spec (`/docs/api.json`) is the source of truth for request and response **types**, and this document is the source of truth for **behaviour** the types can't express.

The dashboard isn't tied to the reference implementation. A backend is ready for it when:

1. it serves an OpenAPI 3.1 spec whose types match the reference spec for every endpoint below, so `pnpm api:types` produces compatible types; and
2. `pnpm test:contract` passes against it ([App Shell](prds/app-shell-and-architecture.md) FR-15).

Everything here is a behaviour the dashboard relies on. Each section names the module that relies on it, so that a backend that differs in a small way can be adapted in that one place.

Written 2026-10-02 against spec "Headless Form Handler" 0.0.1.

## Base URL and versioning

- All endpoints live under one API base (for example `https://forms.example.com/api`), configured as `BACKEND_API_URL`, with paths starting `/v1/`.
- The spec is served at a URL the dashboard can fetch (configured as `BACKEND_SPEC_URL`; by default the base with `/api` replaced by `/docs/api.json`).
- Every response, including errors, is JSON. Unauthenticated requests get 401, never a redirect.

## Endpoints the dashboard uses

| Area          | Endpoints                                                                                                                                    | Auth   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Auth          | `POST /v1/auth/login`, `POST /v1/auth/refresh`, `POST /v1/auth/logout`, `GET /v1/auth/me`                                                    | mixed  |
| Password      | `POST /v1/auth/forgot-password`, `POST /v1/auth/reset-password`                                                                              | none   |
| Account       | `PATCH /v1/auth/me`, `PUT /v1/auth/password`, `DELETE /v1/auth/me?password=`                                                                | bearer |
| Forms         | `GET`/`POST /v1/forms`, `GET`/`PUT`/`DELETE /v1/forms/{form}`, `POST /v1/forms/{form}/restore`, `POST /v1/forms/{form}/duplicate`            | bearer |
| Entries       | `GET /v1/forms/{form}/entries`, `POST /v1/forms/{form}/entries/bulk`, `GET`/`PUT`/`DELETE /v1/entries/{entry}`, `POST …/restore`, `DELETE …/force` | bearer |
| Exports       | `POST /v1/forms/{form}/entries/exports`, `GET /v1/entry-exports`, `GET /v1/entry-exports/{export}`, `GET /v1/entry-exports/{export}/download` (signed) | bearer, except download |
| Notifications | `GET`/`POST /v1/forms/{form}/notifications`, `GET`/`PUT`/`DELETE /v1/notifications/{notification}`, `POST …/restore`                        | bearer |
| Submissions   | `POST /v1/forms/{form}/submissions`                                                                                                          | none   |

Not used by the dashboard, and not part of this contract: `POST /v1/forms/{form}/entries` (creating entries through the authenticated API) and `POST /v1/webhooks/postmark/bounces` (the reference implementation's mail provider webhook).

## Auth

_Relied on by `lib/backend/auth.ts`, `lib/session/`._

- **Login** `POST /v1/auth/login` `{email, password}` → 200 `{ access_token: string, token_type: "bearer", expires_in: seconds }`. Wrong credentials → 422 with the message on `email`. Throttled → 429 with `Retry-After`.
- **Bearer tokens.** Every authenticated call sends `Authorization: Bearer <token>`.
- **Refresh** `POST /v1/auth/refresh` with the current, or a recently expired, token → 200 with a new token in the login shape. **The old token stops working immediately.** Refresh is allowed until a fixed window after the original login (7 days in the reference implementation), and a refreshed token keeps the original login time, so the window doesn't slide. Outside the window, or for a revoked token → 401.
- **Logout** `POST /v1/auth/logout` → 204, and the token stops working.
- **Me** `GET /v1/auth/me` → `{ data: User }`.
- **Password change** `PUT /v1/auth/password` `{current_password, password, password_confirmation}` → 200 in the login shape. **Every existing token is revoked**, and the returned token starts a new refresh window.
- **Profile** `PATCH /v1/auth/me` `{name?, email?}` → `{ data: User }`. Changing the email clears `email_verified_at`.
- **Account deletion** `DELETE /v1/auth/me?password=…` → 204, deleting the user and everything they own (forms, including deleted ones, entries, recipients, exports). Wrong password → 422 on `password`.
- **Forgot password** `POST /v1/auth/forgot-password` `{email}` → 200 with the same neutral `message` whether or not the account exists, and even when throttled (6 per minute in the reference implementation).
- **Reset password** `POST /v1/auth/reset-password` `{token, email, password, password_confirmation}` → 200, and every existing token is revoked. Invalid or expired token → 422 on `email`.
- **Reset emails** link to a configurable URL, with `?token=…&email=…` appended. It must be set to this dashboard's `/reset-password`.
- No sign-up endpoint. Accounts are provisioned by the backend's operator.

Configuration the dashboard must mirror: the refresh window (`BACKEND_REFRESH_WINDOW_SECONDS`) and the password policy text (`NEXT_PUBLIC_PASSWORD_REQUIREMENTS`).

## Errors

_Relied on by `lib/backend/errors.ts`, `lib/form-errors.ts`._

| Status | Body                                       | Meaning                                                               |
| ------ | ------------------------------------------ | --------------------------------------------------------------------- |
| 401    | `{message}`                                | Missing, invalid or expired token                                     |
| 403    | `{message}`                                | The resource belongs to someone else; inactive form or domain not allowed on submission; bad export signature |
| 404    | `{message}`                                | Not found, including soft-deleted resources fetched one at a time      |
| 409    | `{message}`                                | Export download not ready                                             |
| 410    | `{message}`                                | Export expired                                                        |
| 422    | `{message, errors: { "path": string[] }}`  | Validation. Paths use dot notation: `settings.honeypot_name`, `schema.2.name`, `ids.3` |
| 429    | `{message}` + `Retry-After` (seconds)      | Throttled                                                             |

## Successful responses

_Relied on by `lib/api-client.ts`._

- Single resources are wrapped: `{ data: Resource }`.
- **Creates return 201** (forms, entries, notifications, duplicates, public submissions); the reference spec documents some of them as 200. Clients must treat any 2xx as success and not depend on 200 vs 201.
- Deletes return 204 with no body.
- Starting an export returns 202 with a `Location` header and the export resource.

## Pagination, sorting and filtering

_Relied on by `lib/backend/pagination.ts`, `lib/backend/query.ts`, `hooks/useListQuery.ts`._

- Lists return `{ data: T[], links: {first, last, prev, next}, meta: {current_page, from, last_page, path, per_page, to, total, links[]} }`.
- `page` (1-based) selects the page. 15 per page by default.
- `per_page` (1–100) on the forms, entries and exports lists. The notifications list is fixed at 15 and ignores it.
- `sort=field` ascending, `sort=-field` descending; ties broken by ID in the same direction. One field only; anything else → 422 on `sort`.
  - Forms: `name`, `created_at`, `updated_at`.
  - Entries: `created_at` (the default, oldest first), `spam_score`.
- Filters use bracket syntax: `filter[key]=value`. Booleans accept `true`/`false`/`1`/`0`.
  - Forms: `filter[active]`.
  - Entries: `filter[read]`, `filter[starred]`, `filter[spam]`, `filter[created_from]` and `filter[created_to]` (inclusive `YYYY-MM-DD`, UTC), `filter[trashed]=with|only`.

## Identifiers and dates

- Forms, entries, notifications, exports and schema fields: lowercase ULID strings. Users: integers.
- Dates: ISO 8601 UTC strings (`2026-01-02T03:04:05.000000Z`), or `null`.

## Forms

_Relied on by `lib/forms/`, `lib/schema/`._

- **Ownership.** A user only ever sees and changes their own forms; another user's form → 403.
- **Create** `POST /v1/forms` `{name, schema?, settings?}`. New forms are **inactive**.
- **Update** `PUT /v1/forms/{form}` requires `name` and `active`; `schema` and `settings` are optional.
- **List items** include `entries_count` (excluding spam and deleted), `unread_entries_count` (excluding spam and deleted) and `spam_entries_count` (excluding deleted). A single form's response doesn't.
- **Delete** is soft; **restore** brings the form back with its entries and recipients. A deleted form returns 404, and its entries 403.
- **Duplicate** copies name, schema and settings into a new, inactive form, without entries or recipients.

### Form schema

- `schema` is `null` or a list of fields `{ id, order, label?, name?, rules? }`:
  - `id`: required, a ULID, unique within the form;
  - `order`: required integer; responses list fields sorted by it;
  - `label`, `name`: optional strings; `name` is the input name and defaults to `id`;
  - `rules`: optional, an array of rule strings or one comma-separated string;
  - any other key → 422.
- **Rule syntax.** Rules use Laravel's validation rule syntax, which the contract adopts as its own. The dashboard's presets need at least `required`, `email`, `numeric`, `url`, `min:N`, `max:N` and `in:a,b,…` to behave as Laravel defines them; other rule strings are passed through unchanged. A backend in another language must implement these rules with the same meaning.

### Form settings

- `settings` keys, all optional and nullable, defaulting when left out; unknown keys → 422: `redirect` (URL), `timezone` (IANA name), `domains` (string[] of bare hostnames, `*.` prefix for subdomains), `message`, `honeypot_enabled` (bool), `honeypot_name` (generated when the honeypot is on and no name is given; must not clash with a field's input name).
- Responses always include every key.

## Public submissions

_Relied on by `lib/snippets.ts`, `components/forms/TestSubmit.tsx`._

- `POST /v1/forms/{form}/submissions`, no auth, JSON or form-encoded.
- **CORS:** allowed from any origin, without credentials.
- Body keys are the schema's input names, validated with each field's rules. Unknown keys are dropped. Only validated fields are stored.
- 201 `{redirect, message}` from the form's settings. **Never a 3xx.**
- Inactive form → 403. `Referer` host not in a non-empty `domains` list → 403. Validation → 422. Throttled → 429.
- A filled honeypot input still returns 201, and stores the entry flagged as spam.
- After storing, the entry is checked for spam **asynchronously**. Alerts go to enabled email recipients only **after** the check, and never for spam.

## Entries

_Relied on by `lib/entries/`._

- `spam_score` is a **number** from 0 to 1 (three decimal places). The reference implementation flags spam at 0.9 or above.
- `spam_checked_at` is `null` while a public submission awaits its spam check, or if the check couldn't run; otherwise when it finished. Honeypot hits and entries created through the authenticated API are marked checked on arrival, with a score of 0.
- `user_agent_display` is `{platform, browser, browser_version}` or `null` (it may be filled in asynchronously after arrival). `ip_location_display` may always be `null`.
- **Update** `PUT /v1/entries/{entry}` changes only `read_at`, `starred`, `spam`, `spam_score`, `spam_reason`, and every field is optional, so one field can be sent alone. Submission fields are read-only: sending any of them → 422. Use `PUT`, the documented method; the reference implementation also accepts `PATCH`, but that isn't part of the contract.
- **Delete** is soft. `GET /v1/entries/{entry}` returns 404 for a deleted entry. `restore` and `force` apply to deleted entries only.
- **Bulk** `POST /v1/forms/{form}/entries/bulk` `{action, ids}` with up to 100 IDs. `action` is one of `mark_read`, `mark_unread`, `star`, `unstar`, `mark_spam`, `mark_not_spam`, `delete` (live entries only) or `restore`, `force_delete` (deleted entries only). An ID in the wrong state → 422 on `ids.N`. Returns `{affected}`, counting only entries that changed.

## Exports

_Relied on by `lib/exports/`, `hooks/useExportPolling.ts`, `hooks/useExportActions.ts`._

- `POST /v1/forms/{form}/entries/exports` takes the entries list's `filter` and `sort` (and ignores `per_page`) → 202 with the export resource.
- `status` moves `pending` → `processing` → `completed` | `failed`, with `error` set on failure. Processing happens in the background.
- `parameters` is the `{ filter?, sort? }` object the export was created with (`{}` when empty).
- `download_url` is `null` until `completed`, then an **absolute, signed URL that needs no bearer token**, valid for a few minutes from the response that carried it (5 in the reference implementation). Fetching the export again gives a fresh one.
- **The signed URL's host is the host the backend saw on the request.** The dashboard's server calls the backend, so either the dashboard uses the backend's public URL as `BACKEND_API_URL`, or the backend trusts `X-Forwarded-Host` and `X-Forwarded-Proto` from the dashboard's server.
- Download: 200 CSV; 403 bad or expired signature; 409 not ready; 410 expired.
- Exports are kept for 24 hours. `GET /v1/entry-exports` lists the user's exports across all forms, newest first, leaving out expired exports and exports of deleted forms. There is no per-form filter and no form name in the resource (by decision, 2026-10-02).
- CSV columns: `id`, `created_at`, one per schema field in `order` (headed by label, falling back to input name), then any other stored input keys alphabetically, then `read_at`, `starred`, `spam`, `spam_score`, `spam_reason`, `spam_checked_at`, `ip`, `referer`, `user_agent`, `deleted_at`. Cells starting with `=`, `+`, `-`, `@`, tab or CR are prefixed with `'`.

## Notifications

_Relied on by `lib/notifications/`._

- Recipients `{type: "email" | "sms", value, enabled, error}` belong to a form. `value` is an email address for `email`, and E.164 (`+14155552671`) for `sms`.
- `PUT /v1/notifications/{notification}` requires `type`, `value` and `enabled`.
- `error` is read-only: set when delivery fails (for example a bounce or spam complaint, where the backend can detect them), cleared by the next successful delivery.
- Delete is soft; `restore` brings the recipient back.
- SMS recipients are stored but not alerted in the reference implementation.

## Deployment requirements

- **Trusted proxy.** The backend should trust the dashboard's server as a proxy, so per-IP throttles (login, password reset, submissions) see the browser's IP from `X-Forwarded-For` rather than the server's.
- **Public URL.** See the export host rule above.
- **Background work.** Spam checks, user-agent parsing, alerts and exports run asynchronously. The backend's workers must be running for them, and for the dashboard's e2e tests.

## Known spec inaccuracies

- Create endpoints are documented as 200 but return 201 (see Successful responses). Harmless to this dashboard, which accepts any 2xx.
- The request type for a schema field's `rules` allows only an array, though a comma-separated string is accepted. Harmless: the dashboard always sends arrays.
