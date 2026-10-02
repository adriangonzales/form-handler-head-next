import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'
import type { Account } from '../support/throwaway-user'

export const e2eUserFile = new URL('../../playwright/.auth/e2e-user.json', import.meta.url).pathname

/** The throwaway user global-setup.ts created for this run. */
export function e2eUser(): Account {
  return JSON.parse(readFileSync(e2eUserFile, 'utf8'))
}

/** Signs in through the login page, starting from `path`, and waits to land back on it. */
export async function signIn(page: Page, path = '/forms', account: Account = e2eUser()) {
  await page.goto(path)
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(path)
}
