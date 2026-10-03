import { sessionRequest } from '@/lib/api-client'
import type { User } from '@/types/models'

// Browser-side calls for the Account page. They go to this app's own route handlers, not the
// proxy, because each one also changes the session.

export async function updateProfile(changes: { name?: string; email?: string }): Promise<User> {
  const { user } = await sessionRequest<{ user: User }>('/api/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(changes),
  })

  return user
}

export async function changePassword(body: {
  current_password: string
  password: string
  password_confirmation: string
}): Promise<void> {
  await sessionRequest('/api/auth/password', { method: 'PUT', body: JSON.stringify(body) })
}

/** Deletes the account. The password goes in the body; only the server puts it in a URL. */
export async function deleteAccount(password: string): Promise<void> {
  await sessionRequest('/api/auth/me', { method: 'DELETE', body: JSON.stringify({ password }) })
}
