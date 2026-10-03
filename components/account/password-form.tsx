'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { FormAlert } from '@/components/auth/form-alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useHydrated } from '@/hooks/use-hydrated'
import { changePassword } from '@/lib/account/queries'
import { applyApiError } from '@/lib/form-errors'
import { passwordRequirements } from '@/lib/public-env'

const schema = z
  .object({
    current_password: z.string().min(1, 'Enter your current password.'),
    password: z.string().min(1, 'Enter a new password.'),
    password_confirmation: z.string(),
  })
  .refine((data) => data.password === data.password_confirmation, {
    message: "The passwords don't match.",
    path: ['password_confirmation'],
  })
  .refine((data) => data.password === '' || data.password !== data.current_password, {
    message: 'Choose a password different from your current one.',
    path: ['password'],
  })

type Values = z.infer<typeof schema>

const fieldNames = ['current_password', 'password', 'password_confirmation'] as const

const empty: Values = { current_password: '', password: '', password_confirmation: '' }

/** Changes the password. This browser stays signed in; every other one is signed out. */
export function PasswordForm() {
  const hydrated = useHydrated()
  const [failure, setFailure] = useState<string>()
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: empty })
  const { errors } = form.formState

  const save = useMutation({
    mutationFn: changePassword,
    onMutate: () => setFailure(undefined),
    onSuccess: () => {
      // Passwords aren't kept once they've been sent.
      form.reset(empty)
      toast.success('Password changed', {
        description:
          "You're still signed in here. Other browsers and devices have been signed out.",
      })
    },
    onError: (error) => setFailure(applyApiError(error, form.setError, fieldNames)),
  })

  return (
    <form onSubmit={form.handleSubmit((values) => save.mutate(values))} noValidate>
      <fieldset disabled={!hydrated || save.isPending}>
        <FieldGroup>
          {failure && <FormAlert>{failure}</FormAlert>}

          <Field data-invalid={!!errors.current_password}>
            <FieldLabel htmlFor="current-password">Current password</FieldLabel>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.current_password}
              {...form.register('current_password')}
            />
            <FieldError errors={[errors.current_password]} />
          </Field>

          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="new-password">New password</FieldLabel>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              aria-describedby="new-password-requirements"
              {...form.register('password')}
            />
            <FieldDescription id="new-password-requirements">
              {passwordRequirements}
            </FieldDescription>
            <FieldError errors={[errors.password]} />
          </Field>

          <Field data-invalid={!!errors.password_confirmation}>
            <FieldLabel htmlFor="new-password-confirmation">Confirm new password</FieldLabel>
            <Input
              id="new-password-confirmation"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password_confirmation}
              {...form.register('password_confirmation')}
            />
            <FieldError errors={[errors.password_confirmation]} />
          </Field>

          <div>
            <Button type="submit">{save.isPending ? 'Changing…' : 'Change password'}</Button>
          </div>
        </FieldGroup>
      </fieldset>
    </form>
  )
}
