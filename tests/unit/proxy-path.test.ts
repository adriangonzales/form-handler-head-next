import { describe, expect, it } from 'vitest'
import { isProxyablePath } from '../../lib/backend/proxy-path'

describe('isProxyablePath', () => {
  it.each(['forms', 'forms/01J9ABC/entries', 'entry-exports', 'entries/01J9ABC/force'])(
    'allows %s',
    (path) => expect(isProxyablePath(path)).toBe(true),
  )

  it.each([
    '',
    'auth/password',
    'auth/me',
    'webhooks/postmark/bounces',
    'forms/../auth/me',
    'forms/./x',
    'forms//x',
    'forms/',
  ])('rejects %j', (path) => expect(isProxyablePath(path)).toBe(false))
})
