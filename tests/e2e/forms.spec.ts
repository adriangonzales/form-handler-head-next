import { expect, type Page, test } from '@playwright/test'
import { backendApiUrl } from '../support/env'
import { createThrowawayUser } from '../support/throwaway-user'
import {
  backendPublicUrl,
  createFormViaApi,
  deleteFormViaApi,
  goto,
  reload,
  schemaFields,
  signIn,
  uniqueName,
} from './support'

const created: string[] = []

async function track<T extends { id: string }>(form: Promise<T>) {
  const value = await form

  created.push(value.id)

  return value
}

/** The form ID in a /forms/[formId]/… URL. */
const formIdFrom = (url: string) => new URL(url).pathname.split('/')[2]!

test.afterEach(async ({ page }) => {
  for (const id of created.splice(0)) await deleteFormViaApi(page, id)
})

function formRow(page: Page, name: string) {
  return page.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) })
}

test('create a form from a template, then turn it on', async ({ page }) => {
  await signIn(page)
  const name = uniqueName('Contact')

  await page.getByRole('link', { name: 'New form' }).first().click()
  await page.getByLabel('Name', { exact: true }).fill(name)
  await page.getByRole('radio', { name: /^Contact/ }).check()
  await page.getByRole('button', { name: 'Create form' }).click()

  await expect(page).toHaveURL(/\/forms\/[0-9a-z]{26}\/integrate$/i)
  created.push(formIdFrom(page.url()))
  await expect(page.getByText(`Created “${name}”`, { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name })).toBeVisible()

  const toggle = page.getByRole('switch')
  await expect(toggle).not.toBeChecked()
  await toggle.click()
  await expect(toggle).toBeChecked()
  await expect(page.getByText(`“${name}” is accepting submissions`)).toBeVisible()

  await page.getByRole('link', { name: 'Back to forms' }).click()
  const firstRow = page.locator('tbody tr').first()
  await expect(firstRow.getByRole('link', { name, exact: true })).toBeVisible()
  await expect(firstRow.getByText('Active', { exact: true })).toBeVisible()

  // The template's fields were saved with the form.
  const form = await (await page.request.get(`/api/backend/forms/${created[0]}`)).json()
  expect(form.data.schema.map((field: { name: string }) => field.name)).toEqual([
    'name',
    'email',
    'message',
  ])
})

test('a form needs a name', async ({ page }) => {
  await signIn(page, '/forms/new')
  await page.getByRole('button', { name: 'Create form' }).click()

  await expect(page.getByText('Give the form a name.')).toBeVisible()
  await expect(page).toHaveURL('/forms/new')
})

