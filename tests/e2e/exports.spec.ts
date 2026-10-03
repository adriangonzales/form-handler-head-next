import { readFile } from 'node:fs/promises'
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

// Exports are built in the background: against the reference Backend these tests need its queue
// worker running (see the README).

const created: string[] = []

test.afterEach(async ({ page }) => {
  for (const id of created.splice(0)) {
    await deleteFormViaApi(page, id)
  }
})

const schema = [
  { id: '01K6E2E0000000000000000001', order: 1, label: 'Full name', name: 'name' },
  { id: '01K6E2E0000000000000000002', order: 2, label: 'Your message', name: 'message' },
]

async function createForm(page: Page, prefix: string) {
  const form = await createFormViaApi(page, uniqueName(prefix), { schema })

  created.push(form.id)
  // Entries can only be added to an active form.
  await page.request.put(`/api/backend/forms/${form.id}`, {
    data: { name: form.name, active: true },
  })

  return form
}

async function addEntry(page: Page, formId: string, input: Record<string, string>) {
  const response = await page.request.post(`/api/backend/forms/${formId}/entries`, { data: input })

  expect(response.status(), await response.text()).toBe(201)

  return (await response.json()).data as { id: string }
}

async function startExport(page: Page, formId: string, body: Record<string, unknown> = {}) {
  const response = await page.request.post(`/api/backend/forms/${formId}/entries/exports`, {
    data: body,
  })

  expect(response.status(), await response.text()).toBe(202)

  return (await response.json()).data as { id: string; form_id: string }
}

const exportsPopover = (page: Page) =>
  page.getByRole('dialog').filter({ has: page.getByText('Recent exports') })

/** Splits a CSV line, enough for the simple values these tests write. */
function cells(line: string) {
  return line.split(',').map((cell) => cell.replace(/^"|"$/g, ''))
}

test('export the Starred tab, then download a CSV with the schema columns', async ({ page }) => {
  await signIn(page)
  const form = await createForm(page, 'Export')

  for (const message of ['First', 'Second', 'Third']) {
    const entry = await addEntry(page, form.id, { name: 'Ana', message })

    if (message !== 'Second') {
      await page.request.put(`/api/backend/entries/${entry.id}`, { data: { starred: true } })
    }
  }

  await goto(page, `/forms/${form.id}/entries?status=starred`)
  await expect(page.locator('tbody tr')).toHaveCount(2)
  await page.getByRole('button', { name: 'Export CSV' }).click()

  const popover = exportsPopover(page)
  await expect(popover).toBeVisible()
  await expect(popover.getByText('Starred · newest first')).toBeVisible()
  await expect(popover.getByText('2 entries')).toBeVisible({ timeout: 20_000 })

  const downloading = page.waitForEvent('download')
  await popover.getByRole('button', { name: /^Download / }).click()
  const download = await downloading

  // The link points at The Backend's public origin, not this app.
  expect(new URL(download.url()).host).toBe(new URL(backendPublicUrl).host)
  expect(download.suggestedFilename()).toMatch(/-entries-\d{4}-\d{2}-\d{2}\.csv$/)
  const lines = (await readFile((await download.path())!, 'utf8')).trim().split(/\r?\n/)
  const header = cells(lines[0]!.replace(/^﻿/, ''))

  expect(header.slice(0, 4)).toEqual(['id', 'created_at', 'Full name', 'Your message'])
  expect(header).toContain('spam_checked_at')
  expect(lines).toHaveLength(3)
  // Newest first, as in the table.
  expect(cells(lines[1]!)[3]).toBe('Third')
  expect(cells(lines[2]!)[3]).toBe('First')
})

