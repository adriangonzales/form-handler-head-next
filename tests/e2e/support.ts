import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'
import { ulid } from '../../lib/ulid'
import '../support/env'
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
  await hydrated(page)
}

/** Navigates and waits for hydration, so the next click reaches React rather than static HTML. */
export async function goto(page: Page, url: string) {
  await page.goto(url)
  await hydrated(page)
}

export async function reload(page: Page) {
  await page.reload()
  await hydrated(page)
}

export async function hydrated(page: Page) {
  await page.locator('html[data-hydrated]').waitFor({ state: 'attached' })
}

/** The Backend's public API base, which browsers post submissions to. */
export const backendPublicUrl = (
  process.env.NEXT_PUBLIC_BACKEND_PUBLIC_URL ??
  process.env.BACKEND_API_URL ??
  'http://127.0.0.1:8001/api'
).replace(/\/+$/, '')

export interface CreatedForm {
  id: string
  name: string
  active: boolean
}

/** Creates a form through the dashboard's proxy (the page must be signed in). */
export async function createFormViaApi(
  page: Page,
  name: string,
  body: Record<string, unknown> = {},
): Promise<CreatedForm> {
  const response = await page.request.post('/api/backend/forms', { data: { name, ...body } })

  expect(response.ok(), await response.text()).toBe(true)

  return (await response.json()).data
}

export async function deleteFormViaApi(page: Page, id: string) {
  await page.request.delete(`/api/backend/forms/${id}`)
}

/** A schema from input names: each field gets a fresh ULID `id` and the next `order`. */
export function schemaFields(fields: Record<string, { label?: string; rules?: string[] }>) {
  return Object.entries(fields).map(([name, field], index) => ({
    id: ulid(),
    order: index + 1,
    name,
    ...field,
  }))
}

export function uniqueName(prefix: string) {
  return `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
