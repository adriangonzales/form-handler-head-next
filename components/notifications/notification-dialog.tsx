'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { MessageSquareOff } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { FormAlert } from '@/components/auth/form-alert'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { applyApiError } from '@/lib/form-errors'
import {
  type NotificationDraft,
  notificationSchema,
  notificationTypes,
  tidyPhoneNumber,
} from '@/lib/notifications/notifications'
import { createNotification, updateNotification } from '@/lib/notifications/queries'
import type { FormNotification } from '@/types/models'

const fieldNames = ['type', 'value', 'enabled'] as const

/**
 * Add or edit a recipient in a dialog. It saves through The Backend itself, so 422s show on their
 * fields, and calls `onSaved` with the stored recipient before closing.
 */
export function NotificationDialog({
  formId,
  notification,
  open,
  onOpenChange,
  onSaved,
}: {
  formId: string
  /** The recipient to edit; leave out to add one. */
  notification?: FormNotification
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (saved: FormNotification) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{notification ? 'Edit recipient' : 'Add recipient'}</DialogTitle>
          <DialogDescription>
            {notification
              ? 'Changes apply to the next alert.'
              : 'Alerted when a new entry arrives through your site.'}
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so each opening starts from the recipient's saved values. */}
        {open && (
          <NotificationFields
            formId={formId}
            notification={notification}
            onSaved={(saved) => {
              onSaved(saved)
              onOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function NotificationFields({
  formId,
  notification,
  onSaved,
}: {
  formId: string
  notification?: FormNotification
  onSaved: (saved: FormNotification) => void
}) {
  const [failure, setFailure] = useState<string>()
  const form = useForm<NotificationDraft>({
    resolver: zodResolver(notificationSchema),
    defaultValues: {
      type: notification?.type === 'sms' ? 'sms' : 'email',
      value: notification?.value ?? '',
      enabled: notification?.enabled ?? true,
    },
  })
  const { errors, isSubmitted } = form.formState
  const type = useWatch({ control: form.control, name: 'type' })
  const isSms = type === 'sms'

  const save = useMutation({
    mutationFn: (values: NotificationDraft) =>
      notification
        ? updateNotification(notification.id, values)
        : createNotification(formId, values),
    onMutate: () => setFailure(undefined),
    onSuccess: onSaved,
    onError: (error) => setFailure(applyApiError(error, form.setError, fieldNames)),
  })

  const valueField = form.register('value', {
    onBlur: (event: React.FocusEvent<HTMLInputElement>) => {
      if (form.getValues('type') !== 'sms') return

      const tidied = tidyPhoneNumber(event.target.value)

      if (tidied !== event.target.value) {
        form.setValue('value', tidied, { shouldValidate: isSubmitted, shouldDirty: true })
      }
    },
  })

  return (
    <form
      id="notification-form"
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
      noValidate
    >
      <fieldset disabled={save.isPending}>
        <FieldGroup className="gap-5">
          {failure && <FormAlert>{failure}</FormAlert>}

          <FieldSet>
            <FieldLegend variant="label">Type</FieldLegend>
            <Controller
              control={form.control}
              name="type"
              render={({ field }) => (
                <RadioGroup
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value)
                    form.clearErrors('value')
                  }}
                  className="grid-cols-2"
                >
                  {notificationTypes.map(({ value, label, icon: Icon }) => (
                    <FieldLabel key={value} htmlFor={`notification-type-${value}`}>
                      <Field orientation="horizontal">
                        <Icon className="size-4 text-muted-foreground" aria-hidden />
                        <FieldContent>{label}</FieldContent>
                        <RadioGroupItem value={value} id={`notification-type-${value}`} />
                      </Field>
                    </FieldLabel>
                  ))}
                </RadioGroup>
              )}
            />
          </FieldSet>

          <Field data-invalid={!!errors.value}>
            <FieldLabel htmlFor="notification-value">
              {isSms ? 'Phone number' : 'Email address'}
            </FieldLabel>
            <Input
              id="notification-value"
              type={isSms ? 'tel' : 'email'}
              inputMode={isSms ? 'tel' : 'email'}
              autoComplete={isSms ? 'tel' : 'email'}
              placeholder={isSms ? '+14155552671' : 'name@example.com'}
              aria-invalid={!!errors.value}
              aria-describedby={isSms ? 'notification-value-help' : undefined}
              autoFocus
              {...valueField}
            />
            {isSms && (
              <FieldDescription id="notification-value-help">
                International format: + then the country code and number, for example +14155552671.
                Spaces, dashes and brackets are removed for you.
              </FieldDescription>
            )}
            <FieldError errors={[errors.value]} />
          </Field>

          {isSms && (
            <Alert role="status">
              <MessageSquareOff aria-hidden />
              <AlertTitle>SMS alerts aren&apos;t sent yet</AlertTitle>
              <AlertDescription>
                SMS recipients are saved, but won&apos;t be alerted until SMS delivery is available.
              </AlertDescription>
            </Alert>
          )}

          <Field orientation="horizontal">
            <Controller
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <Switch
                  id="notification-enabled"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  aria-describedby="notification-enabled-help"
                />
              )}
            />
            <FieldContent>
              <FieldLabel htmlFor="notification-enabled">Enabled</FieldLabel>
              <FieldDescription id="notification-enabled-help">
                Turn off to pause alerts without removing the recipient.
              </FieldDescription>
            </FieldContent>
          </Field>
        </FieldGroup>
      </fieldset>

      <DialogFooter className="mt-6">
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : notification ? 'Save' : 'Add recipient'}
        </Button>
      </DialogFooter>
    </form>
  )
}
