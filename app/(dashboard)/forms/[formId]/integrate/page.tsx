import { IntegratePanel } from '@/components/forms/integrate-panel'

export default async function IntegratePage({ params }: PageProps<'/forms/[formId]/integrate'>) {
  return <IntegratePanel formId={(await params).formId} />
}