test('an export that finishes while the popover is closed announces itself', async ({ page }) => {
  await signIn(page)
  const form = await createForm(page, 'Announce')
  await addEntry(page, form.id, { name: 'Di', message: 'Hello' })

  await goto(page, `/forms/${form.id}/entries`)
  await page.getByRole('button', { name: 'Export CSV' }).click()
  await expect(exportsPopover(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(exportsPopover(page)).toBeHidden()

  const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Export ready' })
  await expect(toast).toContainText('1 entry', { timeout: 20_000 })
  await expect(page.getByRole('link', { name: 'Exports', exact: true })).toBeVisible()

  const downloading = page.waitForEvent('download')
  await toast.getByRole('button', { name: 'Download' }).click()
  await downloading
})

test('Download fetches the export again for a fresh link', async ({ page }) => {
  await signIn(page)
  const form = await createForm(page, 'Fresh link')
  await addEntry(page, form.id, { name: 'Bo', message: 'Hi' })
  const entryExport = await startExport(page, form.id, { sort: '-created_at' })

  await goto(page, `/forms/${form.id}/entries`)
  await page.getByRole('button', { name: /^Exports/ }).click()
  const popover = exportsPopover(page)
  await expect(popover.getByText('1 entry')).toBeVisible({ timeout: 20_000 })

  const refetch = page.waitForRequest(
    (request) =>
      request.method() === 'GET' &&
      request.url().endsWith(`/api/backend/entry-exports/${entryExport.id}`),
  )
  const downloading = page.waitForEvent('download')
  await popover.getByRole('button', { name: /^Download / }).click()
  await refetch
  await downloading
})

test('an export started elsewhere is listed with its live status after a reload', async ({
  page,
}) => {
  await signIn(page)
  const form = await createForm(page, 'Elsewhere')
  await goto(page, `/forms/${form.id}/entries`)

  // Started outside this page, as from another browser.
  await startExport(page, form.id, { filter: { spam: 'false' }, sort: '-created_at' })
  await reload(page)

  await page.getByRole('button', { name: /^Exports/ }).click()
  const popover = exportsPopover(page)
  await expect(popover.getByText('Inbox · newest first')).toBeVisible()
  await expect(popover.getByText('0 entries')).toBeVisible({ timeout: 20_000 })
})

test('a failed export shows its error, and Try again starts one with the same filters', async ({
  page,
}) => {
  await signIn(page)
  const form = await createForm(page, 'Failed')
  const entryExport = await startExport(page, form.id, {
    filter: { spam: 'true' },
    sort: 'created_at',
  })

  // The Backend only fails an export when its form is deleted, and then hides it, so fake it.
  await page.route('**/api/backend/entry-exports?*', async (route) => {
    const response = await route.fetch()
    const body = await response.json()

    for (const row of body.data) {
      if (row.id === entryExport.id) {
        Object.assign(row, { status: 'failed', error: 'The disk was full.', download_url: null })
      }
    }

    await route.fulfill({ response, json: body })
  })

  await goto(page, `/forms/${form.id}/entries`)
  await page.getByRole('button', { name: /^Exports/ }).click()
  const popover = exportsPopover(page)
  await expect(popover.getByText('The disk was full.')).toBeVisible()

  const retried = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().endsWith(`/forms/${form.id}/entries/exports`),
  )
  await popover.getByRole('button', { name: 'Try again' }).click()
  expect((await retried).postDataJSON()).toEqual({ filter: { spam: 'true' }, sort: 'created_at' })
  await expect(popover.getByText('Spam · oldest first')).toHaveCount(2)
})

test('an expired export is removed when downloaded', async ({ page }) => {
  await signIn(page)
  const form = await createForm(page, 'Expired')
  const entryExport = await startExport(page, form.id)

  await goto(page, `/forms/${form.id}/entries`)
  await page.getByRole('button', { name: /^Exports/ }).click()
  const popover = exportsPopover(page)
  await expect(popover.getByText('0 entries')).toBeVisible({ timeout: 20_000 })

  await page.route(`**/api/backend/entry-exports/${entryExport.id}`, (route) =>
    route.fulfill({ status: 404, json: { message: 'Not found.' } }),
  )
  await popover.getByRole('button', { name: /^Download / }).click()
  await expect(page.getByText('This export has expired', { exact: true })).toBeVisible()
  await expect(popover.getByText('0 entries')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Export again' })).toBeVisible()
})

test('the Exports page lists exports across forms, without those of deleted forms', async ({
  page,
}) => {
  await signIn(page)
  const first = await createForm(page, 'Exports A')
  const second = await createForm(page, 'Exports B')
  const deleted = await createFormViaApi(page, uniqueName('Exports gone'), { schema })

  await startExport(page, first.id, { filter: { read: 'false', spam: 'false' } })
  await startExport(page, second.id, { filter: { trashed: 'only' }, sort: '-created_at' })
  await startExport(page, deleted.id)
  await deleteFormViaApi(page, deleted.id)

  await goto(page, '/exports')
  const firstRow = page.locator('tbody tr').filter({ hasText: first.name })
  const secondRow = page.locator('tbody tr').filter({ hasText: second.name })

  await expect(firstRow).toContainText('Unread · oldest first')
  await expect(secondRow).toContainText('Trash · newest first')
  await expect(firstRow.getByRole('link', { name: first.name })).toHaveAttribute(
    'href',
    `/forms/${first.id}/entries`,
  )
  // Unknown forms fall back to the filename, which starts with the form's slug.
  const deletedSlug = deleted.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  await expect(page.locator('tbody tr').filter({ hasText: deletedSlug })).toHaveCount(0)
  await expect(page.locator('tbody tr').filter({ hasText: deleted.name })).toHaveCount(0)
  await expect(firstRow.getByRole('button', { name: /^Download / })).toBeVisible({
    timeout: 20_000,
  })
})
