# PRD: Forms

**Status:** Planned (milestone 3) · **Owner area:** `app/(dashboard)/forms/page.tsx`, `app/(dashboard)/forms/new/page.tsx`, `app/(dashboard)/forms/[formId]/layout.tsx`, `app/(dashboard)/forms/[formId]/settings/page.tsx`, `components/forms/*`, `components/shared/DataTable.tsx`, `hooks/useListQuery.ts`, `hooks/useUnsavedChanges.ts`, `lib/forms/*` (`settings.ts`, `templates.ts`, `queries.ts`)

## 1. Summary

The forms list is the dashboard's home. From it, account holders see every form they own, create new ones, and open a form to work on its entries, fields, settings, notifications and integration. This PRD covers the list, creating a form, the Settings tab, and the form-level actions: activate/deactivate, duplicate, delete and restore. Fields and integration are in [Form Fields & Integration](form-fields-and-integration.md).

## 2. Users

- **Account holder:** manages their own forms. The Backend only ever returns the signed-in user's forms.

## 3. Goals

- Find a form quickly and see at a glance whether it's accepting submissions.
- Create a form and get to the point of embedding it in as few steps as possible.
- Make mistakes recoverable: deleting a form can be undone.

## 4. Functional requirements

**FR-1 List forms.**

- `/forms` shows a table (TanStack Table in the shared `DataTable`) of the user's forms, with columns:
  - **name**, which links to the form's Entries tab;
  - an **active** badge (Active / Inactive);
  - **entries:** `entries_count`, which excludes spam and deleted entries. It links to the Entries tab's Inbox;
  - **unread:** `unread_entries_count` as a highlighted badge when it's above 0. It links to the Unread tab (`?status=unread`);
  - **spam:** `spam_entries_count` as a muted count, shown only when it's above 0. It links to the Spam tab (`?status=spam`);
  - **updated** (relative time, with the full date in a tooltip);
  - **created**.
- The counts are only in the forms list response (`FormListItem`), not in a single form's response. The form header (FR-4) doesn't depend on them.
- Pagination uses `meta.current_page`, `meta.last_page` and `meta.total`, with a page-size selector: 15 (default), 25, 50 or 100 (`per_page`).
- A row menu has Open, Duplicate, Activate/Deactivate and Delete.
- An empty state invites the user to create their first form. Loading failures show an error state with **Retry**.

**FR-2 Sort and filter.**

- Sort by name, created or updated, ascending or descending. This maps to `sort` (`name`, `-name`, `created_at`, `-created_at`, `updated_at`, `-updated_at`). The default is `-updated_at`, so recently worked-on forms come first.
- Filter by status with tabs: All / Active / Inactive (`filter[active]`).
- Sort, filter, page and page size live in the URL query through `useListQuery` (built on nuqs), so a view can be shared, bookmarked and kept through back/forward navigation. The Server Component reads the same query to prefetch the matching page.
- Changing the sort, filter or page size resets to page 1. The last page size chosen is remembered in `localStorage` (wrapped in try/catch) as the default for the next visit.
- `useListQuery` and `DataTable` are built here for reuse by Entries and Exports.

**FR-3 Create a form.**

- `/forms/new` asks for a **name** (required, max 400) and offers an optional starting template, as radio cards:
  - **Blank**;
  - **Contact:** name (required), email (required, email) and message (required, max 5000);
  - **Newsletter:** email (required, email).
- Templates fill in `schema` (`FormSchemaBody`) as a list of fields, each with a fresh ULID `id`, an `order` from 1, and the readable input names (`name`, `email`, `message`) as `name`.
- It submits `POST /v1/forms`. On 201 it goes to the new form's **Integrate** tab with a toast: "Form created. It's inactive until you turn it on."
- New forms are inactive by default (_Backend Forms FR-3_).

**FR-4 Form header.**

