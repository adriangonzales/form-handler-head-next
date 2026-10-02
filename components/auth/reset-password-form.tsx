'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useHydrated } from '@/hooks/use-hydrated'
import { ApiError, apiRequest } from '@/lib/api-client'
import { applyApiError } from '@/lib/form-errors'
import { passwordRequirements } from '@/lib/public-env'
import { loginUrl } from '@/lib/redirect'
import { FormAlert } from './form-alert'

const schema = z
  .object({
    password: z.string().min(1, 'Enter a new password.'),
    password_confirmation: z.string(),
  })
  .refine((data) => data.password === data.password_confirmation, {
    message: "The passwords don't match.",
    path: ['password_confirmation'],
  })

type Values = z.infer<typeof schema>

export function ResetPasswordForm({ token, email }: { token: string; email: string }) {
  const router = useRouter()
  const hydrated = useHydrated()
  const [failure, setFailure] = useState<string>()
  const [linkInvalid, setLinkInvalid] = useState(false)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', password_confirmation: '' },
  })
  const { errors, isSubmitting } = form.formState

  async function onSubmit(values: Values) {
    setFailure(undefined)
    setLinkInvalid(false)

    try {
      await apiRequest('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ ...values, token, email }),
      })
      router.push(loginUrl({ reason: 'password-reset' }))
    } catch (error) {
      // An invalid or expired token is reported on `email`, which this form doesn't show.
      const tokenError = error instanceof ApiError ? error.errors.email?.[0] : undefined

      setLinkInvalid(Boolean(tokenError))
      setFailure(
        tokenError ?? applyApiError(error, form.setError, ['password', 'password_confirmation']),
      )
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Choose a new password</h1>
        <p className="text-sm text-muted-foreground">for {email}</p>
      </div>

      {failure && (
        <FormAlert>
          {failure}{' '}
          {linkInvalid && (
            <Link href="/forgot-password" className="font-medium underline">
              Request a new link
            </Link>
          )}
        </FormAlert>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <fieldset disabled={!hydrated || isSubmitting}>
          <FieldGroup>
            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="password">New password</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                autoFocus
                aria-invalid={!!errors.password}
                aria-describedby="password-requirements"
                {...form.register('password')}
              />
              <FieldDescription id="password-requirements">{passwordRequirements}</FieldDescription>
              <FieldError errors={[errors.password]} />
            </Field>
            <Field data-invalid={!!errors.password_confirmation}>
              <FieldLabel htmlFor="password_confirmation">Confirm new password</FieldLabel>
              <Input
                id="password_confirmation"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.password_confirmation}
                {...form.register('password_confirmation')}
              />
              <FieldError errors={[errors.password_confirmation]} />
            </Field>
            <Button type="submit" className="w-full">
              {isSubmitting ? 'Saving…' : 'Reset password'}
            </Button>
          </FieldGroup>
        </fieldset>
      </form>
    </div>
  )
}
