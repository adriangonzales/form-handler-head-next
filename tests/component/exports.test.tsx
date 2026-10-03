import { act, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { Toaster } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExportButton } from '../../components/entries/export-button'
import { onExportSettled, useExportsWatcher } from '../../hooks/use-exports-watcher'
import { recentExportsQuery } from '../../lib/exports/queries'
import { queryKeys } from '../../lib/query-keys'
import type { FormEntryExport, Paginated } from '../../types/models'
import { server } from '../mocks/server'
import { renderWithProviders } from './render'

const formId = '01k0000000000000000000000f'
const otherFormId = '01k0000000000000000000000g'
const at = '2026-10-02T10:00:00.000000Z'

function entryExport(id: string, overrides: Partial<FormEntryExport> = {}): FormEntryExport {
  return {
    id,
    form_id: formId,
    status: 'completed',
    parameters: { filter: { spam: 'false' }, sort: '-created_at' },
    filename: 'contact-entries-2026-10-02.csv',
    row_count: 3,
    error: null,
    download_url: null,
    completed_at: at,
    expires_at: '2026-10-03T10:00:00.000000Z',
    created_at: at,
    updated_at: at,
    ...overrides,
  }
}

function page(data: FormEntryExport[], lastPage = 1): Paginated<FormEntryExport> {
  return {
    data,
    links: { first: '', last: '', prev: null, next: null },
    meta: {
      current_page: 1,
      from: data.length ? 1 : null,
      last_page: lastPage,
      links: [],
      path: '',
      per_page: 100,
      to: data.length || null,
      total: data.length,
    },
  }
}

const recentKey = queryKeys.exports.list(recentExportsQuery)

describe('useExportsWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function watch(rows: FormEntryExport[]) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })

    queryClient.setQueryData(recentKey, page(rows))

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    return { queryClient, ...renderHook(() => useExportsWatcher(), { wrapper }) }
  }

  it('polls an in-progress export until it settles, updating the list and telling listeners', async () => {
    const statuses = ['processing', 'completed']
    const show = vi.fn(() =>
      HttpResponse.json({
        data: entryExport('01k000000000000000000000e1', { status: statuses.shift()! }),
      }),
    )
    const settled = vi.fn()

    server.use(http.get('*/api/backend/entry-exports/:id', show))
    onExportSettled('01k000000000000000000000e1', settled)

    const { queryClient } = watch([
      entryExport('01k000000000000000000000e1', { status: 'pending', row_count: null }),
      entryExport('01k000000000000000000000e2'),
    ])

    await act(() => vi.advanceTimersByTimeAsync(2_000))
    expect(show).toHaveBeenCalledTimes(1)
    expect(settled).not.toHaveBeenCalled()

    await act(() => vi.advanceTimersByTimeAsync(2_000))
    expect(show).toHaveBeenCalledTimes(2)
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }))
    expect(queryClient.getQueryData<Paginated<FormEntryExport>>(recentKey)?.data[0]?.status).toBe(
      'completed',
    )

    // Settled: no more polling, and the completed export was never polled.
    await act(() => vi.advanceTimersByTimeAsync(30_000))
    expect(show).toHaveBeenCalledTimes(2)
  })

  it('waits while the tab is hidden, and drops an export that no longer exists', async () => {
    const show = vi.fn(() => HttpResponse.json({ message: 'Not found.' }, { status: 404 }))
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')

    server.use(http.get('*/api/backend/entry-exports/:id', show))

    const { queryClient } = watch([
      entryExport('01k000000000000000000000e1', { status: 'pending' }),
    ])

    await act(() => vi.advanceTimersByTimeAsync(10_000))
    expect(show).not.toHaveBeenCalled()

    visibility.mockReturnValue('visible')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(show).toHaveBeenCalledTimes(1)
    expect(queryClient.getQueryData<Paginated<FormEntryExport>>(recentKey)?.data).toEqual([])
    visibility.mockRestore()
  })
})

describe('ExportButton', () => {
  function renderButton(rows: FormEntryExport[], lastPage = 1) {
    return renderWithProviders(
      <>
        <ExportButton
          formId={formId}
          apiQuery={{ page: 3, per_page: 50, sort: '-created_at', 'filter[spam]': 'false' }}
        />
        <Toaster />
      </>,
      { seed: (client) => client.setQueryData(recentKey, page(rows, lastPage)) },
    )
  }

  it("lists only this form's exports, with a badge for those in progress", async () => {
    renderButton([
      entryExport('01k000000000000000000000e1', { status: 'processing', row_count: null }),
      entryExport('01k000000000000000000000e2', { form_id: otherFormId }),
      entryExport('01k000000000000000000000e3', {
        status: 'failed',
        error: 'The form was deleted.',
      }),
    ])

    await userEvent.click(screen.getByRole('button', { name: 'Exports, 1 in progress' }))

    const popover = screen.getByRole('dialog')

    expect(within(popover).getAllByRole('listitem')).toHaveLength(2)
    expect(within(popover).getByText('Processing…')).toBeInTheDocument()
    expect(within(popover).getByText('The form was deleted.')).toBeInTheDocument()
    expect(within(popover).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it("exports the table's filters and sort, never its page", async () => {
    const bodies: unknown[] = []
    const post = vi.fn(async ({ request }: { request: Request }) => {
      const parameters = (await request.json()) as FormEntryExport['parameters']

      bodies.push(parameters)

      return HttpResponse.json(
        { data: entryExport('01k000000000000000000000e9', { status: 'pending', parameters }) },
        { status: 202 },
      )
    })

    server.use(http.post(`*/api/backend/forms/${formId}/entries/exports`, post))
    renderButton([])

    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }))

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(bodies[0]).toEqual({
      filter: { spam: 'false' },
      sort: '-created_at',
    })
    expect(await screen.findByRole('dialog')).toHaveTextContent('Inbox · newest first')
  })

  it('warns before exporting the same filters again, with Export anyway', async () => {
    const post = vi.fn(() =>
      HttpResponse.json({ data: entryExport('01k000000000000000000000e9') }, { status: 202 }),
    )

    server.use(http.post(`*/api/backend/forms/${formId}/entries/exports`, post))
    renderButton([
      entryExport('01k000000000000000000000e1', {
        status: 'pending',
        parameters: { filter: { spam: '0' }, sort: '-created_at' },
      }),
    ])

    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }))

    expect(
      await screen.findByText('An export with these filters is already being prepared'),
    ).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Export anyway' }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
  })

  it('points to the Exports page when there are more than 100 recent exports', async () => {
    renderButton([entryExport('01k000000000000000000000e1')], 2)

    await userEvent.click(screen.getByRole('button', { name: 'Exports' }))

    expect(screen.getByText(/Only your 100 most recent exports/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See all exports' })).toHaveAttribute(
      'href',
      '/exports',
    )
  })
})
