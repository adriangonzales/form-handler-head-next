import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { Toaster } from 'sonner'
import { beforeEach, describe, expect, it } from 'vitest'
import { RecipientList } from '../../components/notifications/recipient-list'
import { queryKeys } from '../../lib/query-keys'
import type { Form, FormNotification, Paginated } from '../../types/models'
import { server } from '../mocks/server'
import { renderWithProviders } from './render'

const formId = '01k0000000000000000000000f'
const at = '2026-10-02T10:00:00.000000Z'

function recipient(id: string, overrides: Partial<FormNotification> = {}): FormNotification {
  return {
    id,
    form_id: formId,
    type: 'email',
    value: `${id.slice(-4)}@example.com`,
    enabled: true,
    error: null,
    created_at: at,
    updated_at: at,
    deleted_at: null,
    ...overrides,
  }
}

const form = {
  id: formId,
  user_id: 1,
  name: 'Contact',
  active: true,
  schema: null,
  settings: { timezone: 'Europe/Paris' },
  created_at: at,
  updated_at: at,
  deleted_at: null,
} as unknown as Form

function page(data: FormNotification[]): Paginated<FormNotification> {
  return {
    data,
    links: { first: '', last: '', prev: null, next: null },
    meta: {
      current_page: 1,
      from: data.length ? 1 : null,
      last_page: 1,
      links: [],
      path: '',
      per_page: 15,
      to: data.length || null,
      total: data.length,
    },
  }
}

/** A stand-in for The Backend's recipient endpoints, with the requests it received. */
function backend(initial: FormNotification[]) {
  const rows = [...initial]
  const requests: { method: string; path: string; body: unknown }[] = []
  const record = async (request: Request) => {
    const url = new URL(request.url)
    const body =
      request.method === 'GET'
        ? null
        : await request
            .clone()
            .json()
            .catch(() => null)

    requests.push({ method: request.method, path: url.pathname, body })
  }

  server.use(
    http.get('*/api/backend/forms/:form/notifications', () =>
      HttpResponse.json(page(rows.filter((row) => row.deleted_at === null))),
    ),
    http.post('*/api/backend/forms/:form/notifications', async ({ request }) => {
      await record(request)
      const body = (await request.json()) as Pick<FormNotification, 'type' | 'value' | 'enabled'>

      if (body.type === 'email' && body.value.endsWith('@taken.example')) {
        return HttpResponse.json(
          {
            message: 'The value is not allowed.',
            errors: { value: ['The value is not allowed.'] },
          },
          { status: 422 },
        )
      }

      const created = recipient(`01k00000000000000000000${rows.length + 100}`, body)

      rows.push(created)

      return HttpResponse.json({ data: created }, { status: 201 })
    }),
    http.put('*/api/backend/notifications/:id', async ({ request, params }) => {
      await record(request)
      const row = rows.find((item) => item.id === params.id)!

      Object.assign(row, await request.json())

      return HttpResponse.json({ data: row })
    }),
    http.delete('*/api/backend/notifications/:id', async ({ request, params }) => {
      await record(request)
      rows.find((item) => item.id === params.id)!.deleted_at = at

      return new HttpResponse(null, { status: 204 })
    }),
    http.post('*/api/backend/notifications/:id/restore', async ({ request, params }) => {
      await record(request)
      const row = rows.find((item) => item.id === params.id)!

      row.deleted_at = null

      return HttpResponse.json({ data: row })
    }),
  )

  return { rows, requests }
}

function renderList() {
  return renderWithProviders(
    <>
      <RecipientList formId={formId} />
      <Toaster />
    </>,
    { seed: (client) => client.setQueryData(queryKeys.forms.detail(formId), form) },
  )
}

const rowFor = (value: string) => screen.getByText(value).closest('tr')!

