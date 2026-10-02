import type { components } from './api'

type Schemas = components['schemas']

export type User = Schemas['UserResource']

export type Form = Schemas['FormResource']
/** A form as returned by the forms list, which always includes the entry counts. */
export type FormListItem = Form &
  Required<Pick<Form, 'entries_count' | 'unread_entries_count' | 'spam_entries_count'>>
/** A list of fields, each with a ULID `id` and an integer `order`. The Backend returns it sorted by `order`. */
export type FormSchema = NonNullable<Form['schema']>
export type FormField = FormSchema[number]
export type FormSettings = NonNullable<Form['settings']>

export type FormStoreBody = Schemas['FormStoreRequest']
export type FormUpdateBody = Schemas['FormUpdateRequest']
/** The schema as sent to create or update a form, with each field's rules as an array. */
export type FormSchemaBody = NonNullable<FormStoreBody['schema']>
export type FormFieldBody = FormSchemaBody[number]

export type FormEntry = Schemas['FormEntryResource']
export type FormEntryUpdateBody = Schemas['FormEntryUpdateRequest']
export type FormEntryQuery = Schemas['FormEntryIndexRequest']
export type FormEntryBulkBody = Schemas['FormEntryBulkRequest']
export type FormEntryBulkAction = FormEntryBulkBody['action']

export type FormEntryExport = Schemas['FormEntryExportResource']

export type FormNotification = Schemas['FormNotificationResource']
export type FormNotificationStoreBody = Schemas['FormNotificationStoreRequest']
export type FormNotificationUpdateBody = Schemas['FormNotificationUpdateRequest']

/** The contract's paginated list envelope. */
export interface Paginated<T> {
  data: T[]
  links: { first: string | null; last: string | null; prev: string | null; next: string | null }
  meta: {
    current_page: number
    from: number | null
    last_page: number
    path: string | null
    per_page: number
    to: number | null
    total: number
    links: { url: string | null; label: string; active: boolean }[]
  }
}

/** The contract's 422 body. */
export interface ValidationErrorBody {
  message: string
  errors: Record<string, string[]>
}
