import { expect, type Page, test } from '@playwright/test'
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

test.afterEach(async ({ page }) => {
  for (const id of created.splice(0)) {
    await deleteFormViaApi(page, id)
  }
})

async function newForm(page: Page, body: Record<string, unknown> = {}) {
  const form = await createFormViaApi(page, uniqueName('Fields'), body)

  created.push(form.id)

  return form
}

function row(page: Page, position: number) {
  return page.locator(`[data-field-row="${position}"]`)
}

async function addField(page: Page, label: string) {
  const add = page.getByRole('button', { name: 'Add field' })

  await add.first().click()
  await page.locator('[data-field-label]').last().fill(label)
}

const ulid = /^[0-7][0-9a-hjkmnp-tv-z]{25}$/

test('build fields, reorder them, save and reload', async ({ page }) => {
  await signIn(page)
  const form = await newForm(page)
  await goto(page, `/forms/${form.id}/fields`)

  await addField(page, 'Full name')
  await row(page, 1).getByRole('checkbox', { name: 'Required' }).check()
  await row(page, 1).getByRole('textbox', { name: 'Max' }).fill('255')

  await addField(page, 'Email address')
  await row(page, 2).getByRole('checkbox', { name: 'Required' }).check()
  await row(page, 2).getByRole('checkbox', { name: 'Email address' }).check()
  await row(page, 2).getByRole('textbox', { name: 'Input name' }).fill('contact_email')

  await addField(page, 'Topic')
  const oneOf = row(page, 3).getByRole('textbox', { name: 'One of' })
  await oneOf.fill('sales')
  await oneOf.press('Enter')
  await oneOf.fill('support')
  await oneOf.press('Enter')
  await page.getByRole('button', { name: 'Move Topic up' }).click()

  const ids = await page.locator('[data-field-id]').allTextContents()
  expect(ids.every((id) => ulid.test(id))).toBe(true)

  await page.getByRole('button', { name: 'Save fields' }).click()
  await expect(page.getByText('Fields saved', { exact: true })).toBeVisible()

  await reload(page)
  await expect(row(page, 1).getByRole('textbox', { name: 'Input name' })).toHaveValue('full_name')
  await expect(row(page, 2).getByRole('textbox', { name: 'Input name' })).toHaveValue('topic')
  await expect(row(page, 3).getByRole('textbox', { name: 'Input name' })).toHaveValue(
    'contact_email',
  )
  await expect(row(page, 3).getByRole('checkbox', { name: 'Email address' })).toBeChecked()
  await expect(row(page, 1).getByRole('textbox', { name: 'Max' })).toHaveValue('255')
  await expect(row(page, 2).getByText('support', { exact: true })).toBeVisible()
  // Captured after moving Topic up, so `ids` is already Full name, Topic, Email address.
  expect(await page.locator('[data-field-id]').allTextContents()).toEqual(ids)

  const saved = await (await page.request.get(`/api/backend/forms/${form.id}`)).json()
  expect(saved.data.schema).toEqual([
    {
      id: ids[0],
      order: 1,
      label: 'Full name',
      name: 'full_name',
      rules: ['required', 'max:255'],
    },
    { id: ids[1], order: 2, label: 'Topic', name: 'topic', rules: ['in:sales,support'] },
    {
      id: ids[2],
      order: 3,
      label: 'Email address',
      name: 'contact_email',
      rules: ['required', 'email'],
    },
  ])
})

test('fields load in `order`, not list position, and save renumbered', async ({ page }) => {
  await signIn(page)
  const [first, second] = schemaFields({ email: { label: 'Email' }, message: { label: 'Message' } })
  const form = await newForm(page, {
    schema: [
      { ...second!, order: 20 },
      { ...first!, order: 10 },
    ],
  })
  await goto(page, `/forms/${form.id}/fields`)

  await expect(row(page, 1).getByRole('textbox', { name: 'Input name' })).toHaveValue('email')
  await expect(row(page, 2).getByRole('textbox', { name: 'Input name' })).toHaveValue('message')
  await page.getByRole('button', { name: 'Move Message up' }).click()
  await page.getByRole('button', { name: 'Save fields' }).click()
  await expect(page.getByText('Fields saved', { exact: true })).toBeVisible()

  const saved = await (await page.request.get(`/api/backend/forms/${form.id}`)).json()
  expect(
    saved.data.schema.map((field: { id: string; order: number }) => [field.id, field.order]),
  ).toEqual([
    [second!.id, 1],
    [first!.id, 2],
  ])
})

test('invalid input names are flagged before saving', async ({ page }) => {
  await signIn(page)
  const form = await newForm(page, { schema: schemaFields({ email: { label: 'Email' } }) })
  await goto(page, `/forms/${form.id}/fields`)

  await addField(page, 'Email')
  await expect(row(page, 2).getByRole('textbox', { name: 'Input name' })).toHaveValue('email_2')
  await row(page, 2).getByRole('textbox', { name: 'Input name' }).fill('2')
  await page.getByRole('button', { name: 'Save fields' }).click()

  await expect(page.getByText('Fix the highlighted fields, then save again.')).toBeVisible()
  await expect(row(page, 2).getByText(/Start with a letter/)).toBeVisible()
})

