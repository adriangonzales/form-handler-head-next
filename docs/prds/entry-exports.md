# PRD: Entry Exports

**Status:** Planned (milestone 6) · **Owner area:** `components/entries/ExportButton.tsx`, `components/exports/*` (`ExportList`, `ExportStatus`, `ExportActions`), `app/(dashboard)/exports/page.tsx`, `hooks/useExportPolling.ts`, `hooks/useExportActions.ts`, `lib/exports/*`

## 1. Summary

Users can download a form's entries as a CSV. The Backend builds exports in the background: the dashboard starts an export, polls until it's ready, then gives the user a link. The link is a short-lived signed URL that the browser downloads straight from The Backend. No credentials are involved, and the file doesn't pass through the Next.js server.

Exports are kept for 24 hours, and The Backend lists them. Recent exports can therefore be found and downloaded again from any device: on the form's Entries tab, and on an account-wide **Exports** page.

## 2. Users

- **Account holder:** takes entries into a spreadsheet or another system.

## 3. Goals

- Export exactly what the user is looking at: the same filters and sort as the entries table.
- Never hold a request open while a large export runs.
- Downloads work as ordinary browser downloads, with progress and the browser's own save dialog.
- Recent exports can be downloaded again without re-running them, even from another session or device.

## 4. Functional requirements

**FR-1 Start an export.**

- **Export CSV** on the Entries tab sends `POST /v1/forms/{id}/entries/exports` with the current `filter` and `sort`. It never sends `page` or `per_page`: an export always contains every matching entry.
- On 202 the Exports popover (FR-6) opens with the new export at the top, showing "Preparing export…".
- **Export CSV** stays enabled while an export runs, because exports are independent. But it warns, with **Export anyway**, if an export with the same filters and sort is already `pending` or `processing`. Parameters are compared after normalising (filter order, `1`/`0` vs `true`/`false`, the default sort).

**FR-2 Poll status.**

- `useExportPolling` polls `GET /v1/entry-exports/{export}` for each `pending` or `processing` export on screen: every 2 s, backing off to every 10 s after 30 s, until `status` is `completed` or `failed`. Polling pauses while the browser tab is hidden.
- Polling stops when no in-progress export is on screen. Because the index (FR-6, FR-7) always shows the current state, an export started elsewhere, or before a reload, is picked up again from there. Nothing needs to be kept in browser storage.
- While polling, the row shows `pending` / `processing`.
- An export started from the Entries tab that finishes while the popover is closed announces itself with an "Export ready" toast with **Download**.

**FR-3 Download.**

- A `completed` export shows "{row_count} entries" and a **Download** button.
- Clicking it fetches the export again (`GET /v1/entry-exports/{id}`) for a fresh signed `download_url`, then starts the download by clicking a plain `<a href download>`, not a `fetch`, so the browser streams the file itself.
- The signed URL expires a few minutes after it's issued (5 by default in the reference Backend). The `download_url` in a list response is never used directly, because it may already be stale; every click re-fetches.

**FR-4 Failures.**

- `failed`: show the export's `error` (for example "the form was deleted"), with **Try again**. That starts a new export with the same `filter` and `sort`, read from the export's `parameters`.
- The re-fetch on Download finds the export not `completed`: go back to polling.
- The re-fetch returns 404, or `expires_at` has passed: the export has expired. Remove it from the list and offer **Export again**.
- **Lesson from Nuxt:** a 403 (signature expired) or 410 from the download link itself can't be seen, because a link click doesn't expose the response. Re-fetching immediately before every click (FR-3) makes an expired link unlikely, and is the requirement; there's no automatic 403 retry.

**FR-5 What's in the file.**

- The popover explains:
  - the export reflects entries matching the filters when it runs, not when it was requested;
  - columns follow the current schema plus any older fields;
  - dates are in UTC;
  - it includes a `spam_checked_at` column.
- The filename comes from The Backend: `{form-slug}-entries-{date}.csv`.

**FR-6 Recent exports on the Entries tab.**

