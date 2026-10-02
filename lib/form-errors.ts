import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { ApiError } from './api-client'

/**
 * Splits 422 errors into errors for fields the form has and messages for anything else, which the
 * form shows in an alert. Errors on list items (`settings.domains.2`) go to the list's field.
 */
export function toFormErrors<Name extends string>(
  errors: Record<string, string[]>,
  fieldNames: readonly Name[],
): { fieldErrors: { name: Name; message: string }[]; otherMessages: string[] } {
  const fieldErrors: { name: Name; message: string }[] = []
  const otherMessages: string[] = []

  for (const [name, messages] of Object.entries(errors)) {
    const message = messages[0]

    if (!message) continue

    const field = fieldNames.find((field) => name === field || name.startsWith(`${field}.`))

    if (field) fieldErrors.push({ name: field, message })
    else otherMessages.push(message)
  }

  return { fieldErrors, otherMessages }
}

/**
 * Shows a failed request on a react-hook-form form: field errors on their fields, and returns the
 * message for the form's alert (the API's message, unless every error landed on a field).
 */
export function applyApiError<Values extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<Values>,
  fieldNames: readonly Path<Values>[],
): string | undefined {
  const apiError =
    error instanceof ApiError ? error : new ApiError(0, 'Something went wrong. Please try again.')
  const { fieldErrors, otherMessages } = toFormErrors(apiError.errors, fieldNames)

  for (const { name, message } of fieldErrors) {
    setError(name, { type: 'server', message })
  }

  return fieldErrors.length > 0 ? otherMessages[0] : apiError.message
}