test('sort, filter and page size live in the URL', async ({ page }) => {
  await signIn(page)
  const inactive = await track(createFormViaApi(page, uniqueName('AAA Inactive')))

  await goto(page, '/forms')
  await page.getByRole('tab', { name: 'Inactive' }).click()
  await expect(page).toHaveURL(/active=false/)
  await page.getByRole('combobox', { name: 'Sort forms' }).click()
  await page.getByRole('option', { name: 'Name A–Z' }).click()
  await expect(page).toHaveURL(/sort=name/)
  await page.getByRole('combobox', { name: 'Rows per page' }).click()
  await page.getByRole('option', { name: '25' }).click()
  await expect(page).toHaveURL(/per_page=25/)

  await reload(page)
  await expect(page.getByRole('tab', { name: 'Inactive' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('combobox', { name: 'Sort forms' })).toContainText('Name A–Z')
  await expect(formRow(page, inactive.name)).toBeVisible()

  await page.goBack()
  await expect(page).not.toHaveURL(/per_page=25/)
  await expect(page).toHaveURL(/sort=name/)
  await expect(page.getByRole('combobox', { name: 'Sort forms' })).toContainText('Name A–Z')

  // The page size chosen last is the default for the next visit.
  await goto(page, '/forms')
  await expect(page).toHaveURL(/per_page=25/)
})

test('the forms list shows entry, unread and spam counts', async ({ page, request }) => {
  await signIn(page)
  const form = await track(
    createFormViaApi(page, uniqueName('Counts'), {
      schema: schemaFields({ message: { label: 'Message', rules: ['required'] } }),
    }),
  )
  await page.request.put(`/api/backend/forms/${form.id}`, {
    data: { name: form.name, active: true },
  })

  for (const message of ['Hello, I would like a quote.', 'Can you call me back tomorrow?']) {
    const response = await request.post(`${backendPublicUrl}/v1/forms/${form.id}/submissions`, {
      data: { message },
      headers: { Accept: 'application/json' },
    })

    expect(response.status()).toBe(201)
  }

  const entries = (await (await page.request.get(`/api/backend/forms/${form.id}/entries`)).json())
    .data
  await page.request.put(`/api/backend/entries/${entries[0].id}`, {
    data: { read_at: new Date().toISOString() },
  })

  await goto(page, '/forms')
  const row = formRow(page, form.name)
  await expect(row.getByRole('cell').nth(2)).toHaveText('2')
  await expect(row.getByRole('link', { name: '1 unread' })).toHaveAttribute(
    'href',
    `/forms/${form.id}/entries?status=unread`,
  )

  await page.request.put(`/api/backend/entries/${entries[1].id}`, { data: { spam: true } })
  await reload(page)
  await expect(row.getByRole('cell').nth(2)).toHaveText('1')
  await expect(row.getByText(/unread/)).toHaveCount(0)
  await expect(row.getByRole('cell').nth(4)).toHaveText('1')
})

test('settings save, and a generated honeypot name is shown', async ({ page }) => {
  await signIn(page)
  const form = await track(createFormViaApi(page, uniqueName('Settings')))

  await goto(page, `/forms/${form.id}/settings`)
  await page.getByLabel('Success message').fill('Thanks, we will be in touch.')
  await page.getByLabel('Redirect URL').fill('https://example.com/thanks')
  await page.getByRole('textbox', { name: 'Allowed domains' }).fill('example.com')
  await page.getByRole('textbox', { name: 'Allowed domains' }).press('Enter')
  await page.getByRole('combobox', { name: 'Timezone' }).click()
  await page.getByRole('combobox', { name: 'Search timezones' }).fill('Chicago')
  await page.getByRole('option', { name: 'America/Chicago' }).click()
  await page.getByRole('switch', { name: 'Honeypot field' }).click()
  await page.getByRole('button', { name: 'Save settings' }).click()

  await expect(page.getByText('Settings saved', { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Honeypot input name' })).toHaveValue(
    /^[a-z]+_[a-z0-9]{6}$/,
  )
  await expect(page.getByRole('button', { name: 'Save settings' })).toBeDisabled()

  await reload(page)
  await expect(page.getByLabel('Success message')).toHaveValue('Thanks, we will be in touch.')
  await expect(page.getByLabel('Redirect URL')).toHaveValue('https://example.com/thanks')
  await expect(page.getByRole('button', { name: 'Remove example.com' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Timezone' })).toHaveText('America/Chicago')
})

test('validation errors appear on the right field', async ({ page }) => {
  await signIn(page)
  const form = await track(
    createFormViaApi(page, uniqueName('Clash'), {
      schema: schemaFields({ email: { label: 'Email', rules: ['required', 'email'] } }),
    }),
  )

  await goto(page, `/forms/${form.id}/settings`)

  // Checked in the browser: not a bare hostname.
  const domains = page.getByRole('textbox', { name: 'Allowed domains' })
  await domains.fill('https://example.com/path')
  await domains.press('Enter')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText(/Use bare hostnames such as example.com/)).toBeVisible()
  await expect(domains).toHaveAttribute('aria-invalid', 'true')
  await page.getByRole('button', { name: 'Discard changes' }).click()

  // Checked by The Backend: the honeypot can't share a name with a field.
  await page.getByRole('switch', { name: 'Honeypot field' }).click()
  const honeypotName = page.getByRole('textbox', { name: 'Honeypot input name' })
  await honeypotName.fill('email')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(honeypotName).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText('Settings saved')).toHaveCount(0)
})

test('leaving with unsaved changes asks first', async ({ page }) => {
  await signIn(page)
  const form = await track(createFormViaApi(page, uniqueName('Unsaved')))

  await goto(page, `/forms/${form.id}/settings`)
  await page.getByLabel('Success message').fill('Not saved yet')

  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('link', { name: 'Entries' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.getByLabel('Success message')).toHaveValue('Not saved yet')

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('link', { name: 'Entries' }).click()
  await expect(page).toHaveURL(/\/entries$/)
})

test('delete a form, then undo', async ({ page }) => {
  await signIn(page)
  const form = await track(createFormViaApi(page, uniqueName('Delete me')))

  await goto(page, '/forms')
  await formRow(page, form.name)
    .getByRole('button', { name: `Actions for ${form.name}` })
    .click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()

  await expect(page.getByText(`Deleted “${form.name}”`, { exact: true })).toBeVisible()
  await expect(formRow(page, form.name)).toHaveCount(0)
  expect((await page.request.get(`/api/backend/forms/${form.id}`)).status()).toBe(404)

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText(`Restored “${form.name}”`, { exact: true })).toBeVisible()
  await expect(formRow(page, form.name)).toBeVisible()
})

test('deleting from inside a form returns to the list', async ({ page }) => {
  await signIn(page)
  const form = await track(createFormViaApi(page, uniqueName('Delete inside')))

  await goto(page, `/forms/${form.id}/settings`)
  await page.getByRole('button', { name: 'Delete form' }).click()

  await expect(page).toHaveURL('/forms')
  await expect(page.getByText(`Deleted “${form.name}”`, { exact: true })).toBeVisible()
  await expect(formRow(page, form.name)).toHaveCount(0)
})

test('duplicate a form', async ({ page }) => {
  await signIn(page)
  const form = await track(createFormViaApi(page, uniqueName('Original')))

  await goto(page, `/forms/${form.id}/settings`)
  await page.getByRole('button', { name: 'Form actions' }).click()
  await page.getByRole('menuitem', { name: 'Duplicate' }).click()

  await expect(page).not.toHaveURL(new RegExp(form.id))
  await expect(page).toHaveURL(/\/settings$/)
  created.push(formIdFrom(page.url()))
  await expect(page.getByText(/The copy is inactive/)).toBeVisible()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(new RegExp(`^${form.name}`))
  await expect(page.getByRole('switch', { name: /Active|Inactive/ })).not.toBeChecked()
})

test('an unknown form shows the not-found page', async ({ page }) => {
  await signIn(page)
  const response = await page.goto('/forms/01jzzzzzzzzzzzzzzzzzzzzzzz/settings')

  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to forms' })).toBeVisible()
})

test("someone else's form shows the access-denied page", async ({ page }) => {
  const other = createThrowawayUser('Other')
  const api = backendApiUrl()
  const json = { Accept: 'application/json', 'Content-Type': 'application/json' }
  const login = await page.request.post(`${api}/v1/auth/login`, {
    headers: json,
    data: { email: other.email, password: other.password },
  })
  const { access_token: token } = await login.json()
  const auth = { ...json, Authorization: `Bearer ${token}` }

  try {
    const form = await page.request.post(`${api}/v1/forms`, {
      headers: auth,
      data: { name: 'Not yours' },
    })
    const { data } = await form.json()

    await signIn(page)
    const response = await page.goto(`/forms/${data.id}/settings`)

    expect(response?.status()).toBe(403)
    await expect(page.getByRole('heading', { name: "You don't have access to this" })).toBeVisible()
  } finally {
    await page.request.delete(`${api}/v1/auth/me?password=${encodeURIComponent(other.password)}`, {
      headers: auth,
    })
  }
})
