import { expect, type Page, test } from '@playwright/test'
import {
  backendPublicUrl,
  createFormViaApi,
  deleteFormViaApi,
  goto,
  reload,
  signIn,
  uniqueName,
} from './support'

const created: string[] = []

test.afterEach(async ({ page }) => {
  for (const id of created.splice(0)) {
    await deleteFormViaApi(page, id)
  }
})

const schema = [
  { id: '01K6E2E0000000000000000001', order: 1, label: 'Name', name: 'name' },
  { id: '01K6E2E0000000000000000002', order: 2, label: 'Message', name: 'message' },
]

async function createForm(page: Page, prefix: string) {
  const form = await createFormViaApi(page, uniqueName(prefix), { schema })

  created.push(form.id)
  await page.request.put(`/api/backend/forms/${form.id}`, {
    data: { name: form.name, active: true },
  })

  return form
}

/** Adds an entry through the dashboard's API: no spam check, so it's never moved or flagged. */
async function addEntry(page: Page, formId: string, input: Record<string, string>) {
  const response = await page.request.post(`/api/backend/forms/${formId}/entries`, { data: input })

  expect(response.status(), await response.text()).toBe(201)

  return (await response.json()).data as { id: string }
}

function row(page: Page, text: string) {
  return page.locator('tbody tr').filter({ hasText: text })
}

function tab(page: Page, name: string) {
  return page.getByRole('tab', { name: new RegExp(`^${name}`) })
}

const slideover = (page: Page) => page.getByRole('dialog')

test('a new submission is unread at the top of the Inbox, and opening it marks it read', async ({
  page,
  request,
}) => {
  await signIn(page)
  const form = await createForm(page, 'Inbox')
  await addEntry(page, form.id, { name: 'Older', message: 'First' })

  const response = await request.post(`${backendPublicUrl}/v1/forms/${form.id}/submissions`, {
    data: { name: 'Robin', message: 'Hello there' },
    headers: { Accept: 'application/json' },
  })
  expect(response.status()).toBe(201)

  await goto(page, `/forms/${form.id}/entries`)
  const newest = page.locator('tbody tr').first()
  await expect(newest).toContainText('Hello there')
  await expect(newest).toHaveClass(/font-semibold/)
  await expect(newest.getByText('Unread', { exact: true })).toBeAttached()
  await expect(tab(page, 'Unread')).toContainText('2')

  await newest.getByText('Hello there').click()
  await expect(page).toHaveURL(/\/entries\/[0-9A-Z]+$/i)
  await expect(slideover(page).getByText('Hello there')).toBeVisible()
  await expect(slideover(page).getByRole('button', { name: 'Mark as unread' })).toBeVisible()

  await slideover(page).getByRole('button', { name: 'Close entry' }).click()
  await expect(row(page, 'Hello there')).not.toHaveClass(/font-semibold/)
  await expect(tab(page, 'Unread')).toContainText('1')

  await tab(page, 'Unread').click()
  await expect(page).toHaveURL(/status=unread/)
  await expect(row(page, 'Hello there')).toHaveCount(0)
  await expect(row(page, 'First')).toBeVisible()
})

test('bulk star reports how many entries changed', async ({ page }) => {
  await signIn(page)
  const form = await createForm(page, 'Bulk')
  const entries = []

  for (const message of ['One', 'Two', 'Three']) {
    entries.push(await addEntry(page, form.id, { name: 'Sam', message }))
  }
  await page.request.put(`/api/backend/entries/${entries[0]!.id}`, { data: { starred: true } })

  await goto(page, `/forms/${form.id}/entries`)
  await page.getByRole('checkbox', { name: 'Select all on this page' }).click()
  const bar = page.getByRole('toolbar', { name: 'Bulk actions' })
  await expect(bar).toContainText('3 selected')
  await bar.getByRole('button', { name: 'Star', exact: true }).click()

  await expect(page.getByText('2 entries starred', { exact: true })).toBeVisible()
  await expect(bar).toHaveCount(0)
  await tab(page, 'Starred').click()
  await expect(page.locator('tbody tr')).toHaveCount(3)
})

test('delete with undo, then delete permanently from Trash', async ({ page }) => {
  await signIn(page)
  const form = await createForm(page, 'Trash')
  const entry = await addEntry(page, form.id, { name: 'Pat', message: 'Erase me' })

  // A direct link opens the full page.
  await goto(page, `/forms/${form.id}/entries/${entry.id}`)
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('Entry moved to Trash', { exact: true })).toBeVisible()
  await expect(row(page, 'Erase me')).toHaveCount(0)

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText('Entry restored', { exact: true })).toBeVisible()
  await expect(row(page, 'Erase me')).toBeVisible()

  await row(page, 'Erase me').getByText('Erase me').click()
  await slideover(page).getByRole('button', { name: 'Delete' }).click()
  await expect(row(page, 'Erase me')).toHaveCount(0)

  await tab(page, 'Trash').click()
  await row(page, 'Erase me').getByText('Erase me').click()
  await slideover(page).getByRole('button', { name: 'Delete permanently' }).click()
  await page
    .getByRole('alertdialog', { name: 'Permanently delete this entry?' })
    .getByRole('button', { name: 'Delete permanently' })
    .click()
  await expect(page.getByText('Entry permanently deleted', { exact: true })).toBeVisible()
  await expect(page.getByText('Trash is empty.')).toBeVisible()

  for (const status of ['inbox', 'starred', 'spam', 'trash']) {
    const list = await page.request.get(`/api/backend/forms/${form.id}/entries`, {
      params: status === 'trash' ? { 'filter[trashed]': 'with' } : {},
    })
    expect((await list.json()).meta.total).toBe(0)
  }
})

