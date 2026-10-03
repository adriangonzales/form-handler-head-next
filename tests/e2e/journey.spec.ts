import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { deleteFormViaApi, e2eUser, goto, hydrated, signIn, uniqueName } from './support'

/**
 * The happy path through every milestone, in the UI only: sign in, create a form from a template,
 * turn it on, send a test submission, find it on the forms list and in the Inbox, star it, export
 * the Starred tab, add a recipient, and sign out. Needs The Backend's queue worker for the export.
 */

let formId: string | undefined

test.afterEach(async ({ page }) => {
  if (!formId) return

  // The journey ends signed out, so sign in again to clean up.
  if ((await page.request.get('/api/backend/forms')).status() === 401) await signIn(page)
  await deleteFormViaApi(page, formId)
  formId = undefined
})

test('from sign-in to export and sign-out', async ({ page }) => {
  test.slow()
  const user = e2eUser()
  const name = uniqueName('Journey')
  const message = `Hello from the journey test ${Date.now()}`

  await test.step('sign in', async () => {
    await goto(page, '/')
    await expect(page).toHaveURL(/\/login/)
    await page.getByLabel('Email').fill(user.email)
    await page.getByLabel('Password').fill(user.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL('/forms')
    await hydrated(page)
  })

  await test.step('create a form from the Contact template and turn it on', async () => {
    await page.getByRole('link', { name: 'New form' }).first().click()
    await page.getByLabel('Name', { exact: true }).fill(name)
    await page.getByRole('radio', { name: /^Contact/ }).check()
    await page.getByRole('button', { name: 'Create form' }).click()

    await expect(page).toHaveURL(/\/forms\/[0-9a-z]{26}\/integrate$/i)
    formId = page.url().split('/').at(-2)

    await page.getByRole('button', { name: 'Turn on' }).click()
    await expect(page.getByText('This form is inactive', { exact: true })).toHaveCount(0)
  })

  await test.step('send a test submission', async () => {
    const testForm = page.getByRole('form', { name: 'Test submission' })

    await testForm.getByRole('textbox', { name: 'Name' }).fill('Ada Lovelace')
    await testForm.getByRole('textbox', { name: 'Email' }).fill('ada@example.com')
    await testForm.getByRole('textbox', { name: 'Message' }).fill(message)
    await page.getByRole('button', { name: 'Send test submission' }).click()
    await expect(page.getByText('Submission accepted')).toBeVisible()
  })

  await test.step('the forms list counts it as unread', async () => {
    await page.getByRole('link', { name: 'Forms', exact: true }).first().click()
    const row = page.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) })

    await expect(row.getByRole('link', { name: '1 unread' })).toBeVisible()
    await row.getByRole('link', { name, exact: true }).click()
  })

  await test.step('it is in the Inbox, and starring it moves it to Starred', async () => {
    await expect(page).toHaveURL(/\/entries$/)
    const entry = page.locator('tbody tr').filter({ hasText: message })

    await expect(entry).toBeVisible()
    await entry.getByRole('checkbox').check()
    await page
      .getByRole('toolbar', { name: 'Bulk actions' })
      .getByRole('button', { name: 'Star', exact: true })
      .click()
    await expect(page.getByText('1 entry starred', { exact: true })).toBeVisible()

    await page.getByRole('tab', { name: /^Starred/ }).click()
    await expect(page).toHaveURL(/status=starred/)
    await expect(page.locator('tbody tr').filter({ hasText: message })).toBeVisible()
  })

  await test.step('export the Starred tab and download the CSV', async () => {
    await page.getByRole('button', { name: 'Export CSV' }).click()
    const popover = page.getByRole('dialog').filter({ has: page.getByText('Recent exports') })

    await expect(popover.getByText('1 entry')).toBeVisible({ timeout: 20_000 })

    const downloading = page.waitForEvent('download')
    await popover.getByRole('button', { name: /^Download / }).click()
    const csv = await readFile((await (await downloading).path())!, 'utf8')

    expect(csv).toContain(message)
    await page.keyboard.press('Escape')
  })

  await test.step('add an email recipient', async () => {
    await page.getByRole('link', { name: 'Notifications' }).click()
    await page.getByRole('button', { name: 'Add recipient' }).first().click()
    await page.getByRole('dialog').getByLabel('Email address').fill('alerts@example.com')
    await page.getByRole('dialog').getByRole('button', { name: 'Add recipient' }).click()
    await expect(page.locator('tbody').getByText('alerts@example.com')).toBeVisible()
  })

  await test.step('sign out', async () => {
    await page.getByRole('button', { name: `Account menu for ${user.name}` }).click()
    await page.getByRole('menuitem', { name: 'Log out' }).click()
    await expect(page).toHaveURL('/login?reason=signed-out')
  })
})
