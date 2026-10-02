# PRD: Notifications

**Status:** Planned (milestone 7) · **Owner area:** `app/(dashboard)/forms/[formId]/notifications/page.tsx`, `components/notifications/NotificationForm.tsx`, `components/notifications/RecipientList.tsx`, `lib/notifications/*`

## 1. Summary

Each form has a list of recipients who are alerted when a new entry arrives. A recipient is either an email address or an SMS number, and can be switched off without being removed. The **Notifications** tab manages that list, and shows any delivery problems The Backend has recorded, such as bounced emails and spam complaints.

## 2. Users

- **Account holder:** decides who hears about new submissions.

## 3. Goals

- Add, pause and remove recipients in a couple of clicks.
- Make delivery problems obvious, so a form isn't quietly alerting a dead mailbox.
- Be honest about what's delivered today: SMS recipients are stored but not alerted.

## 4. Functional requirements

**FR-1 Recipient list.** `/forms/[formId]/notifications` lists the form's recipients, 15 per page (the contract's fixed page size). Each row shows:

- the type (email or SMS icon and label);
- the value;
- an **Enabled** switch;
- **Edit** and **Remove** actions;
- when `error` is set, a "Delivery problem" badge, with the full message shown under the recipient, such as "Bounced (HardBounce): …" or "Marked as spam: …".

**Lesson from Nuxt:** the error is shown inline, not in a tooltip. A tooltip hides it from touch and keyboard users, and the full text is what makes the problem fixable.

An empty state explains that nobody is alerted until a recipient is added.

**FR-2 Add a recipient.**

- **Add recipient** opens a dialog with:
  - **Type:** Email or SMS;
  - **Value:** for email, an email input; for SMS, a phone input that guides toward E.164 format (`+14155552671`), with a hint about the country code. On blur, spaces, dashes and brackets are removed and a leading `00` becomes `+`;
  - **Enabled:** default on.
- The value is checked in the browser the same way The Backend checks it (email, or E.164 for SMS), with zod.
- It sends `POST /v1/forms/{id}/notifications`. A 422 on `value` shows on the value field.

**FR-3 Edit a recipient.**

- Editing (the same dialog) sends `PUT /v1/notifications/{id}` with `type`, `value` and `enabled`. The contract requires all three (_Backend Notifications FR-4_).
- The Enabled switch in the list uses the same request with the current type and value. It updates optimistically and reverts if the request fails.

**FR-4 Delete and restore.** **Remove** sends `DELETE /v1/notifications/{id}` and shows a toast with **Undo**, which calls `POST /v1/notifications/{id}/restore`.

**FR-5 SMS isn't delivered yet.**

- SMS rows carry a "Not delivered yet" badge.
- When SMS is chosen in the dialog, a notice says SMS recipients are saved but won't be alerted until SMS delivery is available (_Backend Notifications, gap_).

**FR-6 What triggers an alert.** Help text on the tab says:

- alerts go to enabled email recipients when a new entry arrives through the public submission endpoint;
- every submission is checked for spam first, so alerts arrive a few seconds after the entry, and entries flagged as spam (by the honeypot or the spam check) don't trigger alerts at all;
- if an entry is wrongly flagged and later marked **Not spam**, no alert is sent for it after the fact;
- times in the email use the form's timezone setting, with a link to the Settings tab.

**FR-7 Clearing errors.** A recipient's error stays visible until The Backend's next successful delivery clears it. The help text under the error says so. The dashboard can't clear `error` itself: it's read-only.

## 5. Acceptance criteria

- **AC-1:** add an email recipient, submit a test entry, and the recipient receives the alert (with a mail catcher, or The Backend's log mailer, in dev).
- **AC-2:** an invalid SMS number (`415-555-2671`) shows the E.164 message on the field, in the browser before submitting, and The Backend's 422 shows there too if the browser check is bypassed.
- **AC-3:** turning a recipient off and on persists across a reload. Remove plus Undo restores it.
- **AC-4:** a recipient with a recorded bounce shows the badge and the full message (faked through the mock backend, or an intercepted response).

## 6. API dependencies

_Backend Notifications_ FR-1 (paginated list, fixed at 15), FR-3 (type/value validation, E.164 for SMS, `error` read-only), FR-4 (update requires `type`, `value` and `enabled`, and `form_id` can't be changed), FR-5 (soft delete and restore), FR-6 (who is alerted and when: after the spam check, for public submissions only, never for spam), FR-8/FR-9 (how `error` is set and cleared).

## 7. Gaps

- **No SMS delivery** in The Backend.
- **No way to send a test alert** to a recipient without submitting an entry.
- **Bounce reporting depends on The Backend's mail provider.** The reference Backend records bounces from its provider's webhook; another backend may not record them at all, in which case `error` stays null.
- **The list has a fixed page size of 15:** the notifications index doesn't take `per_page`.

## 8. Open questions

1. Should the dashboard offer a "Send test alert" action, which needs a contract endpoint?
2. Should SMS be hidden as an option until delivery exists, instead of being shown with a notice?