test('filters and sort survive a reload, and previous/next follow them', async ({ page }) => {
  await signIn(page)
  const form = await createForm(page, 'Order')

  for (const message of ['Alpha', 'Bravo', 'Charlie']) {
    await addEntry(page, form.id, { name: 'Lee', message })
  }
  const read = await addEntry(page, form.id, { name: 'Lee', message: 'Already read' })
  await page.request.put(`/api/backend/entries/${read.id}`, {
    data: { read_at: new Date().toISOString() },
  })

  await goto(page, `/forms/${form.id}/entries`)
  await tab(page, 'Unread').click()
  await page.getByRole('combobox', { name: 'Sort entries' }).click()
  await page.getByRole('option', { name: 'Oldest first' }).click()
  await expect(page).toHaveURL(/status=unread/)
  await expect(page).toHaveURL(/sort=created_at/)

  await reload(page)
  await expect(tab(page, 'Unread')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('combobox', { name: 'Sort entries' })).toContainText('Oldest first')
  await expect(page.locator('tbody tr')).toHaveCount(3)
  await expect(page.locator('tbody tr').first()).toContainText('Alpha')

  await row(page, 'Alpha').getByText('Alpha').click()
  await expect(page).toHaveURL(/status=unread/)
  // Opening "Alpha" marks it read, so it leaves Unread; "next" still follows the list.
  await slideover(page).getByRole('button', { name: 'Next entry' }).click()
  await expect(slideover(page).getByText('Bravo')).toBeVisible()
  await slideover(page).getByRole('button', { name: 'Next entry' }).click()
  await expect(slideover(page).getByText('Charlie')).toBeVisible()
  await expect(slideover(page).getByRole('button', { name: 'Next entry' })).toBeDisabled()
  await expect(page).toHaveURL(/sort=created_at/)
})

test('previous/next load the adjacent page', async ({ page }) => {
  await signIn(page)
  const form = await createForm(page, 'Pages')

  for (let i = 1; i <= 16; i++) {
    await addEntry(page, form.id, { name: 'Kim', message: `Message ${String(i).padStart(2, '0')}` })
  }

  await goto(page, `/forms/${form.id}/entries?sort=created_at`)
  await row(page, 'Message 15').getByText('Message 15').click()
  await slideover(page).getByRole('button', { name: 'Next entry' }).click()
  await expect(slideover(page).getByText('Message 16')).toBeVisible()
  await expect(page).toHaveURL(/page=2/)
  await slideover(page).getByRole('button', { name: 'Previous entry' }).click()
  await expect(slideover(page).getByText('Message 15')).toBeVisible()
  await expect(page).not.toHaveURL(/page=2/)
})

test('hostile submissions are shown as plain text', async ({ page, request }) => {
  await signIn(page)
  const form = await createForm(page, 'Hostile')
  const payload = '<img src=x onerror=alert(1)>'
  let dialogs = 0
  page.on('dialog', (dialog) => {
    dialogs += 1
    void dialog.dismiss()
  })

  const response = await request.post(`${backendPublicUrl}/v1/forms/${form.id}/submissions`, {
    data: { name: 'javascript:alert(1)', message: payload, sneaky: '<script>alert(2)</script>' },
    headers: { Accept: 'application/json', Referer: 'javascript:alert(3)' },
  })
  expect(response.status()).toBe(201)

  await goto(page, `/forms/${form.id}/entries`)
  await expect(row(page, payload)).toBeVisible()
  await row(page, payload).getByText(payload).click()

  const detail = slideover(page)
  await expect(detail.getByText(payload, { exact: true })).toBeVisible()
  await expect(detail.getByText('javascript:alert(1)', { exact: true })).toBeVisible()
  await expect(detail.getByText('javascript:alert(3)', { exact: true })).toBeVisible()
  await expect(detail.locator('img')).toHaveCount(0)
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0)
  expect(dialogs).toBe(0)
})

