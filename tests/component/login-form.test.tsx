import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { LoginForm } from '../../components/auth/login-form'
import { server } from '../mocks/server'

const assign = vi.fn()

Object.defineProperty(window, 'location', {
  value: { ...window.location, assign },
  writable: true,
})

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup()

  await user.type(await screen.findByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('LoginForm', () => {
  it('signs in and goes to the requested page', async () => {
    server.use(
      http.post('*/api/auth/login', async ({ request }) => {
        expect(await request.json()).toEqual({ email: 'ada@example.com', password: 'secret' })

        return HttpResponse.json({ user: { name: 'Ada' } })
      }),
    )
    render(<LoginForm next="/forms?page=2" />)

    await fillAndSubmit('ada@example.com', 'secret')

    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/forms?page=2'))
  })

  it('shows wrong credentials on the email field', async () => {
    server.use(
      http.post('*/api/auth/login', () =>
        HttpResponse.json(
          {
            message: 'These credentials do not match our records.',
            errors: { email: ['These credentials do not match our records.'] },
          },
          { status: 422 },
        ),
      ),
    )
    render(<LoginForm />)

    await fillAndSubmit('ada@example.com', 'wrong')

    const email = screen.getByLabelText('Email')

    expect(await screen.findByText('These credentials do not match our records.')).toBeVisible()
    expect(email).toHaveAttribute('aria-invalid', 'true')
    // On the field only, not repeated in an alert above the form.
    expect(screen.getAllByText('These credentials do not match our records.')).toHaveLength(1)
  })

  it('checks the fields before sending anything', async () => {
    render(<LoginForm />)

    await fillAndSubmit('not-an-email', 'x')

    expect(await screen.findByText('Enter a valid email address.')).toBeVisible()
  })

  it('shows a notice, and refuses to redirect to another site', async () => {
    server.use(http.post('*/api/auth/login', () => HttpResponse.json({ user: {} })))
    render(<LoginForm next="//evil.example" notice="You've been signed out." />)

    expect(screen.getByText("You've been signed out.")).toBeVisible()

    await fillAndSubmit('ada@example.com', 'secret')

    await vi.waitFor(() => expect(assign).toHaveBeenLastCalledWith('/forms'))
  })
})
