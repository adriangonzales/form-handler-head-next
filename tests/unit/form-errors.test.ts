import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../lib/api-client'
import { applyApiError, toFormErrors } from '../../lib/form-errors'

describe('toFormErrors', () => {
  it('puts errors on matching fields, including nested and list paths', () => {
    expect(
      toFormErrors(
        {
          name: ['The name field is required.'],
          'settings.domains.2': ['Not a hostname.'],
          'schema.0.name': ['Clashes with the honeypot.'],
        },
        ['name', 'settings.domains'],
      ),
    ).toEqual({
      fieldErrors: [
        { name: 'name', message: 'The name field is required.' },
        { name: 'settings.domains', message: 'Not a hostname.' },
      ],
      otherMessages: ['Clashes with the honeypot.'],
    })
  })
})

describe('applyApiError', () => {
  it('sets field errors and returns no alert when every error has a field', () => {
    const setError = vi.fn()
    const error = new ApiError(422, 'These credentials do not match our records.', {
      email: ['These credentials do not match our records.'],
    })

    expect(applyApiError(error, setError, ['email', 'password'])).toBeUndefined()
    expect(setError).toHaveBeenCalledWith('email', {
      type: 'server',
      message: 'These credentials do not match our records.',
    })
  })

  it("returns the API's message when no error has a field", () => {
    expect(
      applyApiError(new ApiError(502, 'The Backend could not be reached.'), vi.fn(), ['email']),
    ).toBe('The Backend could not be reached.')
  })
})
