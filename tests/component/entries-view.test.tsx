import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { Toaster } from 'sonner'
import { EntriesView } from '../../components/entries/entries-view'
import { queryKeys } from '../../lib/query-keys'
import type { Form, FormEntry } from '../../types/models'
import { server } from '../mocks/server'
import { renderWithProviders } from './render'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

const formId = '01k0000000000000000000000f'
const created = '2026-10-02T10:00:00.000000Z'

const form: Form = {
  id: formId,
  user_id: 1,
  name: 'Contact',
  active: true,
  schema: [{ id: '01k0000000000000000000000b', order: 1, label: 'Message', name: 'message' }],
  settings: null,
  created_at: created,
  updated_at: created,
  deleted_at: null,
}

const entry = (id: string, message: string, overrides: Partial<FormEntry> = {}): FormEntry => ({
  id,
  form_id: formId,
  input: { message },
  ip: null,
  ip_location_display: null,
  referer: null,
  user_agent: null,
  user_agent_display: null,
  spam: false,
  spam_score: 0,
  spam_reason: null,
  spam_checked_at: created,
  starred: false,
  read_at: null,
  created_at: created,
  updated_at: created,
  deleted_at: null,
  ...overrides,
})

const rows = [
  entry('01k0000000000000000000000a', 'First'),
  entry('01k0000000000000000000000b', 'Second', { read_at: created }),
]

function page(data: FormEntry[]) {
  return {
    data,
    links: { first: null, last: null, prev: null, next: null },
    meta: {
      current_page: 1,
      from: data.length ? 1 : null,
      last_page: 1,
      path: null,
      per_page: 15,
      to: data.length || null,
      total: data.length,
      links: [],
    },
  }
}

function renderEntries(searchParams?: string) {
  const requests: Record<string, string>[] = []

  server.use(
    http.get(`*/api/backend/forms/${formId}/entries`, ({ request }) => {
      const query = Object.fromEntries(new URL(request.url).searchParams)

      requests.push(query)

      return HttpResponse.json(query.per_page === '1' ? page(rows.slice(0, 1)) : page(rows))
    }),
  )

  const result = renderWithProviders(
    <>
      <EntriesView formId={formId} renderedAt={Date.parse(created) + 3_600_000} />
      <Toaster />
    </>,
    {
      searchParams,
      seed: (client) => client.setQueryData(queryKeys.forms.detail(formId), form),
    },
  )

  return { ...result, requests }
}

describe('EntriesView', () => {
  it('lists the tab newest first, with unread rows in bold', async () => {
    const { requests } = renderEntries('?status=unread')

    const first = (await screen.findByText('First')).closest('tr')!

    expect(first).toHaveClass('font-semibold')
    expect(screen.getByText('Second').closest('tr')).not.toHaveClass('font-semibold')
    expect(requests).toContainEqual({
      page: '1',
      per_page: '15',
      sort: '-created_at',
      'filter[read]': 'false',
      'filter[spam]': 'false',
    })
    expect(screen.getByRole('tab', { name: /^Unread/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('runs a bulk action on the selection and reports how many changed', async () => {
    const user = userEvent.setup()
    let body: unknown

    server.use(
      http.post(`*/api/backend/forms/${formId}/entries/bulk`, async ({ request }) => {
        body = await request.json()

        return HttpResponse.json({ data: { action: 'star', affected: 1 } })
      }),
    )
    renderEntries()

    await screen.findByText('First')
    await user.click(screen.getByRole('checkbox', { name: 'Select all on this page' }))

    const bar = screen.getByRole('toolbar', { name: 'Bulk actions' })

    expect(within(bar).getByText('2 selected')).toBeVisible()
    await user.click(within(bar).getByRole('button', { name: 'Star' }))

    expect(await screen.findByText('1 entry starred')).toBeVisible()
    expect(body).toEqual({ action: 'star', ids: rows.map((row) => row.id) })
    expect(screen.queryByRole('toolbar', { name: 'Bulk actions' })).toBeNull()
  })

  it('asks before deleting permanently from Trash', async () => {
    const user = userEvent.setup()
    const bulk = vi.fn(() => HttpResponse.json({ data: { action: 'force_delete', affected: 2 } }))

    server.use(http.post(`*/api/backend/forms/${formId}/entries/bulk`, bulk))
    renderEntries('?status=trash')

    await screen.findByText('First')
    await user.click(screen.getByRole('checkbox', { name: 'Select all on this page' }))
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }))

    const dialog = screen.getByRole('alertdialog', { name: 'Permanently delete 2 entries?' })

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(bulk).not.toHaveBeenCalled()
  })

  it('explains a stale selection and refreshes', async () => {
    const user = userEvent.setup()

    server.use(
      http.post(`*/api/backend/forms/${formId}/entries/bulk`, () =>
        HttpResponse.json(
          { message: 'The selected ids.1 is invalid.', errors: { 'ids.1': ['Invalid.'] } },
          { status: 422 },
        ),
      ),
    )
    renderEntries()

    await screen.findByText('First')
    await user.click(screen.getByRole('checkbox', { name: 'Select all on this page' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Some entries changed. Refresh and try again.')).toBeVisible()
  })
})
