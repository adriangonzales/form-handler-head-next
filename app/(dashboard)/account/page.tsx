import type { Metadata } from 'next'
import { DeleteAccountDialog } from '@/components/account/delete-account-dialog'
import { PasswordForm } from '@/components/account/password-form'
import { ProfileForm } from '@/components/account/profile-form'
import { PageHeader } from '@/components/layout/page-header'
import { backendClient } from '@/lib/backend/client'
import { backendErrorFrom } from '@/lib/backend/errors'
import { renderCall } from '@/lib/backend/render'

export const metadata: Metadata = { title: 'Account' }

/** Profile, password, and deleting the account. The user is loaded fresh from The Backend. */
export default async function AccountPage() {
  const { data, error, response } = await renderCall((options) =>
    backendClient(options).GET('/v1/auth/me'),
  )

  if (!data) throw backendErrorFrom(response, error)

  const user = data.data

  return (
    <>
      <PageHeader title="Account" />
      <div className="flex max-w-2xl flex-col gap-12">
        <section aria-labelledby="profile-heading" className="flex flex-col gap-4">
          <h2 id="profile-heading" className="text-base font-semibold">
            Profile
          </h2>
          <ProfileForm user={user} />
        </section>

        <section aria-labelledby="password-heading" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="password-heading" className="text-base font-semibold">
              Change password
            </h2>
            <p className="text-sm text-muted-foreground">
              You stay signed in here. Every other browser and device is signed out.
            </p>
          </div>
          <PasswordForm />
        </section>

        <section
          aria-labelledby="delete-account-heading"
          className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 p-4"
        >
          <h2 id="delete-account-heading" className="font-semibold text-destructive">
            Delete account
          </h2>
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>Deleting your account permanently removes:</p>
            <ul className="list-disc space-y-1 ps-5">
              <li>all your forms, including ones you&apos;ve deleted;</li>
              <li>every entry submitted to them;</li>
              <li>their notification recipients;</li>
              <li>your exports.</li>
            </ul>
            <p className="font-medium text-foreground">This can&apos;t be undone.</p>
          </div>
          <DeleteAccountDialog email={user.email} />
        </section>
      </div>
    </>
  )
}
