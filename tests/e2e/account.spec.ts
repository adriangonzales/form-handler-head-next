import { expect, type Page, test } from '@playwright/test'
import { type Account, createThrowawayUser } from '../support/throwaway-user'
import { e2eUser, goto, reload, signIn } from './support'

// Each test signs in as its own throwaway user, so changing or deleting the account can't affect
// the suite's user. Users still left at the end are deleted through the dashboard.
const leftovers: { page: Page; account: Account }[] = []

test.afterEach(async () => {
  for (const { page, account } of leftovers.splice(0)) {
    await page.request.delete('/api/auth/me', { data: { password: account.password } })
  }
})

async function signInAsNewUser(page: Page) {
  const account = createThrowawayUser('Account')

  leftovers.push({ page, account })
  await signIn(page, '/account', account)

  return account
}

test('changing the name updates the header without a reload', async ({ page }) => {
  const account = await signInAsNewUser(page)
  const header = page.locator('header')

  await expect(header).toContainText(account.name)

  await page.getByLabel('Name', { exact: true }).fill('Renamed Person')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByText('Profile saved', { exact: true })).toBeVisible()
  await expect(header).toContainText('Renamed Person')
  await expect(page.getByRole('button', { name: 'Save profile' })).toBeDisabled()

  await reload(page)
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Renamed Person')
  await expect(header).toContainText('Renamed Person')
})

test('an email that is already taken shows on the email field', async ({ page }) => {
  await signInAsNewUser(page)

  const email = page.getByLabel('Email', { exact: true })

  await email.fill(e2eUser().email)
  await expect(page.getByText(/sign in with the new address/)).toBeVisible()
  await page.getByRole('button', { name: 'Save profile' }).click()

  await expect(email).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('[data-slot="field-error"]')).toContainText(/taken/i)
})

test('changing the password keeps this session and signs out other browsers', async ({
  page,
  browser,
}) => {
  const account = await signInAsNewUser(page)
  const newPassword = `${account.password}-New!`
  const other = await browser.newPage()

  await signIn(other, '/forms', account)

  await page.getByLabel('Current password').fill('not-my-password')
  await page.getByLabel('New password', { exact: true }).fill(newPassword)
  await page.getByLabel('Confirm new password').fill(newPassword)
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByLabel('Current password')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText('The password is incorrect.')).toBeVisible()

  await page.getByLabel('Current password').fill(account.password)
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByText('Password changed', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Current password')).toHaveValue('')
  leftovers[0]!.account = { ...account, password: newPassword }

  // This browser carries on.
  await goto(page, '/forms')
  await expect(page).toHaveURL('/forms')
  await expect(page.getByRole('heading', { name: 'Forms' })).toBeVisible()

  // The other one is signed out on its next request.
  await other.reload()
  await expect(other).toHaveURL(/\/login\?reason=expired/)
  await other.close()
})

test('deleting the account needs the right password, then signs out for good', async ({ page }) => {
  const account = await signInAsNewUser(page)

  await page.getByRole('button', { name: 'Delete account…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete your account?' })
  const confirm = dialog.getByRole('button', { name: 'Delete account' })

  await dialog.getByLabel('Password').fill('wrong-password')
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel(`Type ${account.email} to confirm`).fill(account.email)
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await expect(dialog.getByText(/password is incorrect/i)).toBeVisible()

  // Nothing was deleted.
  await reload(page)
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(account.email)

  await page.getByRole('button', { name: 'Delete account…' }).click()
  await dialog.getByLabel('Password').fill(account.password)
  await dialog.getByLabel(`Type ${account.email} to confirm`).fill(account.email)
  await dialog.getByRole('button', { name: 'Delete account' }).click()
  await expect(page).toHaveURL('/login?reason=deleted')
  await expect(page.getByText('Your account has been deleted.')).toBeVisible()
  leftovers.pop()

  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText(/credentials/i)).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})