test('renaming a field on a form with entries warns first', async ({ page, request }) => {
  await signIn(page)
  const form = await newForm(page, { schema: schemaFields({ message: { label: 'Message' } }) })
  await page.request.put(`/api/backend/forms/${form.id}`, {
    data: { name: form.name, active: true },
  })
  await request.post(`${backendPublicUrl}/v1/forms/${form.id}/submissions`, {
    data: { message: 'Could you send me a quote for next month?' },
    headers: { Accept: 'application/json' },
  })

  await goto(page, `/forms/${form.id}/fields`)
  await row(page, 1).getByRole('textbox', { name: 'Input name' }).fill('comments')

  await expect(page.getByText('This form already has entries')).toBeVisible()
  await expect(page.getByText(/keep their values under “message”/)).toBeVisible()
})

test('test submission shows validation errors, then succeeds', async ({ page }) => {
  await signIn(page)
  const form = await newForm(page, {
    schema: schemaFields({
      name: { label: 'Name', rules: ['required'] },
      email: { label: 'Email', rules: ['required', 'email'] },
    }),
    settings: { message: 'Thanks, we will be in touch.' },
  })
  await goto(page, `/forms/${form.id}/integrate`)

  await expect(page.getByText('This form is inactive', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Turn on' }).click()
  await expect(page.getByText('This form is inactive', { exact: true })).toHaveCount(0)

  await page.getByRole('textbox', { name: 'Email' }).fill('not-an-email')
  await page.getByRole('button', { name: 'Send test submission' }).click()
  await expect(page.getByText('The submission was rejected')).toBeVisible()
  await expect(page.getByText('The name field is required.')).toBeVisible()
  await expect(page.getByText('The email field must be a valid email address.')).toBeVisible()

  await page.getByRole('button', { name: 'Fill with sample data' }).click()
  await page.getByRole('button', { name: 'Send test submission' }).click()
  await expect(page.getByText('Submission accepted')).toBeVisible()
  await expect(page.getByText('“Thanks, we will be in touch.”')).toBeVisible()

  const entries = await (await page.request.get(`/api/backend/forms/${form.id}/entries`)).json()
  expect(entries.data).toHaveLength(1)
  expect(entries.data[0].input).toEqual({ name: 'Alex Morgan', email: 'alex.morgan@example.com' })
})

test('the test form warns when this host is not an allowed domain', async ({ page }) => {
  await signIn(page)
  const form = await newForm(page, { settings: { domains: ['example.com'] } })
  await goto(page, `/forms/${form.id}/integrate`)

  await expect(page.getByText(/localhost isn't in this form's allowed domains/)).toBeVisible()
})

test('the generated snippet works when pasted into a blank page', async ({ page, browser }) => {
  await signIn(page)
  const form = await newForm(page, {
    schema: schemaFields({ email: { label: 'Email', rules: ['required', 'email'] } }),
    settings: { message: 'Thanks for signing up!' },
  })
  await page.request.put(`/api/backend/forms/${form.id}`, {
    data: { name: form.name, active: true },
  })
  await goto(page, `/forms/${form.id}/integrate`)

  const snippet = await page
    .getByRole('region', { name: 'the HTML and JavaScript snippet' })
    .textContent()
  expect(snippet).toContain(`${backendPublicUrl}/v1/forms/${form.id}/submissions`)

  // A separate, signed-out browser context: the snippet must work on its own.
  const site = await browser.newContext()
  const sitePage = await site.newPage()
  await sitePage.setContent(snippet!)

  // An empty required field is stopped by the browser (`required`), before reaching the API.
  await sitePage.getByRole('button', { name: 'Send' }).click()
  await expect(sitePage.getByRole('status')).toHaveText('')

  await sitePage.getByLabel('Email').fill('reader@example.com')
  await sitePage.getByRole('button', { name: 'Send' }).click()
  await expect(sitePage.getByRole('status')).toHaveText('Thanks for signing up!')
  await site.close()

  const entries = await (await page.request.get(`/api/backend/forms/${form.id}/entries`)).json()
  expect(entries.data[0].input).toEqual({ email: 'reader@example.com' })
})

test('fields reorder with the keyboard alone, with announcements', async ({ page }) => {
  await signIn(page)
  const form = await newForm(page, {
    schema: schemaFields({ email: { label: 'Email' }, message: { label: 'Message' } }),
  })
  await goto(page, `/forms/${form.id}/fields`)

  await page.getByRole('button', { name: 'Drag to reorder Email' }).focus()
  await page.keyboard.press('Space')
  await expect(page.getByText(/Picked up Email, position 1 of 2/)).toBeAttached()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByText(/Email moved to position 2 of 2/)).toBeAttached()
  await page.keyboard.press('Space')
  await expect(page.getByText(/Email dropped at position 2 of 2/)).toBeAttached()

  await expect(row(page, 1).getByRole('textbox', { name: 'Input name' })).toHaveValue('message')
  await expect(row(page, 2).getByRole('textbox', { name: 'Input name' })).toHaveValue('email')
  await expect(page.getByRole('button', { name: 'Save fields' })).toBeEnabled()
})

test('an empty schema explains what is stored, and nothing changed means nothing to save', async ({
  page,
}) => {
  await signIn(page)
  const form = await newForm(page)
  await goto(page, `/forms/${form.id}/fields`)

  await expect(page.getByRole('heading', { name: 'No fields yet' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save fields' })).toBeDisabled()

  await page.getByRole('button', { name: 'Add field' }).click()
  await expect(page.locator('[data-field-label]')).toBeFocused()
  await page.getByRole('button', { name: 'Remove New field' }).click()
  await expect(page.getByRole('button', { name: 'Save fields' })).toBeDisabled()
})
