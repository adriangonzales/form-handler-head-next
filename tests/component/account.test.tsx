import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Toaster } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DeleteAccountDialog } from '../../components/account/delete-account-dialog'
import { PasswordForm } from '../../components/account/password-form'
import { ProfileForm } from '../../components/account/profile-form'
import type { User } from '../../types/models'
import { server } from '../mocks/server'
import { renderWithProviders } from './render'

const refresh = vi.fn()
const replace = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

Object.defineProperty(window, 'location', {
  value: { ...window.location, replace, assign: vi.fn() },
  writable: true,
})

const ada: User = {
  id: 1,
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  email_verified_at: '2026-10-01T10:00:00.000000Z',
  created_at: '2026-10-01T10:00:00.000000Z',
  updated_at: '2026-10-01T10:00:00.000000Z',
}

const invalid = (errors: Record<string, string[]>) =>
  HttpResponse.json({ message: Object.values(errors)[0]![0], errors }, { status: 422 })

beforeEach(() => {
  refresh.mockReset()
  replace.mockReset()
})

describe('ProfileForm', () => {
  it('sends only what changed, then refreshes the page for the header', async () => {
    const user = userEvent.setup()
    let body: unknown

    server.use(
      http.patch('*/api/auth/me', async ({ request }) => {
        body = await request.json()

        return HttpResponse.json({ user: { ...ada, name: 'Ada King' } })
      }),
    )
    renderWithProviders(
      <>
        <ProfileForm user={ada} />
        <Toaster />
      </>,
    )

    const save = screen.getByRole('button', { name: 'Save profile' })

    expect(save).toBeDisabled()
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), '  Ada King ')
    await user.click(save)

    expect(await screen.findByText('Profile saved')).toBeVisible()
    expect(body).toEqual({ name: 'Ada King' })
    expect(refresh).toHaveBeenCalled()
    expect(screen.getByLabelText('Name')).toHaveValue('Ada King')
    expect(save).toBeDisabled()
  })

  it('warns that an email change is immediate, and shows a taken email on the field', async () => {
    const user = userEvent.setup()
    let body: unknown

    server.use(
      http.patch('*/api/auth/me', async ({ request }) => {
        body = await request.json()

        return invalid({ email: ['The email has already been taken.'] })
      }),
    )
    renderWithProviders(<ProfileForm user={ada} />)

    const email = screen.getByLabelText('Email')

    // A change of case only isn't a change.
    await user.clear(email)
    await user.type(email, 'ADA@example.com')
    expect(screen.queryByText(/sign in with the new address/)).not.toBeInTheDocument()

    await user.clear(email)
    await user.type(email, 'grace@example.com')
    expect(screen.getByText(/sign in with the new address/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Save profile' }))

    expect(await screen.findByText('The email has already been taken.')).toBeVisible()
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(body).toEqual({ email: 'grace@example.com' })
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('PasswordForm', () => {
  async function fill(current: string, password: string, confirmation = password) {
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Current password'), current)
    await user.type(screen.getByLabelText('New password'), password)
    await user.type(screen.getByLabelText('Confirm new password'), confirmation)
    await user.click(screen.getByRole('button', { name: 'Change password' }))
  }

  it('checks the confirmation before sending anything', async () => {
    const sent = vi.fn()

    server.use(http.put('*/api/auth/password', sent))
    renderWithProviders(<PasswordForm />)

    await fill('old-password', 'new-password', 'other-password')
    expect(await screen.findByText("The passwords don't match.")).toBeVisible()

    expect(sent).not.toHaveBeenCalled()
  })

  it('shows a wrong current password on its field', async () => {
    server.use(
      http.put('*/api/auth/password', () =>
        invalid({ current_password: ['The password is incorrect.'] }),
      ),
    )
    renderWithProviders(<PasswordForm />)

    await fill('wrong-password', 'new-password')

    expect(await screen.findByText('The password is incorrect.')).toBeVisible()
    expect(screen.getByLabelText('Current password')).toHaveAttribute('aria-invalid', 'true')
  })

  it('clears every field after a change, and says other devices are signed out', async () => {
    let body: unknown

    server.use(
      http.put('*/api/auth/password', async ({ request }) => {
        body = await request.json()

        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderWithProviders(
      <>
        <PasswordForm />
        <Toaster />
      </>,
    )

    await fill('old-password', 'new-password')

    expect(await screen.findByText('Password changed')).toBeVisible()
    expect(screen.getByText(/Other browsers and devices have been signed out/)).toBeVisible()
    expect(body).toEqual({
      current_password: 'old-password',
      password: 'new-password',
      password_confirmation: 'new-password',
    })
    for (const label of ['Current password', 'New password', 'Confirm new password']) {
      expect(screen.getByLabelText(label)).toHaveValue('')
    }
  })
})

describe('DeleteAccountDialog', () => {
  async function open() {
    const user = userEvent.setup()

    renderWithProviders(<DeleteAccountDialog email={ada.email} />)
    await user.click(screen.getByRole('button', { name: 'Delete account…' }))

    return { user, dialog: await screen.findByRole('dialog', { name: 'Delete your account?' }) }
  }

  it('stays disabled until the password is entered and the email typed', async () => {
    const { user } = await open()
    const confirm = screen.getByRole('button', { name: 'Delete account' })

    await user.type(screen.getByLabelText(`Type ${ada.email} to confirm`), 'ADA@example.com ')
    expect(confirm).toBeDisabled()
    await user.type(screen.getByLabelText('Password'), 'secret')
    expect(confirm).toBeEnabled()
  })

  it('shows a wrong password on the field and stays on the page', async () => {
    server.use(
      http.delete('*/api/auth/me', () => invalid({ password: ['The password is incorrect.'] })),
    )
    const { user } = await open()

    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.type(screen.getByLabelText(`Type ${ada.email} to confirm`), ada.email)
    await user.click(screen.getByRole('button', { name: 'Delete account' }))

    expect(await screen.findByText('The password is incorrect.')).toBeVisible()
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true')
    expect(replace).not.toHaveBeenCalled()
  })

  it('sends the password in the body, then goes to the login page', async () => {
    let request: Request | undefined

    server.use(
      http.delete('*/api/auth/me', ({ request: sent }) => {
        request = sent.clone()

        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { user } = await open()

    await user.type(screen.getByLabelText('Password'), 'secret')
    await user.type(screen.getByLabelText(`Type ${ada.email} to confirm`), ada.email)
    await user.click(screen.getByRole('button', { name: 'Delete account' }))

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/login?reason=deleted'))
    expect(new URL(request!.url).search).toBe('')
    expect(await request!.json()).toEqual({ password: 'secret' })
  })
})
