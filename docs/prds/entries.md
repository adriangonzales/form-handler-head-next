# PRD: Entries

**Status:** Built (milestone 5, 2026-10-02; Export CSV comes with milestone 6) · **Owner area:** `app/(dashboard)/forms/[formId]/entries/layout.tsx`, `…/entries/page.tsx`, `…/entries/@detail/(.)[entryId]/page.tsx`, `…/entries/@detail/page.tsx`, `…/entries/@detail/default.tsx`, `…/entries/[entryId]/page.tsx`, `components/entries/*` (`entries-view`, `entry-date-filter`, `entry-bulk-bar`, `entry-panel`, `entry-detail`, `entry-sheet`, `entry-page`), `lib/entries/*` (`entries.ts`, `queries.ts`, `dates.ts`), `lib/config.ts`, `hooks/use-entry-actions.ts`, `hooks/use-now.ts`

## 1. Summary

Entries are submissions to a form. The **Entries** tab is an inbox for one form. Users can:

- read submissions and see where they came from;
- mark them read or unread;
- star the important ones;
- flag or clear spam;
- delete entries, restore them from trash, or erase them permanently, one at a time or in bulk.

## 2. Users

- **Account holder:** triages submissions to their forms.

## 3. Goals

- See new submissions first and know at a glance which haven't been read.
- Triage dozens of entries quickly with bulk actions.
- Be able to erase a submitter's personal data permanently when asked.

## 4. Functional requirements

