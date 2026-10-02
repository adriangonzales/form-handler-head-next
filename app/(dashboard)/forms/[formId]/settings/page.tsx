import { FormSettings } from '@/components/forms/form-settings'

export default async function SettingsPage({ params }: PageProps<'/forms/[formId]/settings'>) {
  return <FormSettings formId={(await params).formId} />
}
