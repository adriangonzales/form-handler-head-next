import type { Metadata } from 'next'
import Link from 'next/link'
import { FormAlert } from '@/components/auth/form-alert'
import { ResetPasswordForm } from '@/components/auth/reset-password-form'

export const metadata: Metadata = { title: 'Choose a new password' }

/** The page The Backend's reset email links to, with `?token=…&email=…`. */
export default async function ResetPasswordPage({ searchParams }: PageProps<'/reset-password'>) {
  const { token, email } = await searchParams

  if (typeof token !== 'string' || !token || typeof email !== 'string' || !email) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-semibold">Choose a new password</h1>
        <FormAlert>This reset link is incomplete.</FormAlert>
        <Link href="/forgot-password" className="text-center text-sm text-primary hover:underline">
          Request a new link
        </Link>
      </div>
    )
  }

  return <ResetPasswordForm token={token} email={email} />
}
