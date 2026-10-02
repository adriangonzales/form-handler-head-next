'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { deleteForm, duplicateForm, restoreForm, updateForm } from '@/lib/forms/queries'
import { queryKeys } from '@/lib/query-keys'
import { toastError } from '@/lib/toast-error'
import type { Form } from '@/types/models'

type FormRef = Pick<Form, 'id' | 'name'>

/**
 * Form-level actions shared by the forms list, the form header and the Settings tab: activate or
 * deactivate, duplicate, and delete with Undo. Each shows a toast and refreshes the lists.
 */
export function useFormActions() {
  const queryClient = useQueryClient()
  const router = useRouter()

  const refreshLists = () => queryClient.invalidateQueries({ queryKey: queryKeys.forms.lists() })

  /**
   * Turns a form on or off. The form's cached copy changes straight away, so switches follow the
   * click, and goes back if The Backend refuses.
   */
  const setActive = useMutation({
    mutationFn: ({ form, active }: { form: FormRef; active: boolean }) =>
      updateForm(form.id, { name: form.name, active }),
    onMutate: async ({ form, active }) => {
      const key = queryKeys.forms.detail(form.id)

      await queryClient.cancelQueries({ queryKey: key })

      const previous = queryClient.getQueryData<Form>(key)

      if (previous) queryClient.setQueryData<Form>(key, { ...previous, active })

      return { previous }
    },
    onError: (error, { form }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.forms.detail(form.id), context.previous)
      }
      toastError(error)
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.forms.detail(updated.id), updated)
      toast.success(
        updated.active
          ? `“${updated.name}” is accepting submissions`
          : `“${updated.name}” is not accepting submissions`,
      )
    },
    onSettled: refreshLists,
  })

  const duplicate = useMutation({
    mutationFn: (form: FormRef) => duplicateForm(form.id),
    onError: toastError,
    onSuccess: (copy) => {
      queryClient.setQueryData(queryKeys.forms.detail(copy.id), copy)
      void refreshLists()
      toast.success(`Created “${copy.name}”`, {
        description: "The copy is inactive and doesn't include entries or recipients.",
      })
      router.push(`/forms/${copy.id}/settings` as Route)
    },
  })

  /**
   * Deletes a form and offers Undo, which restores it with its entries and recipients. Resolves
   * once the form is deleted; rejects (after an error toast) if it couldn't be.
   */
  async function remove(form: FormRef): Promise<void> {
    try {
      await deleteForm(form.id)
    } catch (error) {
      toastError(error)
      throw error
    }

    queryClient.removeQueries({ queryKey: queryKeys.forms.detail(form.id) })
    void refreshLists()

    toast(`Deleted “${form.name}”`, {
      description: 'Its entries and notification recipients are kept, and come back if you undo.',
      action: {
        label: 'Undo',
        onClick: () => {
          restoreForm(form.id)
            .then((restored) => {
              queryClient.setQueryData(queryKeys.forms.detail(restored.id), restored)
              void refreshLists()
              toast.success(`Restored “${restored.name}”`)
            })
            .catch(toastError)
        },
      },
    })
  }

  return { setActive, duplicate, remove }
}
