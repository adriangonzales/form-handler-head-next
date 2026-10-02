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
import { safeRedirect } from '@/lib/redirect'
import { FormAlert } from './form-alert'

const schema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
})

type Values = z.infer<typeof schema>

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const hydrated = useHydrated()
  const [failure, setFailure] = useState<string>()
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })
  const { errors, isSubmitting } = form.formState

  async function onSubmit(values: Values) {
    setFailure(undefined)

    try {
      await apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify(values) })
      // A full navigation, so every server-rendered part of the page sees the new session.
      window.location.assign(safeRedirect(next))
    } catch (error) {
      // Wrong credentials (422) and throttling (429) are both reported on `email`.
      setFailure(applyApiError(error, form.setError, ['email', 'password']))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted-foreground">to manage your forms and entries.</p>
      </div>

      {notice && <FormAlert variant="info">{notice}</FormAlert>}
      {failure && <FormAlert>{failure}</FormAlert>}

      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <fieldset disabled={!hydrated || isSubmitting}>
          <FieldGroup>
            <Field data-invalid={!!errors.email}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                autoFocus
                aria-invalid={!!errors.email}
                {...form.register('email')}
              />
              <FieldError errors={[errors.email]} />
            </Field>

            <Field data-invalid={!!errors.password}>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                {...form.register('password')}
              />
              <FieldError errors={[errors.password]} />
            </Field>

            <Button type="submit" className="w-full">
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </FieldGroup>
        </fieldset>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Accounts are created by an administrator. Ask them if you need one.
      </p>
    </div>
  )
}
