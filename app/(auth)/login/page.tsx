import type { Metadata } from 'next'
import { LoginForm } from '@/components/auth/login-form'
import { signedOutReasons } from '@/lib/redirect'

export const metadata: Metadata = { title: 'Sign in' }

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { reason, next } = await searchParams
  const notice =
    typeof reason === 'string' && reason in signedOutReasons
      ? signedOutReasons[reason as keyof typeof signedOutReasons]
      : undefined

  return <LoginForm next={typeof next === 'string' ? next : undefined} notice={notice} />
}
