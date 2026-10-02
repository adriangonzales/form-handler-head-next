import { existsSync, readFileSync, rmSync } from 'node:fs'
import { backendApiUrl } from '../support/env'
import type { Account } from '../support/throwaway-user'
import { e2eUserFile } from './support'

/** Deletes the suite's user through the contract's account deletion. */
export default async function globalTeardown() {
  if (!existsSync(e2eUserFile)) return

  const account: Account = JSON.parse(readFileSync(e2eUserFile, 'utf8'))
  const api = backendApiUrl()
  const login = await fetch(`${api}/v1/auth/login`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: account.email, password: account.password }),
  })

  if (login.ok) {
    const { access_token } = await login.json()

    await fetch(`${api}/v1/auth/me?password=${encodeURIComponent(account.password)}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json', Authorization: `Bearer ${access_token}` },
    })
  }

  rmSync(e2eUserFile)
}
