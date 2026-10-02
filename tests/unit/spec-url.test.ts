import { describe, expect, it } from 'vitest'
import { specUrlFrom } from '../../scripts/spec-url.mjs'

describe('specUrlFrom', () => {
  it('prefers BACKEND_SPEC_URL', () => {
    expect(
      specUrlFrom({
        BACKEND_SPEC_URL: 'https://spec.example.com/openapi.json',
        BACKEND_API_URL: 'https://api.example.com/api',
      }),
    ).toBe('https://spec.example.com/openapi.json')
  })

  it('derives the docs URL from the API base', () => {
    expect(specUrlFrom({ BACKEND_API_URL: 'http://127.0.0.1:8001/api/' })).toBe(
      'http://127.0.0.1:8001/docs/api.json',
    )
  })

  it('appends the docs path to a base without /api', () => {
    expect(specUrlFrom({ BACKEND_API_URL: 'https://forms.example.com' })).toBe(
      'https://forms.example.com/docs/api.json',
    )
  })

  it('returns undefined without either variable', () => {
    expect(specUrlFrom({})).toBeUndefined()
  })
})