test('a flagged entry shows in Spam with its likelihood, and Not spam moves it back', async ({
  page,
}) => {
  await signIn(page)
  const form = await createForm(page, 'Spam')
  await addEntry(page, form.id, { name: 'Real', message: 'Genuine question' })
  const spam = await addEntry(page, form.id, { name: 'Bot', message: 'Cheap SEO backlinks' })
  // What the classifier records for an entry it flags.
  await page.request.put(`/api/backend/entries/${spam.id}`, {
    data: { spam: true, spam_score: 0.95, spam_reason: 'Jev classified this entry as spam.' },
  })

  await goto(page, `/forms/${form.id}/entries`)
  await expect(tab(page, 'Inbox')).toContainText('1')
  await expect(tab(page, 'Spam')).toContainText('1')
  await expect(row(page, 'Cheap SEO')).toHaveCount(0)

  await tab(page, 'Spam').click()
  await expect(row(page, 'Cheap SEO').getByText('Spam', { exact: true })).toBeVisible()
  await row(page, 'Cheap SEO').getByText('Cheap SEO').click()
  await expect(slideover(page).getByText('95% likely spam')).toBeVisible()
  await expect(slideover(page).getByText('Jev classified this entry as spam.')).toBeVisible()

  await slideover(page).getByRole('button', { name: 'Not spam' }).click()
  await expect(page.getByText('Marked as not spam', { exact: true })).toBeVisible()
  await slideover(page).getByRole('button', { name: 'Close entry' }).click()
  await expect(row(page, 'Cheap SEO')).toHaveCount(0)
  await expect(tab(page, 'Inbox')).toContainText('2')
  await expect(tab(page, 'Spam')).toContainText('0')
  await expect(tab(page, 'Unread')).toContainText('1')
})

test('select all at page size 100, then a bulk action', async ({ page }) => {
  await signIn(page)
  const form = await createForm(page, 'Hundred')

  for (const message of ['A', 'B', 'C', 'D']) {
    await addEntry(page, form.id, { name: 'Jo', message })
  }

  await goto(page, `/forms/${form.id}/entries?per_page=100`)
  await page.getByRole('checkbox', { name: 'Select all on this page' }).click()
  await page
    .getByRole('toolbar', { name: 'Bulk actions' })
    .getByRole('button', { name: 'Mark read' })
    .click()
  await expect(page.getByText('4 entries marked read', { exact: true })).toBeVisible()
  await expect(tab(page, 'Unread')).toContainText('0')
})

test('a public submission shows its spam check state', async ({ page, request }) => {
  await signIn(page)
  const form = await createForm(page, 'Check')

  const response = await request.post(`${backendPublicUrl}/v1/forms/${form.id}/submissions`, {
    data: { name: 'Robin', message: 'Is this checked?' },
    headers: { Accept: 'application/json' },
  })
  expect(response.status()).toBe(201)

  const entry = (await (await page.request.get(`/api/backend/forms/${form.id}/entries`)).json())
    .data[0]

  await goto(page, `/forms/${form.id}/entries`)
  await row(page, 'Is this checked?').getByText('Is this checked?').click()
  const detail = slideover(page)

  // Without a classifier key the check never records a time, so the entry shows as being checked
  // for two minutes; with one, it's checked straight away (the API's queue runs synchronously).
  if (entry.spam_checked_at) {
    await expect(detail.getByText(/Checked/)).toBeVisible()
  } else {
    await expect(detail.getByText('Checking for spam…')).toBeVisible()
    await expect(row(page, 'Is this checked?').getByText('Checking…')).toBeAttached()
  }
})

test('a direct link opens the entry as a full page; from the list it opens over the list', async ({
  page,
}) => {
  await signIn(page)
  const form = await createForm(page, 'Direct')
  const entry = await addEntry(page, form.id, { name: 'Ali', message: 'Linked directly' })

  await goto(page, `/forms/${form.id}/entries/${entry.id}`)
  await expect(slideover(page)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Entry', exact: true })).toBeVisible()
  await expect(page.getByText('Linked directly')).toBeVisible()
  await page.getByRole('link', { name: 'Back to entries' }).click()
  await expect(page).toHaveURL(`/forms/${form.id}/entries`)

  await page.getByRole('combobox', { name: 'Sort entries' }).click()
  await page.getByRole('option', { name: 'Oldest first' }).click()
  await expect(page).toHaveURL(/sort=created_at/)
  await row(page, 'Linked directly').getByText('Linked directly').click()
  await expect(slideover(page)).toBeVisible()
  // The list stays behind the slide-over (hidden from assistive technology while it's open).
  await expect(page.locator('table')).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/entries/${entry.id}\\?sort=created_at$`))

  await page.keyboard.press('Escape')
  await expect(slideover(page)).toHaveCount(0)
  await expect(page).toHaveURL(`/forms/${form.id}/entries?sort=created_at`)
})

test("an invalid date range shows The Backend's message on the date filter", async ({ page }) => {
  await signIn(page)
  const form = await createForm(page, 'Dates')

  await goto(page, `/forms/${form.id}/entries?from=2026-10-05&to=2026-10-01`)

  await expect(
    page.getByRole('button', { name: /^Received date: .*2026 – .*2026 \(UTC\)$/ }),
  ).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('#entry-date-error')).toContainText(/after or equal/)
})
