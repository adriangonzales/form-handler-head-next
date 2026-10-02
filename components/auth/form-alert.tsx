import { CircleAlert, Info } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

/** A notice or failure message above a form. */
export function FormAlert({
  children,
  variant = 'error',
}: {
  children: React.ReactNode
  variant?: 'error' | 'info'
}) {
  const Icon = variant === 'error' ? CircleAlert : Info

  return (
    <Alert
      variant={variant === 'error' ? 'destructive' : 'default'}
      role={variant === 'error' ? 'alert' : 'status'}
    >
      <Icon aria-hidden />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}
