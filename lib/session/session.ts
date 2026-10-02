import 'server-only'
import { sealData, unsealData } from 'iron-session'
import { serverEnv } from '@/lib/env'
import type { User } from '@/types/models'
import type { SessionTokens, TokenSet } from './token-action'

export const SESSION_COOKIE = 'form_handler_session'

/** What the sealed session cookie holds. Only `user` is ever passed to client code. */
export interface Session extends SessionTokens {
  user: User
}

/** A session for a fresh login, or a password change, which starts a new token chain. */
export function startSession(user: User, tokens: TokenSet, now = Date.now()): Session {
  return {
    user,
    ...tokens,
    refreshableUntil: now + serverEnv().BACKEND_REFRESH_WINDOW_SECONDS * 1000,
  }
}

export function sealSession(session: Session): Promise<string> {
  return sealData(session, {
    password: serverEnv().SESSION_SECRET,
    ttl: serverEnv().BACKEND_REFRESH_WINDOW_SECONDS,
  })
}

/** Reads a session cookie. Anything missing, tampered with, expired or malformed reads as null. */
export async function unsealSession(value: string | undefined): Promise<Session | null> {
  if (!value) return null

  const data = await unsealData<Partial<Session>>(value, {
    password: serverEnv().SESSION_SECRET,
    ttl: serverEnv().BACKEND_REFRESH_WINDOW_SECONDS,
  }).catch(() => null)

  return isSession(data) ? data : null
}

export interface SessionCookieOptions {
  httpOnly: true
  sameSite: 'lax'
  secure: boolean
  path: '/'
  maxAge: number
}

/** The cookie lives exactly as long as the session can still be refreshed. */
export function sessionCookieOptions(session: Session, now = Date.now()): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: serverEnv().NODE_ENV === 'production',
    path: '/',
    maxAge: Math.max(0, Math.floor((session.refreshableUntil - now) / 1000)),
  }
}

function isSession(data: unknown): data is Session {
  const session = data as Partial<Session> | null

  return (
    typeof session?.token === 'string' &&
    typeof session.expiresAt === 'number' &&
    typeof session.refreshableUntil === 'number' &&
    typeof session.user === 'object' &&
    session.user !== null
  )
}
