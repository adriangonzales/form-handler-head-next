import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing'
import { TooltipProvider } from '@/components/ui/tooltip'

/**
 * Renders a component with a fresh query client (optionally seeded) and URL state from
 * `searchParams`. Returns the client, and the URL updates nuqs made.
 */
export function renderWithProviders(
  ui: React.ReactElement,
  options: { searchParams?: string; seed?: (client: QueryClient) => void } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  const urlUpdates: URLSearchParams[] = []
  const Nuqs = withNuqsTestingAdapter({
    searchParams: options.searchParams,
    onUrlUpdate: ({ searchParams }) => urlUpdates.push(searchParams),
  })

  options.seed?.(queryClient)

  const result = render(
    <QueryClientProvider client={queryClient}>
      <Nuqs>
        <TooltipProvider>{ui}</TooltipProvider>
      </Nuqs>
    </QueryClientProvider>,
  )

  return { ...result, queryClient, urlUpdates }
}
