import { isServer, QueryClient } from '@tanstack/react-query'
import { ApiError } from './api-client'

/**
 * A query client. Data the server prefetched stays fresh for a minute, so hydrating doesn't refetch
 * it straight away. Failed requests are retried once, except for answers that won't change on retry.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: (failures, error) =>
          failures < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined

/** One client per server request, and one for the browser's lifetime. */
export function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient()

  browserQueryClient ??= makeQueryClient()

  return browserQueryClient
}
