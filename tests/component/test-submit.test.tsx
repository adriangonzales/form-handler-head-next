import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { TestSubmit } from '../../components/forms/test-submit'
import type { Form } from '../../types/models'
import { server } from '../mocks/server'
import { renderWithProviders } from './render'

const endpoint = 'http://backend.test/api/v1/forms/01k0000000000000000000000a/submissions'

const form: Form = {
  id: '01k0000000000000000000000a',
  user_id: 1,
  name: 'Contact',
  active: true,
  schema: [
    {
      id: '01k0000000000000000000000b',
      order: 1,
      label: 'Email',
      name: 'email',
      rules: ['required', 'email'],
    },
  ],
  settings: {
    redirect: null,
    timezone: null,
    domains: [],
    message: 'Thanks!',
    honeypot_enabled: true,
    honeypot_name: 'website_k3x9qa',
  },
  created_at: null,
  updated_at: null,
  deleted_at: null,
}

describe('TestSubmit', () => {
  it('posts JSON without credentials, and shows the message', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    let body: unknown

    server.use(
      http.post(endpoint, async ({ request }) => {
        body = await request.json()

        return HttpResponse.json({ data: { redirect: null, message: 'Thanks!' } }, { status: 201 })
      }),
    )
    renderWithProviders(<TestSubmit form={form} endpoint={endpoint} />)

    await user.click(screen.getByRole('button', { name: 'Fill with sample data' }))
    await user.click(screen.getByRole('button', { name: 'Send test submission' }))

    expect(await screen.findByText('Submission accepted')).toBeVisible()
    expect(screen.getByText('Message shown to the submitter: “Thanks!”')).toBeVisible()
    expect(body).toEqual({ email: 'alex.morgan@example.com' })
    // Like a real site: no cookies or other credentials go to The Backend.
    expect(fetchSpy).toHaveBeenCalledWith(
      endpoint,
      expect.objectContaining({ credentials: 'omit' }),
    )
    fetchSpy.mockRestore()
  })

  it('puts 422 errors on their fields', async () => {
    const user = userEvent.setup()

    server.use(
      http.post(endpoint, () =>
        HttpResponse.json(
          {
            message: 'The email field is required.',
            errors: { email: ['The email field is required.'] },
          },
          { status: 422 },
        ),
      ),
    )
    renderWithProviders(<TestSubmit form={form} endpoint={endpoint} />)

    await user.click(screen.getByRole('button', { name: 'Send test submission' }))

    expect(await screen.findByText('The submission was rejected')).toBeVisible()
    expect(screen.getByText('The email field is required.')).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveAttribute('aria-invalid', 'true')
  })

  it('sends the honeypot when simulating a bot, and says the entry is spam', async () => {
    const user = userEvent.setup()
    let body: unknown

    server.use(
      http.post(endpoint, async ({ request }) => {
        body = await request.json()

        return HttpResponse.json({ data: { redirect: null, message: null } }, { status: 201 })
      }),
    )
    renderWithProviders(<TestSubmit form={form} endpoint={endpoint} />)

    await user.click(screen.getByRole('button', { name: 'Simulate a bot' }))
    await user.type(screen.getByLabelText('Hidden honeypot input “website_k3x9qa”'), 'spam')
    await user.click(screen.getByRole('button', { name: 'Send test submission' }))

    expect(await screen.findByText(/stored as spam and no alert is sent/)).toBeVisible()
    expect(body).toEqual({ website_k3x9qa: 'spam' })
  })

  it('warns when this host is not an allowed domain', () => {
    renderWithProviders(
      <TestSubmit
        form={{ ...form, settings: { ...form.settings!, domains: ['example.com'] } }}
        endpoint={endpoint}
      />,
    )

    expect(screen.getByText(/localhost isn't in this form's allowed domains/)).toBeVisible()
  })
})
