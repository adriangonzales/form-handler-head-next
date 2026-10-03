/**
 * Client-side settings that aren't part of the contract. The contract doesn't say whether a spam
 * check is still queued, so an unchecked entry younger than the window is shown as being checked.
 */
export const entriesConfig = {
  /** How long after arrival an unchecked entry counts as "Checking…" rather than "Not checked". */
  spamCheckWindowMs: 2 * 60_000,
  /** How often the list and an open entry refetch while any entry is being checked. */
  spamCheckPollMs: 10_000,
}