describe('RecipientList', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('explains that nobody is alerted until a recipient is added', async () => {
    backend([])
    renderList()

    expect(await screen.findByText('Nobody is alerted yet')).toBeVisible()
    expect(screen.getByText(/use the form's timezone \(Europe\/Paris\)/)).toBeVisible()
  })

  it('shows delivery problems inline, and marks SMS as not delivered', async () => {
    backend([
      recipient('01k0000000000000000000000a', {
        value: 'gone@example.com',
        error: 'Bounced (HardBounce): The server was unable to deliver your message.',
      }),
      recipient('01k0000000000000000000000b', { type: 'sms', value: '+14155552671' }),
    ])
    renderList()

    const bounced = within((await screen.findByText('gone@example.com')).closest('tr')!)

    expect(bounced.getByText('Delivery problem')).toBeVisible()
    expect(bounced.getByText(/Bounced \(HardBounce\): The server was unable/)).toBeVisible()
    expect(bounced.getByText('Clears after the next successful delivery.')).toBeVisible()

    const sms = within(rowFor('+14155552671'))

    expect(sms.getByText('Not delivered yet')).toBeVisible()
    expect(sms.getByText('SMS:')).toHaveClass('sr-only')
  })

  it('turns a recipient off with its type and value, and goes back if The Backend refuses', async () => {
    const user = userEvent.setup()
    const { requests } = backend([recipient('01k0000000000000000000000a')])

    renderList()

    const toggle = await screen.findByRole('switch', { name: 'Alerts for 000a@example.com' })

    // From the keyboard, so a switch that remounted on refetch would lose focus.
    toggle.focus()
    await user.keyboard(' ')
    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0]).toEqual({
      method: 'PUT',
      path: '/api/backend/notifications/01k0000000000000000000000a',
      body: { type: 'email', value: '000a@example.com', enabled: false },
    })
    await waitFor(() => expect(toggle).not.toBeChecked())
    expect(toggle).toHaveFocus()

    server.use(
      http.put('*/api/backend/notifications/:id', async () => {
        await delay(100)

        return HttpResponse.json({ message: 'Server error.' }, { status: 500 })
      }),
    )
    await waitFor(() => expect(toggle).not.toHaveAttribute('aria-disabled', 'true'))
    await user.click(toggle)
    await waitFor(() => expect(toggle).toBeChecked())

    // While saving, another press is ignored, and the switch keeps focus (`disabled` would drop it).
    expect(toggle).toHaveAttribute('aria-disabled', 'true')
    await user.keyboard(' ')
    expect(toggle).toBeChecked()
    expect(toggle).toHaveFocus()
    expect(await screen.findByText('Server error.')).toBeVisible()
    await waitFor(() => expect(toggle).not.toBeChecked())
  })

  it('checks SMS numbers in the browser, tidying them on blur', async () => {
    const user = userEvent.setup()
    const { requests } = backend([])

    renderList()
    await user.click((await screen.findAllByRole('button', { name: 'Add recipient' }))[0]!)

    const dialog = within(screen.getByRole('dialog'))

    await user.click(dialog.getByRole('radio', { name: 'SMS' }))
    expect(dialog.getByText("SMS alerts aren't sent yet")).toBeVisible()

    const phone = dialog.getByLabelText('Phone number')

    await user.type(phone, '415-555-2671')
    await user.click(dialog.getByRole('button', { name: 'Add recipient' }))
    expect(await dialog.findByText(/Start with \+ and the country code/)).toBeVisible()
    expect(requests).toHaveLength(0)

    await user.clear(phone)
    await user.type(phone, '0044 7700 900-123')
    await user.tab()
    expect(phone).toHaveValue('+447700900123')

    await user.click(dialog.getByRole('button', { name: 'Add recipient' }))
    expect(await screen.findByText('Added +447700900123')).toBeVisible()
    expect(requests[0]).toMatchObject({
      method: 'POST',
      body: { type: 'sms', value: '+447700900123', enabled: true },
    })
    expect(await screen.findByText('Not delivered yet')).toBeVisible()
  })

  it("shows The Backend's 422 on the value field", async () => {
    const user = userEvent.setup()

    backend([])
    renderList()
    await user.click((await screen.findAllByRole('button', { name: 'Add recipient' }))[0]!)

    const dialog = within(screen.getByRole('dialog'))

    await user.type(dialog.getByLabelText('Email address'), 'me@taken.example')
    await user.click(dialog.getByRole('button', { name: 'Add recipient' }))

    expect(await dialog.findByText('The value is not allowed.')).toBeVisible()
    expect(dialog.getByLabelText('Email address')).toHaveAttribute('aria-invalid', 'true')
  })

  it('edits a recipient with every field, then removes it with Undo', async () => {
    const user = userEvent.setup()
    const { requests } = backend([recipient('01k0000000000000000000000a')])

    renderList()
    await user.click(await screen.findByRole('button', { name: 'Actions for 000a@example.com' }))
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }))

    const dialog = within(screen.getByRole('dialog'))
    const email = dialog.getByLabelText('Email address')

    expect(email).toHaveValue('000a@example.com')
    await user.clear(email)
    await user.type(email, 'team@example.com')
    await user.click(dialog.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Recipient saved')).toBeVisible()
    expect(requests[0]).toMatchObject({
      method: 'PUT',
      body: { type: 'email', value: 'team@example.com', enabled: true },
    })

    await user.click(await screen.findByRole('button', { name: 'Actions for team@example.com' }))
    await user.click(screen.getByRole('menuitem', { name: 'Remove' }))
    expect(await screen.findByText('Removed team@example.com')).toBeVisible()
    expect(await screen.findByText('Nobody is alerted yet')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByText('Restored team@example.com')).toBeVisible()
    expect(await screen.findByRole('switch', { name: 'Alerts for team@example.com' })).toBeChecked()
    expect(requests.map(({ method, path }) => `${method} ${path}`).slice(1)).toEqual([
      'DELETE /api/backend/notifications/01k0000000000000000000000a',
      'POST /api/backend/notifications/01k0000000000000000000000a/restore',
    ])
  })
})
