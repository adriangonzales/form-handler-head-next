import { describe, expect, it } from 'vitest'
import { parseServerEnv } from '../../lib/env'

const valid = {
  BACKEND_API_URL: 'http://127.0.0.1:8001/api/',
  SESSION_SECRET: 'x'.repeat(32),
}

describe('parseServerEnv', () => {
  it('applies defaults and trims the trailing slash from the API URL', () => {
    expect(parseServerEnv(valid)).toEqual({
      NODE_ENV: 'development',
      BACKEND_API_URL: 'http://127.0.0.1:8001/api',
      BACKEND_REFRESH_WINDOW_SECONDS: 604_800,
      AUTH_REFRESH_AHEAD_SECONDS: 120,
      SESSION_SECRET: 'x'.repeat(32),
      REDIS_URL: undefined,
    })
  })

  it('reads numbers from strings', () => {
    expect(
      parseServerEnv({
        ...valid,
        BACKEND_REFRESH_WINDOW_SECONDS: '3600',
        AUTH_REFRESH_AHEAD_SECONDS: '30',
      }),
    ).toMatchObject({ BACKEND_REFRESH_WINDOW_SECONDS: 3600, AUTH_REFRESH_AHEAD_SECONDS: 30 })
  })

  it('lists every invalid variable in one error', () => {
    expect(() => parseServerEnv({ BACKEND_API_URL: 'not a url', SESSION_SECRET: 'short' })).toThrow(
      'Invalid server configuration:\n' +
        '  BACKEND_API_URL: must be a URL\n' +
        '  SESSION_SECRET: must be at least 32 characters',
    )
  })

  it('reports missing variables as required', () => {
    expect(() => parseServerEnv({})).toThrow(
      'Invalid server configuration:\n' +
        '  BACKEND_API_URL: is required\n' +
        '  SESSION_SECRET: is required',
    )
  })

  it('treats empty variables as unset', () => {
    const env = parseServerEnv({ ...valid, REDIS_URL: '', AUTH_REFRESH_AHEAD_SECONDS: '' })

    expect(env.REDIS_URL).toBeUndefined()
    expect(env.AUTH_REFRESH_AHEAD_SECONDS).toBe(120)
  })

  it('requires Redis in production only', () => {
    expect(() => parseServerEnv({ ...valid, NODE_ENV: 'production' })).toThrow(
      'REDIS_URL: is required in production',
    )
    expect(
      parseServerEnv({ ...valid, NODE_ENV: 'production', REDIS_URL: 'redis://localhost:6379' }),
    ).toMatchObject({ REDIS_URL: 'redis://localhost:6379' })
  })
})
