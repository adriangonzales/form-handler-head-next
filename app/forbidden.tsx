import { StatusPage } from '@/components/shared/status-page'

/** forbidden() from a Server Component: The Backend answered 403. */
export default function Forbidden() {
  return (
    <StatusPage title="You don't have access to this">
      It belongs to another account. Check that you&apos;re signed in as the right person.
    </StatusPage>
  )
}
