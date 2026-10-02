import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { backendRequest } from '@/lib/api-client'
import { type ApiQuery, toSearch } from '@/lib/backend/query'
import type { ListQueryOptions } from '@/lib/list-query'
import { queryKeys } from '@/lib/query-keys'
import type { Form, FormListItem, FormStoreBody, FormUpdateBody, Paginated } from '@/types/models'

// Browser-side calls to The Backend's form endpoints, through the authenticated proxy.

export const formSorts = [
  { value: '-updated_at', label: 'Recently updated' },
  { value: 'updated_at', label: 'Least recently updated' },
  { value: '-created_at', label: 'Newest' },
  { value: 'created_at', label: 'Oldest' },
  { value: 'name', label: 'Name A–Z' },
  { value: '-name', label: 'Name Z–A' },
] as const

export const formListOptions: ListQueryOptions<'active'> = {
  sorts: formSorts.map((sort) => sort.value),
  defaultSort: '-updated_at',
  filters: { active: ['true', 'false'] },
}

const formPath = (id: string) => `/forms/${encodeURIComponent(id)}` as const

export function formsListQuery(query: ApiQuery) {
  return queryOptions({
    queryKey: queryKeys.forms.list(query),
    queryFn: () => backendRequest<Paginated<FormListItem>>(`/forms${toSearch(query)}`),
    // Keep the current page on screen while the next one loads.
    placeholderData: keepPreviousData,
  })
}

/** One form, shared by the header and every tab of /forms/[formId]. */
export function formQuery(id: string) {
  return queryOptions({
    queryKey: queryKeys.forms.detail(id),
    queryFn: () => backendRequest<{ data: Form }>(formPath(id)).then(({ data }) => data),
  })
}

export async function createForm(body: FormStoreBody): Promise<Form> {
  const { data } = await backendRequest<{ data: Form }>('/forms', {
    method: 'POST',
    body: JSON.stringify(body),
  })

  return data
}

/** Updates a form. The Backend requires `name` and `active`, even to change only one of them. */
export async function updateForm(id: string, body: FormUpdateBody): Promise<Form> {
  const { data } = await backendRequest<{ data: Form }>(formPath(id), {
    method: 'PUT',
    body: JSON.stringify(body),
  })

  return data
}

export async function deleteForm(id: string): Promise<void> {
  await backendRequest(formPath(id), { method: 'DELETE' })
}

export async function restoreForm(id: string): Promise<Form> {
  const { data } = await backendRequest<{ data: Form }>(`${formPath(id)}/restore`, {
    method: 'POST',
  })

  return data
}

export async function duplicateForm(id: string): Promise<Form> {
  const { data } = await backendRequest<{ data: Form }>(`${formPath(id)}/duplicate`, {
    method: 'POST',
  })

  return data
}
