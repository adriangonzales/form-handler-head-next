import { describe, expect, it } from 'vitest'
import { loginUrl, safeRedirect } from '../../lib/redirect'

describe('safeRedirect', () => {
  it.each(['/forms', '/forms/01J9/entries?filter%5Bread%5D=false', '/account'])(
    'keeps the same-site path %s',
    (path) => expect(safeRedirect(path)).toBe(path),
  )

  it.each([
    undefined,
    '',
    'forms',
    '//evil.example',
    'https://evil.example',
    '/\\evil.example',
    '/forms\n',
    ['/forms'],
  ])('falls back for %j', (value) => expect(safeRedirect(value)).toBe('/forms'))
})

describe('loginUrl', () => {
  it('adds the reason and the way back', () => {
    expect(loginUrl({ reason: 'expired', next: '/forms?page=2' })).toBe(
      '/login?reason=expired&next=%2Fforms%3Fpage%3D2',
    )
  })

  it('leaves out a way back to the home page or to another site', () => {
    expect(loginUrl({ next: '/' })).toBe('/login')
    expect(loginUrl({ next: '//evil.example' })).toBe('/login')
  })
})
