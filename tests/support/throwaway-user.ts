import { execSync } from 'node:child_process'
import './env'

export interface Account {
  name: string
  email: string
  password: string
}

/** Whether a command to create test users is configured (E2E_CREATE_USER_CMD). */
export const canCreateUsers = Boolean(process.env.E2E_CREATE_USER_CMD)

/**
 * Creates a user by running E2E_CREATE_USER_CMD with `{name}`, `{email}` and `{password}` replaced.
 * Creating users is the one thing the contract has no endpoint for, so each backend supplies its own
 * command. Delete the user afterwards through the API (`DELETE /v1/auth/me?password=`).
 */
export function createThrowawayUser(prefix = 'Test'): Account {
  const template = process.env.E2E_CREATE_USER_CMD

  if (!template) {
    throw new Error('Set E2E_CREATE_USER_CMD to create test users.')
  }

  // Letters, digits and dashes only, so the values are safe to put in a shell command.
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const account = {
    name: `${prefix}-${id}`,
    email: `e2e-${id}@example.com`,
    password: `Throwaway-${id}-Pw9`,
  }

  const command = template
    .replaceAll('{name}', account.name)
    .replaceAll('{email}', account.email)
    .replaceAll('{password}', account.password)

  execSync(command, { stdio: 'pipe' })

  return account
}
