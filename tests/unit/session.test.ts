import { sealData } from 'iron-session'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Session } from '../../lib/session/session'

const secret = 'test-secret-test-secret-test-secret-0123'

beforeAll(() => {
  vi.stubEnv('BACKEND_API_URL', 'http://backend.test/api')
  vi.stubEnv('SESSION_SECRET', secret)
  vi.stubEnv('BACKEND_REFRESH_WINDOW_SECONDS', '3600')
})

const { sealSession, sessionCookieOptions, startSession, unsealSession } =
  await import('../../lib/session/session')

const user = {
  id: 1,
  name: 'Ada',
  email: 'ada@example.com',
  email_verified_at: null,
  created_at: null,
  updated_at: null,
}

describe('session cookie', () => {
  it('round-trips a session', async () => {
    const session = startSession(user, { token: 't', expiresAt: 1_000 }, 0)

    expect(session.refreshableUntil).toBe(3_600_000)
    expect(await unsealSession(await sealSession(session))).toEqual(session)
  })

  it('reads a missing, tampered or foreign cookie as no session', async () => {
    const sealed = await sealSession(startSession(user, { token: 't', expiresAt: 1 }))

    expect(await unsealSession(undefined)).toBeNull()
    expect(await unsealSession(`${sealed.slice(0, -2)}xx`)).toBeNull()
    expect(
      await unsealSession(await sealData({ token: 't' }, { password: secret, ttl: 3600 })),
    ).toBeNull()
    expect(
      await unsealSession(
        await sealData(startSession(user, { token: 't', expiresAt: 1 }), {
          password: 'another-secret-another-secret-0123456',
        }),
      ),
    ).toBeNull()
  })

  it('makes the cookie httpOnly and last until the refresh window ends', () => {
    const session: Session = { user, token: 't', expiresAt: 0, refreshableUntil: 90_500 }

    expect(sessionCookieOptions(session, 500)).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 90,
    })
  })
})
