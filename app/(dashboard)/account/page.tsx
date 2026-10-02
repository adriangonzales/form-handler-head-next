import type { Metadata } from 'next'
import { PageHeader } from '@/components/layout/page-header'
import { backendClient } from '@/lib/backend/client'
import { backendErrorFrom } from '@/lib/backend/errors'
import { renderCall } from '@/lib/backend/render'

export const metadata: Metadata = { title: 'Account' }

// Placeholder: profile, password and deletion arrive in milestone 8. It loads the user from The
// Backend while rendering, so it also shows that proxy.ts refreshed the token before the render.
export default async function AccountPage() {
  const { data, error, response } = await renderCall((options) =>
    backendClient(options).GET('/v1/auth/me'),
  )

  if (!data) throw backendErrorFrom(response, error)

  return (
    <>
      <PageHeader title="Account" description="Changing your profile and password arrives later." />
      <dl className="grid max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Name</dt>
        <dd>{data.data.name}</dd>
        <dt className="text-muted-foreground">Email</dt>
        <dd>{data.data.email}</dd>
      </dl>
    </>
  )
}
