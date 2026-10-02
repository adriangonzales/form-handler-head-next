import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { FormsList } from '../../components/forms/forms-list'
import type { FormListItem, Paginated } from '../../types/models'
import { server } from '../mocks/server'
import { renderWithProviders } from './render'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

function formItem(overrides: Partial<FormListItem> = {}): FormListItem {
  return {
    id: '01k0000000000000000000000a',
    user_id: 1,
    name: 'Contact',
    active: true,
    schema: null,
    settings: null,
    entries_count: 4,
    unread_entries_count: 2,
    spam_entries_count: 0,
    created_at: '2026-10-01T10:00:00.000000Z',
    updated_at: '2026-10-01T10:00:00.000000Z',
    deleted_at: null,
    ...overrides,
  }
}

function page(data: FormListItem[], meta: Partial<Paginated<FormListItem>['meta']> = {}) {
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
      ...meta,
    },
  }
}

describe('FormsList', () => {
  it('requests the page the URL describes, in the contract syntax', async () => {
    const requested: URLSearchParams[] = []

    server.use(
      http.get('*/api/backend/forms', ({ request }) => {
        requested.push(new URL(request.url).searchParams)

        return HttpResponse.json(page([formItem({ active: false })]))
      }),
    )
    renderWithProviders(<FormsList />, { searchParams: '?active=false&sort=name&page=2' })

    expect(await screen.findByRole('link', { name: 'Contact' })).toBeVisible()
    expect(Object.fromEntries(requested[0]!)).toEqual({
      page: '2',
      per_page: '15',
      sort: 'name',
      'filter[active]': 'false',
    })
    expect(screen.getByRole('tab', { name: 'Inactive' })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows counts with links to the matching entries tabs', async () => {
    server.use(
      http.get('*/api/backend/forms', () =>
        HttpResponse.json(page([formItem({ spam_entries_count: 3 })])),
      ),
    )
    renderWithProviders(<FormsList />)

    const row = (await screen.findByRole('link', { name: 'Contact' })).closest('tr')!

    expect(within(row).getByRole('link', { name: '2 unread' })).toHaveAttribute(
      'href',
      '/forms/01k0000000000000000000000a/entries?status=unread',
    )
    expect(within(row).getByRole('link', { name: '3 spam in Contact' })).toHaveAttribute(
      'href',
      '/forms/01k0000000000000000000000a/entries?status=spam',
    )
    expect(within(row).getByText('Active')).toBeVisible()
  })

  it('resets to page 1 when the filter changes', async () => {
    const user = userEvent.setup()

    server.use(http.get('*/api/backend/forms', () => HttpResponse.json(page([formItem()]))))
    const { urlUpdates } = renderWithProviders(<FormsList />, { searchParams: '?page=3' })

    await screen.findByRole('link', { name: 'Contact' })
    await user.click(screen.getByRole('tab', { name: 'Active' }))

    await vi.waitFor(() => expect(urlUpdates.at(-1)?.toString()).toBe('active=true'))
  })

  it('invites the user to create a first form', async () => {
    server.use(http.get('*/api/backend/forms', () => HttpResponse.json(page([]))))
    renderWithProviders(<FormsList />)

    expect(await screen.findByRole('heading', { name: 'Create your first form' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'New form' })).toHaveAttribute('href', '/forms/new')
  })

  it('shows a failure with Retry', async () => {
    const user = userEvent.setup()
    let calls = 0

    server.use(
      http.get('*/api/backend/forms', () => {
        calls += 1

        return calls === 1
          ? HttpResponse.json({ message: 'The Backend is down.' }, { status: 503 })
          : HttpResponse.json(page([formItem()]))
      }),
    )
    renderWithProviders(<FormsList />)

    expect(await screen.findByText('The Backend is down.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('link', { name: 'Contact' })).toBeVisible()
  })
})
