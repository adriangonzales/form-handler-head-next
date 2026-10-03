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
    /** Every form's name by ID, for exports, which only carry `form_id`. */
    names: () => [...queryKeys.forms.all, 'names'] as const,
  },
  entries: {
    all: ['entries'] as const,
    /** Everything about one form's entries: lists, counts. */
    form: (formId: string) => [...queryKeys.entries.all, 'form', formId] as const,
    /** How many entries a form has, deleted ones included. */
    total: (formId: string) => [...queryKeys.entries.form(formId), 'total'] as const,
    lists: (formId: string) => [...queryKeys.entries.form(formId), 'list'] as const,
    list: (formId: string, query: ApiQuery) => [...queryKeys.entries.lists(formId), query] as const,
    /** The Inbox, Unread and Spam tab badges. */
    counts: (formId: string) => [...queryKeys.entries.form(formId), 'counts'] as const,
    detail: (formId: string, id: string) =>
      [...queryKeys.entries.form(formId), 'detail', id] as const,
  },
  exports: {
    all: ['exports'] as const,
    lists: () => [...queryKeys.exports.all, 'list'] as const,
    list: (query: ApiQuery) => [...queryKeys.exports.lists(), query] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    /** Every page of one form's recipients. */
    lists: (formId: string) => [...queryKeys.notifications.all, 'form', formId] as const,
    list: (formId: string, page: number) =>
      [...queryKeys.notifications.lists(formId), page] as const,
  },
}
