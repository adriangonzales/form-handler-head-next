import { ulid } from '@/lib/ulid'
import type { FormSchemaBody } from '@/types/models'

export type FormTemplateId = 'blank' | 'contact' | 'newsletter'

export interface FormTemplate {
  id: FormTemplateId
  label: string
  description: string
  /** Builds the template's schema, with fresh ULIDs as field IDs. */
  schema: () => FormSchemaBody | null
}

export const formTemplates: readonly FormTemplate[] = [
  { id: 'blank', label: 'Blank', description: 'No fields yet.', schema: () => null },
  {
    id: 'contact',
    label: 'Contact',
    description: 'Name, email and message.',
    schema: () => [
      { id: ulid(), order: 1, label: 'Name', name: 'name', rules: ['required', 'max:255'] },
      {
        id: ulid(),
        order: 2,
        label: 'Email',
        name: 'email',
        rules: ['required', 'email', 'max:255'],
      },
      { id: ulid(), order: 3, label: 'Message', name: 'message', rules: ['required', 'max:5000'] },
    ],
  },
  {
    id: 'newsletter',
    label: 'Newsletter',
    description: 'Email address only.',
    schema: () => [
      {
        id: ulid(),
        order: 1,
        label: 'Email',
        name: 'email',
        rules: ['required', 'email', 'max:255'],
      },
    ],
  },
]

export function templateSchema(id: FormTemplateId): FormSchemaBody | null {
  return formTemplates.find((template) => template.id === id)?.schema() ?? null
}