**FR-1 Entries table.** `/forms/[formId]/entries` (the form's default tab) lists entries, 15 per page by default. A page-size selector offers 15, 25, 50 or 100 (`per_page`).

- **Columns** (TanStack Table, built from the schema at render time):
  - a selection checkbox;
  - an unread indicator;
  - a star toggle;
  - received time;
  - one column per schema field, in schema order, headed by its label;
  - a spam badge, with the spam likelihood (FR-9) in its tooltip, and the Checking… badge (FR-9).
- **Cell values:** each field column shows that field's value, truncated. Lists are joined with `, ` and other structured values are shown as compact JSON. Empty values show `—`.
- **Extra keys:** input keys that aren't in the current schema (removed or renamed fields) are left out of the table, but shown in the detail view under "Other fields".
- **Unread rows** are bold and carry the unread indicator, so the state isn't shown by colour alone.
- **Empty state:** links to the Integrate tab. Loading failures show an error state with **Retry**.

**FR-2 Default order.** Newest first (`sort=-created_at`). The Backend's own default is oldest first (_Backend Entries FR-2_), so the dashboard always sends `sort`. The user can switch to oldest first, or to spam likelihood (high to low, or low to high).

**FR-3 Filters.**

- **Status tabs**, kept in the URL as `?status=inbox|unread|starred|spam|trash` (default `inbox`). The forms list links to `?status=unread` and `?status=spam`:
  - **Inbox:** not spam, not deleted (`filter[spam]=false`);
  - **Unread:** `filter[read]=false&filter[spam]=false`;
  - **Starred:** `filter[starred]=true`;
  - **Spam:** `filter[spam]=true`;
  - **Trash:** `filter[trashed]=only`.
- **Tab counts:** Inbox, Unread and Spam show their totals as badges, each from a `per_page=1` request for that tab reading `meta.total`, prefetched on the server with the list. Triage actions invalidate them. Starred and Trash don't show counts.
- **Date range:** sets `filter[created_from]` and `filter[created_to]`, which are inclusive whole UTC days, kept in the URL as `from` and `to`. The picker says the dates are in UTC.
- Filters, sort, page and page size live in the URL (`useListQuery`). Changing a filter or the page size resets to page 1.
- A 422 on a filter (for example an end date before the start date) shows inline on the date picker.

**FR-4 Entry detail.**

- Clicking a row opens the entry at `/forms/[formId]/entries/[entryId]`:
  - from the list, an **intercepting route** in the `@detail` parallel slot shows it in a slide-over (full width on phones) while the list, its query and its scroll position stay put. Closing it goes back to the list URL;
  - from a direct link or a reload, the same URL renders the entry as a full page with a link back to the list.
- It shows:
  - every schema field, with its label and full value;
  - "Other fields" for keys not in the schema;
  - the received time, in the user's local time with UTC in a tooltip;
  - the IP address, the referer (shown as text, not a clickable link), and the parsed user agent (platform, browser, version) with the raw user agent in a disclosure. The parsed user agent can be `null` just after submission while The Backend parses it in the background: show "Parsing…" and the raw string, within the same window as Checking (FR-9);
  - the spam state, likelihood and reason (FR-9);
  - **previous/next** controls (also `k`/`j`) that move through the current filtered, sorted list, loading the adjacent page when needed.
- A slide-over opened from a link shows a skeleton while loading. **Lesson from Nuxt:** it was blank until this was added.
- **As built:** previous/next (and `k`/`j`) are in the slide-over only. On the full page, moving to another entry would be a navigation inside the entries layout, which Next intercepts into a slide-over over the full page, so the full page offers "Back to entries" instead. The date filter applies a range with **Apply** rather than on the second click.

**FR-5 Mark read on open.**

- Opening an unread entry sends `PUT /v1/entries/{id}` with `read_at` set to now, and updates the row and the Unread count. Entry updates send only the fields being changed.
- The contract documents `PUT` for entry updates. The Nuxt dashboard sends `PATCH`, which the reference Backend also accepts, but other backends needn't, so this dashboard uses `PUT`.
- The detail view has **Mark as unread** (`read_at: null`).

**FR-6 Single-entry actions.**

- **Star / Unstar:** `starred`, also inline in the table.
- **Mark as spam / Not spam:** `spam`.
- **Delete:** `DELETE /v1/entries/{id}`, with an Undo toast that calls `/restore`.
- In Trash: **Restore**, and **Delete permanently** (`DELETE /v1/entries/{id}/force`, with confirmation). The Backend answers 409 for an entry that isn't in Trash.
- Toggles update optimistically and revert on failure.

**FR-7 Bulk actions.**

- Selecting rows shows a bulk bar with the count and the actions that apply in the current tab:
  - **Inbox, Unread, Starred and Spam:** Mark read, Mark unread, Star, Unstar, Mark spam, Not spam, Delete;
  - **Trash:** Restore, Delete permanently (with confirmation).
- Selection is limited to the current page and clears when the page, filters or sort change. **Select all on this page** works at any page size, because the largest page (100) matches the 100-ID bulk limit.
- Each action sends `POST /v1/forms/{id}/entries/bulk` with `{action, ids}`.
- **Result:** the toast reports `affected` from the response (for example "3 entries starred"). Entries that were already in that state aren't counted, so the number can be lower than the selection. Delete offers Undo (a bulk `restore`). The list and counts then refresh and the selection clears.
- A 422 on `ids.N` (an entry changed state in the meantime) shows "Some entries changed. Refresh and try again." and refreshes the list.

**FR-8 Export.** The toolbar has **Export CSV**, which exports using the current filters and sort. See [Entry Exports](entry-exports.md).

**FR-9 Automatic spam check.** After each public submission The Backend checks it for spam in the background. In the reference Backend this is an AI classifier: entries scored at a 0.9 likelihood or above are flagged with a reason. Alerts are only sent after the check (_Backend Entries FR-1a_). The dashboard reflects this as follows:

- **Likelihood:** `spam_score` is a probability from 0 to 1, as a number (`0.95`). It's shown as a percentage ("95% likely spam"), not a raw score. Sorting by spam score sorts by this likelihood.
- **Check state (`spam_checked_at`):**
  - **Checked:** `spam_checked_at` is set. The detail view shows "Checked {time}" next to the likelihood. Honeypot hits and entries created through the API are marked checked when they arrive with a score of 0: a score of 0 checked within a second of arrival is shown as "no likelihood", not 0%.
  - **Checking:** `spam_checked_at` is null and the entry is less than 2 minutes old. The row shows a subtle "Checking…" badge, and the detail view says the entry may still move to Spam and that alerts go out once the check finishes.
  - **Not checked:** `spam_checked_at` is null and the entry is older than that. The check was unavailable or failed. The entry stays in Inbox, alerts were still sent, and the detail view shows "Not checked for spam" with no likelihood, rather than a misleading 0%.
  - The 2-minute window and the 10 s poll interval are client-side settings in `lib/config.ts`. The contract doesn't say whether a check is still queued.
  - "Now" comes from `useNow`, which ticks so a row moves from Checking to Not checked without a reload. Server and client render the same state on hydration (the server passes its render time).
- **Entries that move to Spam:**
  - A new entry starts out not spam, and can move to Spam seconds later when the check finishes.
  - While any row on the page is **Checking**, the list query refetches every 10 s (TanStack Query `refetchInterval`, stopping once none are left), so flagged entries leave Inbox without a manual reload. The Inbox, Unread and Spam counts refetch with it.
  - An open detail view polls that entry on the same schedule, and shows a toast if it gets flagged.
- **Overriding the check:** the user can always flag an entry as **Not spam**, or flag a missed one as **Spam**. A manual change isn't rechecked.

## 5. Non-functional requirements

- **NFR-1 Untrusted content:** entry data comes from anonymous submitters and must be treated as hostile. Every value (inputs, referer, user agent, spam reason) is rendered as text through React's default escaping. Never use `dangerouslySetInnerHTML`, Markdown rendering or automatic links. A test submits `<img src=x onerror=alert(1)>` and `javascript:` URLs, and checks they render as plain text.
- **NFR-2:** a page of 15 entries with 20 fields each renders without layout shift. The table scrolls horizontally inside its container.

## 6. Acceptance criteria

- **AC-1:** a new test submission appears at the top of Inbox and Unread, in bold. Opening it marks it read.
- **AC-2:** bulk-star 3 entries, one of them already starred. The toast says 2.
- **AC-3:** delete an entry and Undo. Delete it again, then permanently delete it from Trash. It's gone from every tab.
- **AC-4:** filters and sort survive a reload. Previous/next in the detail view follow them, across a page boundary.
- **AC-5:** NFR-1's hostile payloads are shown as text.
- **AC-6:** an entry the check flagged shows in Spam with its likelihood and reason. **Not spam** moves it back to Inbox and updates the Inbox, Unread and Spam counts.
- **AC-7:** at page size 100, Select all, then a bulk action, succeeds.
- **AC-8:** with no spam check configured on The Backend, a new entry shows "Checking…" and then "Not checked for spam", and stays in Inbox. With it configured, an entry that gets flagged leaves Inbox within about 10 s, without a reload.
- **AC-9:** opening an entry from the list and closing it keeps the list's scroll position and query; opening the same URL directly shows the full-page view.

## 7. API dependencies

_Backend Entries_ FR-1a (spam check, threshold, `spam_checked_at`, alerts after the check), FR-2 (list, sort, filters, `per_page` 1–100 with a default of 15, oldest-first default), FR-3/FR-4 (show and update; submission fields are read-only), FR-5 (response shape: `spam_score` a number, `user_agent_display` an object or null), FR-6 (delete, restore, force delete only for deleted entries), FR-7 (bulk actions and `affected`). Entries of a deleted form return 403.

## 8. Gaps

- **No IP geolocation:** `ip_location_display` is always null in the reference Backend. The detail view shows it only when it's set.
- **No full-text search over entries:** the contract has no search filter.
- **Deleted entries can't be fetched one at a time:** `GET /v1/entries/{id}` returns 404 for an entry in Trash, so the detail view uses the list's copy of the row there. A link to a deleted entry that isn't on the current page shows "Entry not found".
- **Entries checked on arrival have a score of 0:** see FR-9.

## 9. Open questions

1. Should selection span pages ("select all 240 matching"), sending bulk requests in batches of 100?
2. Should the contract tell a queued spam check apart from one that failed (for example a `spam_check_status`), so the dashboard doesn't need the 2-minute heuristic?