- Every `/forms/[formId]` tab shows the form name, an **Active** switch, and a menu with Duplicate and Delete.
- Turning the switch on or off sends `PUT /v1/forms/{id}` with the current `name` and the new `active`. Update requires both (_Backend Forms FR-4_), so the request always includes the current name.
- The switch updates optimistically (TanStack Query `onMutate`), and reverts with an error toast if the request fails.

**FR-5 Settings tab.** `/forms/[formId]/settings` edits:

| Field           | Control                                                     | Notes                                                                                                                                           |
| --------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Name            | text, required, max 400                                     |                                                                                                                                                 |
| Success message | textarea, max 2000                                          | Returned to submitters after a successful submission                                                                                            |
| Redirect URL    | URL input, max 2048                                         | Where the submitter's browser should go after submitting                                                                                        |
| Timezone        | searchable combobox from `Intl.supportedValuesOf('timeZone')` | Used for submission times in alert emails                                                                                                     |
| Allowed domains | tag input → `string[]`                                      | Bare hostnames; `*.example.com` covers subdomains. Help text explains that when the list isn't empty, submissions from other sites are rejected |
| Honeypot        | switch, plus a name input shown when on                     | Leaving the name blank lets The Backend generate one. Once saved, the name in use is shown with a copy button                                   |

- The form is react-hook-form with a zod schema mirroring The Backend's limits.
- Save sends `PUT /v1/forms/{id}` with `name`, `active` and `settings`.
- `settings` contains only the keys the user has set, because omitted keys take their defaults and unknown keys are rejected.
- A 422 on `settings.*` (including a honeypot name that clashes with a field's input name) shows on the matching control.
- The form warns before the user leaves with unsaved changes (`useUnsavedChanges`: `beforeunload` for reloads and tab closes, and a confirm on in-app link clicks).

**FR-6 Delete and restore.**

- **Delete** (from the list row menu, the form header menu, and the Settings tab's danger zone) sends `DELETE /v1/forms/{id}` and shows a toast with **Undo**, which calls `POST /v1/forms/{id}/restore`.
- Deleting from inside the form returns to `/forms`.
- The help text explains that entries and recipients are kept, and come back if the form is restored.

**FR-7 Duplicate.**

- **Duplicate** (row menu and form header menu) sends `POST /v1/forms/{id}/duplicate` and opens the copy's Settings tab.
- The toast says that the copy is inactive and doesn't include entries or recipients (_Backend Forms FR-10_).

**FR-8 Deleted or foreign forms.** A form that's deleted or doesn't exist (404) shows the not-found page; one that belongs to someone else (403) shows the access-denied page ([App Shell](app-shell-and-architecture.md) FR-13). The `[formId]` layout fetches the form on the server, so this happens before any tab renders.

## 5. Acceptance criteria

- **AC-1:** create a form from the Contact template, then turn it on. The list shows it as Active, first under the default sort.
- **AC-2:** sort, filter and page size survive a reload and back/forward navigation.
- **AC-3:** delete a form, then Undo. It's back with its entries.
- **AC-4:** a settings 422 (an invalid domain like `https://example.com/path`, or a honeypot name clash) appears on the right field.
- **AC-5:** submit two entries to a form and open one. The list shows 2 entries and 1 unread. Mark one as spam, and the counts become 1 entry, 0 unread, 1 spam.
- **AC-6:** duplicate a form. The copy's Settings tab opens, and the copy is inactive.

## 6. API dependencies

_Backend Forms_ FR-1 (list, sort, filter, `per_page` 1–100 with a default of 15, entry counts on list items only), FR-2, FR-3, FR-4 (`name` and `active` required on update), §5a (settings keys, rules, defaults, honeypot name generation and clash rules), FR-8 (soft delete), FR-9 (restore), FR-10 (duplicate).

## 7. Gaps

- **No list of deleted forms.** The Backend can restore a form but can't list deleted ones. The only way back after the Undo toast is gone is the form's URL.

## 8. Open questions

1. Should there be a "Deleted forms" view? It needs `filter[trashed]` on the forms index in the contract, and so in every backend.