- An **Exports** button next to Export CSV opens a popover listing this form's recent exports, newest first.
- Each row shows:
  - when the export was requested;
  - a summary of its filters and sort, from `parameters` (for example "Unread · newest first", or "All entries");
  - its status;
  - its row count;
  - when it expires (relative, for example "expires in 3 h");
  - **Download** or **Try again**.
- The button shows a badge while any of this form's exports are in progress.
- The index has no per-form filter (and won't get one; decided 2026-10-02), so the popover loads `GET /v1/entry-exports?per_page=100` and keeps the rows whose `form_id` matches. With 24-hour retention, 100 rows covers the account's recent exports in practice. If the response has more than one page, the popover links to the Exports page for the rest.

**FR-7 Exports page.**

- `/exports`, linked from the sidebar, lists all of the user's exports across forms (`GET /v1/entry-exports`), newest first. It's paginated, with a page-size selector of 15, 25, 50 or 100, kept in the URL.
- Columns:
  - **form:** the form's name, linking to its Entries tab. Exports don't carry the form name (decided 2026-10-02), so names come from the forms list, loaded once per session into the query cache and reloaded when an unknown `form_id` appears. It falls back to the export's `filename` if the form isn't found;
  - **filters:** summarised as in FR-6;
  - **requested**;
  - **status**;
  - **rows**;
  - **expires**;
  - **actions:** Download, or Try again.
- In-progress rows are polled as in FR-2.
- The empty state explains that exports are started from a form's Entries tab and kept for 24 hours.
- The Backend leaves out expired exports and exports of deleted forms, so the page never shows rows that can't be downloaded.
- The sidebar's **Exports** badge shows while any export on the account is in progress.

## 5. Non-functional requirements

- **NFR-1:** the download URL points at The Backend's public origin. This relies on the proxy calling The Backend by its public URL, or forwarding the host headers ([App Shell](app-shell-and-architecture.md) FR-5). An e2e test checks the link's host.
- **NFR-2:** the CSV never streams through the Next.js server. The dashboard never has the file's contents in memory.
- **NFR-3:** polling is limited to exports in progress on screen, and pauses while the tab is hidden (`document.visibilityState`). It continues while the popover is closed, so the badge and the "Export ready" toast stay current.

## 6. Acceptance criteria

- **AC-1:** with the Starred filter on, the exported CSV contains only starred entries, in the table's order, with the schema labels as headers.
- **AC-2:** let more than 5 minutes pass after the export completes, then click Download. The file downloads, because the link was re-fetched.
- **AC-3:** a failed export shows its error, and Try again starts a new export with the same filters.
- **AC-4:** start an export, reload the page, and sign in from a second browser. The export is listed in both, with its live status, and can be downloaded from either.
- **AC-5:** the Exports page lists exports from two forms with the right form names. An export of a deleted form doesn't appear.
- **AC-6:** an expired export is removed from the list when Download is clicked, and **Export again** is offered.

## 7. API dependencies

_Backend Entries_ FR-8:

- 202 with `Location`;
- statuses `pending` → `processing` → `completed` | `failed`;
- `parameters` returned as the `{ filter?, sort? }` object the export was created with;
- the signed `download_url`, valid for a few minutes and `null` until completed;
- 403 for a bad or expired signature, 409 when not ready, 410 when expired;
- 24-hour retention;
- the CSV column order (including `spam_checked_at`), and formula-injection protection;
- `GET /v1/entry-exports`: the user's exports across all forms, newest first, `per_page` 1–100 with a default of 15, leaving out expired exports and those of deleted forms.

Exports are processed by The Backend's background workers. The e2e export tests need them running.

## 8. Gaps

- **The export index can't be filtered by form, and exports don't include the form's name.** Not planned (decided 2026-10-02); FR-6 and FR-7 work around both.
- **A 403 or 410 from the download link can't be detected** (FR-4).

## 9. Open questions

1. Should users be able to delete an export before it expires? The contract has no delete endpoint.
