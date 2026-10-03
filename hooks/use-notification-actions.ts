'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { isNotificationType } from '@/lib/notifications/notifications'
import {
  deleteNotification,
  patchCachedNotification,
  restoreNotification,
  updateNotification,
} from '@/lib/notifications/queries'
import { queryKeys } from '@/lib/query-keys'
import { toastError } from '@/lib/toast-error'
import type { FormNotification } from '@/types/models'

/** Identifies Enabled-switch updates, so the list can tell which rows are still saving. */
export const setEnabledKey = ['notifications', 'set-enabled'] as const

/**
 * Recipient actions for the Notifications tab: the Enabled switch (optimistic) and Remove with
 * Undo. Each shows a toast on failure and refreshes the form's recipient pages.
 */
export function useNotificationActions(formId: string) {
  const queryClient = useQueryClient()
  const listsKey = queryKeys.notifications.lists(formId)
  const refreshLists = () => queryClient.invalidateQueries({ queryKey: listsKey })

  /**
   * Turns a recipient's alerts on or off. The switch follows the click straight away and goes back
   * if The Backend refuses. The update needs the type and value too, so they're sent unchanged.
   */
  const setEnabled = useMutation({
    mutationKey: setEnabledKey,
    mutationFn: ({ notification, enabled }: { notification: FormNotification; enabled: boolean }) =>
      updateNotification(notification.id, {
        type: isNotificationType(notification.type) ? notification.type : 'email',
        value: notification.value,
        enabled,
      }),
    onMutate: async ({ notification, enabled }) => {
      await queryClient.cancelQueries({ queryKey: listsKey })
      patchCachedNotification(queryClient, { ...notification, enabled })
    },
    onError: (error, { notification }) => {
      patchCachedNotification(queryClient, notification)
      toastError(error)
    },
    onSuccess: (updated) => patchCachedNotification(queryClient, updated),
    onSettled: refreshLists,
  })

  /**
   * Removes a recipient and offers Undo. Resolves once it's removed; rejects (after an error toast)
   * if it couldn't be. `onRemoved` runs before the lists refresh, so the caller can step back from a
   * page that would be left empty.
   */
  async function remove(
    notification: Pick<FormNotification, 'id' | 'value'>,
    onRemoved?: () => void,
  ): Promise<void> {
    try {
      await deleteNotification(notification.id)
    } catch (error) {
      toastError(error)
      throw error
    }

    onRemoved?.()
    void refreshLists()

    toast(`Removed ${notification.value}`, {
      action: {
        label: 'Undo',
        onClick: () => {
          restoreNotification(notification.id)
            .then(() => {
              void refreshLists()
              toast.success(`Restored ${notification.value}`)
            })
            .catch(toastError)
        },
      },
    })
  }

  return { setEnabled, remove }
}
