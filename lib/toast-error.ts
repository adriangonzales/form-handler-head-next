import { toast } from 'sonner'
import { ApiError } from './api-client'

/** Shows a failed request as an error toast with The Backend's message. */
export function toastError(error: unknown) {
  toast.error(error instanceof ApiError ? error.message : 'Something went wrong. Please try again.')
}
