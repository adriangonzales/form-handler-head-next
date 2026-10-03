import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { SchemaBuilder } from '../../components/forms/schema-builder'
import { queryKeys } from '../../lib/query-keys'
import type { Form } from '../../types/models'
import { server } from '../mocks/server'
import { renderWithProviders } from './render'

const form: Form = {
  id: '01k0000000000000000000000a',
  user_id: 1,
  name: 'Contact',
  active: true,
  schema: [
    { id: '01k0000000000000000000000c', order: 2, label: 'Message', name: 'message' },
    {
      id: '01k0000000000000000000000b',
      order: 1,
      label: 'Email',
      name: 'email',
      rules: 'required,email',
    },
  ],
  settings: null,
  created_at: '2026-10-01T10:00:00.000000Z',
  updated_at: '2026-10-01T10:00:00.000000Z',
  deleted_at: null,
}

function renderBuilder(entryTotal = 0) {
  server.use(
    http.get(`*/api/backend/forms/${form.id}/entries`, () =>
      HttpResponse.json({ data: [], links: {}, meta: { total: entryTotal } }),
    ),
  )

  return renderWithProviders(<SchemaBuilder formId={form.id} />, {
    seed: (client) => client.setQueryData(queryKeys.forms.detail(form.id), form),
  })
}

const rows = () => screen.getAllByRole('listitem').filter((item) => item.dataset.fieldRow)

describe('SchemaBuilder', () => {
  it('lists fields by order and saves them renumbered, with rules as arrays', async () => {
    const user = userEvent.setup()
    let body: { schema?: unknown } = {}

    server.use(
      http.put(`*/api/backend/forms/${form.id}`, async ({ request }) => {
        body = (await request.json()) as typeof body

        return HttpResponse.json({ data: { ...form, schema: body.schema } })
      }),
    )
    renderBuilder()

    expect(within(rows()[0]!).getByLabelText('Input name')).toHaveValue('email')
    expect(within(rows()[0]!).getByRole('checkbox', { name: 'Email address' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Save fields' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Move Message up' }))
    await user.click(screen.getByRole('button', { name: 'Save fields' }))

    await vi.waitFor(() =>
      expect(body).toEqual({
        name: 'Contact',
        active: true,
        schema: [
          { id: '01k0000000000000000000000c', order: 1, label: 'Message', name: 'message' },
          {
            id: '01k0000000000000000000000b',
            order: 2,
            label: 'Email',
            name: 'email',
            rules: ['required', 'email'],
          },
        ],
      }),
    )
    expect(await screen.findByRole('button', { name: 'Save fields' })).toBeDisabled()
  })

  it('names a new field after its label, uniquely, until the name is typed', async () => {
    const user = userEvent.setup()

    renderBuilder()
    await user.click(screen.getByRole('button', { name: 'Add field' }))

    const row = rows()[2]!

    await user.type(within(row).getByLabelText('Label'), 'Email')
    expect(within(row).getByLabelText('Input name')).toHaveValue('email_2')

    await user.clear(within(row).getByLabelText('Input name'))
    await user.type(within(row).getByLabelText('Input name'), 'reply_to')
    await user.type(within(row).getByLabelText('Label'), ' address')
    expect(within(row).getByLabelText('Input name')).toHaveValue('reply_to')
  })

  it('flags invalid input names without saving', async () => {
    const user = userEvent.setup()
    const put = vi.fn()

    server.use(http.put('*/api/backend/forms/*', put))
    renderBuilder()

    const name = within(rows()[1]!).getByLabelText('Input name')

    await user.clear(name)
    await user.type(name, 'email')
    await user.click(screen.getByRole('button', { name: 'Save fields' }))

    expect(screen.getByText('Fix the highlighted fields, then save again.')).toBeVisible()
    expect(
      within(rows()[1]!).getByText('Another field already uses this input name.'),
    ).toBeVisible()
    expect(put).not.toHaveBeenCalled()
  })

  it('warns that entries keep a renamed field under its old name', async () => {
    const user = userEvent.setup()

    renderBuilder(3)

    const name = within(rows()[1]!).getByLabelText('Input name')

    await user.clear(name)
    await user.type(name, 'comments')

    expect(await screen.findByText('This form already has entries')).toBeVisible()
    expect(screen.getByText(/keep their values under “message”/)).toBeVisible()
  })
})
