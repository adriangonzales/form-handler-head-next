import type { ApiQuery } from '@/lib/backend/query'

/**
 * Every TanStack Query key, so mutations can invalidate exactly what they change. Keys are
 * hierarchical: invalidating `forms.all` also refreshes every list and detail.
 */
export const queryKeys = {
  forms: {
    all: ['forms'] as const,
    lists: () => [...queryKeys.forms.all, 'list'] as const,
    list: (query: ApiQuery) => [...queryKeys.forms.lists(), query] as const,
    detail: (id: string) => [...queryKeys.forms.all, 'detail', id] as const,
  },
}
