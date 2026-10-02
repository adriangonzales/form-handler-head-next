import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FormSettings } from '../../components/forms/form-settings'
import { queryKeys } from '../../lib/query-keys'
import type { Form } from '../../types/models'
import { server } from '../mocks/server'
import { renderWithProviders } from './render'

const push = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const form: Form = {
  id: '01k0000000000000000000000a',
  user_id: 1,
  name: 'Contact',
  active: true,
  schema: [{ id: '01k0000000000000000000000b', order: 1, name: 'email' }],
  settings: null,
  created_at: '2026-10-01T10:00:00.000000Z',
  updated_at: '2026-10-01T10:00:00.000000Z',
  deleted_at: null,
}

function renderSettings() {
  return renderWithProviders(<FormSettings formId={form.id} />, {
    seed: (client) => client.setQueryData(queryKeys.forms.detail(form.id), form),
  })
}

beforeEach(() => push.mockReset())

describe('FormSettings', () => {
  it('sends only the settings that are set, with the current name and active state', async () => {
    const user = userEvent.setup()
    let body: unknown

    server.use(
      http.put(`*/api/backend/forms/${form.id}`, async ({ request }) => {
        body = await request.json()

        return HttpResponse.json({
          data: {
            ...form,
            settings: {
              redirect: null,
              timezone: null,
              domains: ['example.com'],
              message: 'Thanks!',
              honeypot_enabled: true,
              honeypot_name: 'website_k3x9qa',
            },
          },
        })
      }),
    )
    renderSettings()

    expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled()

    await user.type(screen.getByLabelText('Success message'), 'Thanks!')
    await user.type(screen.getByRole('textbox', { name: 'Allowed domains' }), 'Example.com{Enter}')
    await user.click(screen.getByRole('switch', { name: 'Honeypot field' }))
    await user.click(screen.getByRole('button', { name: 'Save settings' }))

    await vi.waitFor(() =>
      expect(body).toEqual({
        name: 'Contact',
        active: true,
        settings: { message: 'Thanks!', domains: ['example.com'], honeypot_enabled: true },
      }),
    )
    // The generated name The Backend stored is shown, and nothing is left unsaved.
    expect(await screen.findByDisplayValue('website_k3x9qa')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled()
  })

  it('shows 422 errors on their fields, including list items', async () => {
    const user = userEvent.setup()

    server.use(
      http.put(`*/api/backend/forms/${form.id}`, () =>
        HttpResponse.json(
          {
            message: 'The honeypot name must not match a schema field.',
            errors: {
              'settings.honeypot_name': ['The honeypot name must not match a schema field.'],
              'settings.domains.0': ['The settings.domains.0 field format is invalid.'],
            },
          },
          { status: 422 },
        ),
      ),
    )
    renderSettings()

    await user.type(screen.getByRole('textbox', { name: 'Allowed domains' }), 'localhost{Enter}')
    await user.click(screen.getByRole('switch', { name: 'Honeypot field' }))
    await user.type(screen.getByRole('textbox', { name: 'Honeypot input name' }), 'email')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))

    const honeypot = screen.getByRole('textbox', { name: 'Honeypot input name' })

    await vi.waitFor(() => expect(honeypot).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByText('The honeypot name must not match a schema field.')).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Allowed domains' })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    // Every error is on a field, so there's no alert above the form.
    expect(screen.getAllByText('The honeypot name must not match a schema field.')).toHaveLength(1)
  })

  it('checks domains before sending anything', async () => {
    const user = userEvent.setup()
    const put = vi.fn()

    server.use(http.put('*/api/backend/forms/*', put))
    renderSettings()

    await user.type(
      screen.getByRole('textbox', { name: 'Allowed domains' }),
      'https://example.com/path{Enter}',
    )
    await user.click(screen.getByRole('button', { name: 'Save settings' }))

    expect(await screen.findByText(/Use bare hostnames such as example.com/)).toBeVisible()
    expect(put).not.toHaveBeenCalled()
  })
})
