import { Mail, MessageSquare, type LucideIcon } from 'lucide-react'
import { z } from 'zod'

// Recipients of a form's new-entry alerts: types, the add/edit form's checks, and phone tidying.
// Ported from the Nuxt dashboard's app/utils/notifications.ts.

export type NotificationType = 'email' | 'sms'

/** The contract's rule for SMS numbers: E.164, a `+`, the country code and up to 15 digits in all. */
export const e164Pattern = /^\+[1-9]\d{1,14}$/

export const notificationTypes = [
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'sms', label: 'SMS', icon: MessageSquare },
] as const satisfies readonly { value: NotificationType; label: string; icon: LucideIcon }[]

/** A type's label and icon. The spec types `type` as a string, so anything unknown reads as email. */
export function notificationTypeMeta(type: string) {
  return notificationTypes.find((item) => item.value === type) ?? notificationTypes[0]
}

export function isNotificationType(type: string): type is NotificationType {
  return notificationTypes.some((item) => item.value === type)
}

/** The recipients page a URL's `?page=` asks for: a positive integer, or 1. */
export function pageFrom(value: string | string[] | null | undefined): number {
  const page = Number(Array.isArray(value) ? value[0] : value)

  return Number.isInteger(page) && page > 0 ? page : 1
}

/**
 * Tidies a typed phone number towards E.164: drops spaces, dashes, dots and brackets, and turns a
 * leading `00` into `+`. It doesn't guess a missing country code.
 */
export function tidyPhoneNumber(value: string): string {
  const tidied = value.trim().replace(/[\s().-]/g, '')

  return tidied.startsWith('00') ? `+${tidied.slice(2)}` : tidied
}

/** The add/edit form's checks, matching The Backend's (`email` for email, E.164 for SMS). */
export const notificationSchema = z
  .object({
    type: z.enum(['email', 'sms']),
    value: z.string().trim().min(1, 'Enter a recipient.'),
    enabled: z.boolean(),
  })
  .superRefine((data, context) => {
    if (data.type === 'email' && !z.email().max(255).safeParse(data.value).success) {
      context.addIssue({ code: 'custom', path: ['value'], message: 'Enter a valid email address.' })
    }

    if (data.type === 'sms' && !e164Pattern.test(data.value)) {
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: data.value.startsWith('+')
          ? 'Use the international format: + then the country code and number, digits only.'
          : 'Start with + and the country code, for example +14155552671.',
      })
    }
  })

export type NotificationDraft = z.infer<typeof notificationSchema>
