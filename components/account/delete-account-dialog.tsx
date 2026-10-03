'use client'

import { useMutation } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useHydrated } from '@/hooks/use-hydrated'
import { deleteAccount } from '@/lib/account/queries'
import { ApiError } from '@/lib/api-client'
import { loginUrl } from '@/lib/redirect'

/** The danger zone's button, and the dialog that asks for the password and the typed email. */
export function DeleteAccountDialog({ email }: { email: string }) {
  const hydrated = useHydrated()
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" disabled={!hydrated}>
          <Trash2 aria-hidden />
          Delete account…
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>
            This permanently deletes your account, every form (including deleted ones), their
            entries, notification recipients and exports. It can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so the password is gone once the dialog closes. */}
        {open && <DeleteAccountFields email={email} />}
      </DialogContent>
    </Dialog>
  )
}

function DeleteAccountFields({ email }: { email: string }) {
  const [password, setPassword] = useState('')
  const [typedEmail, setTypedEmail] = useState('')
  const [passwordError, setPasswordError] = useState<string>()
  const [failure, setFailure] = useState<string>()
  const confirmed = password !== '' && typedEmail.trim().toLowerCase() === email.toLowerCase()

  const remove = useMutation({
    mutationFn: deleteAccount,
    onMutate: () => {
      setPasswordError(undefined)
      setFailure(undefined)
    },
    onSuccess: () => {
      setPassword('')
      // A full load, so nothing from the deleted account stays in memory (caches, the exports
      // poller), and Back doesn't return to this page.
      window.location.replace(loginUrl({ reason: 'deleted' }))
    },
    onError: (error) => {
      const message = error instanceof ApiError ? error.errors.password?.[0] : undefined

      if (message) setPasswordError(message)
      else setFailure(error instanceof ApiError ? error.message : 'Something went wrong.')
    },
  })

  // Stays disabled once the deletion succeeded, while the login page loads.
  const busy = remove.isPending || remove.isSuccess

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (confirmed) remove.mutate(password)
      }}
      noValidate
    >
      <fieldset disabled={busy}>
        <FieldGroup className="gap-5">
          {failure && <FormAlert>{failure}</FormAlert>}

          <Field data-invalid={!!passwordError}>
            <FieldLabel htmlFor="delete-account-password">Password</FieldLabel>
            <Input
              id="delete-account-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                setPasswordError(undefined)
              }}
              aria-invalid={!!passwordError}
            />
            <FieldError>{passwordError}</FieldError>
          </Field>

          <Field>
            <FieldLabel htmlFor="delete-account-email">
              <span>
                Type <span className="font-mono font-semibold">{email}</span> to confirm
              </span>
            </FieldLabel>
            <Input
              id="delete-account-email"
              type="email"
              autoComplete="off"
              spellCheck={false}
              value={typedEmail}
              onChange={(event) => setTypedEmail(event.target.value)}
            />
          </Field>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={!confirmed}>
              {busy ? 'Deleting…' : 'Delete account'}
            </Button>
          </DialogFooter>
        </FieldGroup>
      </fieldset>
    </form>
  )
}
