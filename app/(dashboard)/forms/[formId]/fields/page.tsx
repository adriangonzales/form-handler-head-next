import { SchemaBuilder } from '@/components/forms/schema-builder'

export default async function FieldsPage({ params }: PageProps<'/forms/[formId]/fields'>) {
  return <SchemaBuilder formId={(await params).formId} />
}
