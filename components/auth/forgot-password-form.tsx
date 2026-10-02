'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useHydrated } from '@/hooks/use-hydrated'
import { apiRequest } from '@/lib/api-client'
import { applyApiError } from '@/lib/form-errors'
import { FormAlert } from './form-alert'

const schema = z.object({ email: z.email('Enter a valid email address.') })

type Values = z.infer<typeof schema>

/**
 * Asks for a reset link. The Backend answers the same whether or not the account exists, and this
 * page only ever shows that answer.
 */
export function ForgotPasswordForm() {
  const hydrated = useHydrated()
  const [sent, setSent] = useState<string>()
  const [failure, setFailure] = useState<string>()
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '' } })
  const { errors, isSubmitting } = form.formState

  async function onSubmit(values: Values) {
    setFailure(undefined)

    try {
      const { message } = await apiRequest<{ message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify(values),
      })

      setSent(message)
    } catch (error) {
      setFailure(applyApiError(error, form.setError, ['email']))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Reset your password</h1>
        <p className="text-sm text-muted-foreground">
          We&apos;ll email you a link to choose a new one.
        </p>
      </div>

      {sent ? (
        <FormAlert variant="info">{sent}</FormAlert>
      ) : (
        <>
          {failure && <FormAlert>{failure}</FormAlert>}
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <fieldset disabled={!hydrated || isSubmitting}>
              <FieldGroup>
                <Field data-invalid={!!errors.email}>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    aria-invalid={!!errors.email}
                    {...form.register('email')}
                  />
                  <FieldError errors={[errors.email]} />
                </Field>
                <Button type="submit" className="w-full">
                  {isSubmitting ? 'Sending…' : 'Send reset link'}
                </Button>
              </FieldGroup>
            </fieldset>
          </form>
        </>
      )}

      <Link href="/login" className="text-center text-sm text-primary hover:underline">
        Back to sign in
      </Link>
    </div>
  )
}
