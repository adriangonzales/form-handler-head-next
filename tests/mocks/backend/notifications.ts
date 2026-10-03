import { ulid } from '../../../lib/ulid'
import type { FormNotification } from '../../../types/models'

// Alert recipients in the mock backend: validation following docs/backend-contract.md, with the
// reference Backend's messages.

type Errors = Record<string, string[]>

const e164Pattern = /^\+[1-9]\d{1,14}$/
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function add(errors: Errors, key: string, message: string) {
  ;(errors[key] ??= []).push(message)
}

/**
 * Checks a create (`enabled` optional) or update (`enabled` required, `form_id` refused) body.
 * `error` is reported by the backend, so sending it is refused either way, even as `null`.
 */
export function validateNotification(
  body: Record<string, unknown>,
  mode: 'create' | 'update',
): Errors {
  const errors: Errors = {}
  const { type, value, enabled } = body

  if (mode === 'update' && 'form_id' in body) {
    add(errors, 'form_id', 'The form id field must be missing.')
  }

  if (type === undefined || type === null || type === '') {
    add(errors, 'type', 'The type field is required.')
  } else if (type !== 'email' && type !== 'sms') {
    add(errors, 'type', 'The selected type is invalid.')
  }

  if (typeof value !== 'string' || value.trim() === '') {
    add(errors, 'value', 'The value field is required.')
  } else if (type === 'email' && (value.length > 255 || !emailPattern.test(value))) {
    add(errors, 'value', 'The value field must be a valid email address.')
  } else if (type === 'sms' && !e164Pattern.test(value)) {
    add(errors, 'value', 'The value field format is invalid.')
  }

  if (mode === 'update' && (enabled === undefined || enabled === null)) {
    add(errors, 'enabled', 'The enabled field is required.')
  } else if (enabled !== undefined && typeof enabled !== 'boolean') {
    add(errors, 'enabled', 'The enabled field must be true or false.')
  }

  if ('error' in body) add(errors, 'error', 'The error field must be missing.')

  return errors
}

export function newNotification(
  formId: string,
  body: { type: string; value: string; enabled?: unknown },
  at: string,
): FormNotification {
  return {
    id: ulid(),
    form_id: formId,
    type: body.type,
    value: body.value,
    enabled: typeof body.enabled === 'boolean' ? body.enabled : true,
    error: null,
    created_at: at,
    updated_at: at,
    deleted_at: null,
  }
}
