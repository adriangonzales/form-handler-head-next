import { expect, test } from '@playwright/test'
import { e2eUser, signIn } from './support'

// The suite's server refreshes the token on every request (see playwright.config.ts), and each
// refresh invalidates the previous token, so these tests fail if a refresh is lost or repeated.

test('guests are sent to the login page with a way back', async ({ page }) => {
  await page.goto('/forms')

  await expect(page).toHaveURL('/login?next=%2Fforms')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

test('wrong credentials show the message on the email field', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(e2eUser().email)
  await page.getByLabel('Password').fill('not-the-password')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByText('These credentials do not match our records.')).toBeVisible()
  await expect(page).toHaveURL('/login')
})

test('signing in returns to the requested page and survives a reload', async ({ page }) => {
  await signIn(page, '/account')

  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(e2eUser().email)

  await page.reload()
  await expect(page).toHaveURL('/account')
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(e2eUser().email)
})

test('a signed-in user visiting the login page goes to their forms', async ({ page }) => {
  await signIn(page)
  await page.goto('/login')

  await expect(page).toHaveURL('/forms')
})

test('the access token never reaches the browser', async ({ page }) => {
  await signIn(page)

  const me = await (await page.request.get('/api/auth/me')).json()
  const html = await (await page.request.get('/account')).text()
  const documentCookie = await page.evaluate(() => document.cookie)

  expect(me.user.email).toBe(e2eUser().email)
  expect(Object.keys(me)).toEqual(['user'])
  // JWTs start with a base64url-encoded `{"` header; the mock backend's tokens start with `mock.`.
  for (const body of [JSON.stringify(me), html]) {
    expect(body).not.toMatch(/eyJ[\w-]{10,}|mock\.[\w-]{10,}/)
  }
  expect(documentCookie).not.toContain('form_handler_session')
})

test('parallel requests share one token refresh', async ({ page }) => {
  await signIn(page)

  // Same cookie, ten requests at once: only one may refresh; the others reuse its result.
  const responses = await Promise.all(
    Array.from({ length: 10 }, () => page.request.get('/api/backend/forms?per_page=1')),
  )

  expect(responses.map((response) => response.status())).toEqual(Array(10).fill(200))

  await page.goto('/account')
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(e2eUser().email)
})

test('a page render after a refresh uses the new token and sends the new cookie', async ({
  page,
}) => {
  await signIn(page)

  // proxy.ts refreshes before rendering; the account page then calls The Backend while rendering.
  // If the render saw the old (now invalid) token, it would redirect to the login page instead.
  const response = await page.request.get('/account', { maxRedirects: 0 })
  const setCookie = response
    .headersArray()
    .filter(({ name }) => name.toLowerCase() === 'set-cookie')
    .map(({ value }) => value)

  expect(response.status()).toBe(200)
  expect(await response.text()).toContain(e2eUser().email)
  expect(setCookie.some((value) => value.startsWith('form_handler_session='))).toBe(true)
  expect(setCookie.join()).toMatch(/HttpOnly/i)
})

test('the proxy refuses auth, webhook and traversal paths', async ({ page }) => {
  await signIn(page)

  for (const path of [
    '/api/backend/auth/me',
    '/api/backend/webhooks/postmark/bounces',
    '/api/backend/forms/..%2fauth/me',
    '/api/backend/forms/%2e%2e/auth/me',
  ]) {
    const response = await page.request.get(path)

    expect(response.status(), path).toBe(404)
    expect(await response.json(), path).toEqual({ message: 'Not found.' })
  }
})

test('logging out ends the session', async ({ page }) => {
  await signIn(page)

  await page.getByRole('button', { name: `Account menu for ${e2eUser().name}` }).click()
  await page.getByRole('menuitem', { name: 'Log out' }).click()

  await expect(page).toHaveURL('/login?reason=signed-out')
  await expect(page.getByText("You've been signed out.")).toBeVisible()
  expect((await page.request.get('/api/backend/forms')).status()).toBe(401)

  await page.goto('/forms')
  await expect(page).toHaveURL('/login?next=%2Fforms')
})

test('a session whose token was revoked ends with the expiry notice', async ({ page, context }) => {
  await signIn(page)

  // Logging out from a copy of the session invalidates the token chain this browser holds, even
  // if the page's own requests have refreshed the token since the copy was taken.
  const cookies = await context.cookies()

  // Every request refreshes the token in this suite, so this moves the browser past the copy's
  // token, which the page's own requests could also do at any moment.
  expect((await page.request.get('/api/backend/forms')).status()).toBe(200)

  const other = await context.browser()!.newContext()

  await other.addCookies(cookies)
  await other.request.post(`${test.info().project.use.baseURL}/api/auth/logout`)
  await other.close()

  await page.goto('/forms')
  await expect(page).toHaveURL('/login?reason=expired&next=%2Fforms')
  await expect(page.getByText('Your session has expired. Please sign in again.')).toBeVisible()
})

test('forgot password gives the same answer for unknown emails', async ({ page }) => {
  await page.goto('/forgot-password')
  await page.getByLabel('Email').fill('nobody@example.test')
  await page.getByRole('button', { name: 'Send reset link' }).click()

  await expect(page.getByText(/If an account exists for that email/)).toBeVisible()
})

test('an invalid reset link explains itself and offers a new one', async ({ page }) => {
  await page.goto(`/reset-password?token=invalid&email=${encodeURIComponent(e2eUser().email)}`)
  await page.getByLabel('New password', { exact: true }).fill('Another-Pass-123!')
  await page.getByLabel('Confirm new password').fill('Another-Pass-123!')
  await page.getByRole('button', { name: 'Reset password' }).click()

  await expect(page.getByText('This password reset token is invalid.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Request a new link' })).toBeVisible()
})

test('a reset link without its token is reported as incomplete', async ({ page }) => {
  await page.goto('/reset-password')

  await expect(page.getByText('This reset link is incomplete.')).toBeVisible()
})
