'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { FormAlert } from '@/components/auth/form-alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useHydrated } from '@/hooks/use-hydrated'
import { updateProfile } from '@/lib/account/queries'
import { applyApiError } from '@/lib/form-errors'
import type { User } from '@/types/models'

// The Backend's limits, so most mistakes show before anything is sent.
const schema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(255, 'Use at most 255 characters.'),
  email: z
    .string()
    .trim()
    .pipe(z.email('Enter a valid email address.').max(255, 'Use at most 255 characters.')),
})

type Values = z.infer<typeof schema>

const fieldNames = ['name', 'email'] as const

const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Name and email. Saving refreshes the page, so the dashboard's header shows the new name. */
export function ProfileForm({ user }: { user: User }) {
  const hydrated = useHydrated()
  const router = useRouter()
  const [saved, setSaved] = useState({ name: user.name, email: user.email })
  const [failure, setFailure] = useState<string>()
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: saved })
  const { errors } = form.formState
  const [name, email] = useWatch({ control: form.control, name: ['name', 'email'] })
  const emailChanged = !sameEmail(email, saved.email)
  const changed = name.trim() !== saved.name || emailChanged

  const save = useMutation({
    mutationFn: (values: Values) =>
      // Only what changed: an unchanged email would still be checked for uniqueness.
      updateProfile({
        ...(values.name !== saved.name ? { name: values.name } : {}),
        ...(emailChanged ? { email: values.email } : {}),
      }),
    onMutate: () => setFailure(undefined),
    onSuccess: (updated) => {
      const next = { name: updated.name, email: updated.email }

      setSaved(next)
      form.reset(next)
      toast.success('Profile saved')
      router.refresh()
    },
    onError: (error) => setFailure(applyApiError(error, form.setError, fieldNames)),
  })

  return (
    <form onSubmit={form.handleSubmit((values) => save.mutate(values))} noValidate>
      <fieldset disabled={!hydrated || save.isPending}>
        <FieldGroup>
          {failure && <FormAlert>{failure}</FormAlert>}

          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="profile-name">Name</FieldLabel>
            <Input
              id="profile-name"
              autoComplete="name"
              aria-invalid={!!errors.name}
              {...form.register('name')}
            />
            <FieldError errors={[errors.name]} />
          </Field>

          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="profile-email">Email</FieldLabel>
            <Input
              id="profile-email"
              type="email"
              autoComplete="email"
              aria-invalid={!!errors.email}
              aria-describedby="profile-email-help"
              {...form.register('email')}
            />
            <FieldDescription id="profile-email-help">
              You sign in with this address, and password reset emails go to it.
            </FieldDescription>
            <FieldError errors={[errors.email]} />
          </Field>

          {emailChanged && email.trim() !== '' && (
            <FormAlert variant="info">
              The change is immediate: once you save, sign in with the new address.
            </FormAlert>
          )}

          <div>
            <Button type="submit" disabled={!changed}>
              {save.isPending ? 'Saving…' : 'Save profile'}
            </Button>
          </div>
        </FieldGroup>
      </fieldset>
    </form>
  )
}
