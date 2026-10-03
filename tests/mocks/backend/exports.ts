import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { ulid } from '../../../lib/ulid'
import type { FormEntry, FormEntryExport } from '../../../types/models'
import { queryEntries } from './entries'
import type { MockForm } from './forms'

// Entry exports in the mock backend: a lifecycle that advances with time, the CSV as the reference
// Backend's WriteEntriesCsv writes it, and signed download links.

type Errors = Record<string, string[]>

/** A stored export, with the file once it's written. */
export interface MockExport extends Omit<FormEntryExport, 'download_url'> {
  csv: string | null
}

export const exportRetentionMs = 24 * 3600 * 1000
export const downloadUrlTtlSeconds = 5 * 60

/** How long an export stays `pending`, then `processing`, before it's written. */
export const exportSteps = { pendingMs: 400, processingMs: 400 }

/** The parameters an export is created with: the entries list's `filter` and `sort`, if given. */
export function exportParameters(body: Record<string, unknown>): MockExport['parameters'] {
  const parameters: MockExport['parameters'] = {}

  if (typeof body.sort === 'string') parameters.sort = body.sort

  if (typeof body.filter === 'object' && body.filter !== null) {
    parameters.filter = Object.fromEntries(
      Object.entries(body.filter).map(([name, value]) => [name, String(value)]),
    )
  }

  return parameters
}

/** The parameters as the entries list's query, for filtering and validation. */
export function parametersQuery(parameters: MockExport['parameters']): URLSearchParams {
  const params = new URLSearchParams()

  if (parameters.sort !== undefined) params.set('sort', parameters.sort)

  for (const [name, value] of Object.entries(parameters.filter ?? {})) {
    params.set(`filter[${name}]`, value)
  }

  return params
}

/** Unknown filter keys are rejected, as on the entries list. */
export function validateExportParameters(parameters: MockExport['parameters']): Errors {
  const errors: Errors = {}
  const known = ['read', 'starred', 'spam', 'created_from', 'created_to', 'trashed']

  for (const name of Object.keys(parameters.filter ?? {})) {
    if (!known.includes(name)) errors.filter = ['The filter field must be an array.']
  }

  const result = queryEntries([], parametersQuery(parameters))

  return Array.isArray(result) ? errors : { ...errors, ...result }
}

export function newExport(
  form: MockForm,
  parameters: MockExport['parameters'],
  at: (ms?: number) => string,
  now: number,
): MockExport {
  return {
    id: ulid(),
    form_id: form.id,
    status: 'pending',
    parameters,
    filename: `${slug(form.name) || 'form'}-entries-${new Date(now).toISOString().slice(0, 10)}.csv`,
    row_count: null,
    error: null,
    completed_at: null,
    expires_at: at(now + exportRetentionMs),
    created_at: at(now),
    updated_at: at(now),
    csv: null,
  }
}

/**
 * Moves an export along its lifecycle to where it would be by `now`: `pending`, `processing`, then
 * `completed` with its file, or `failed` when its form was deleted before it ran.
 */
export function advanceExport(
  entryExport: MockExport,
  form: MockForm | undefined,
  entries: () => FormEntry[],
  at: (ms?: number) => string,
  now: number,
) {
  if (entryExport.status !== 'pending' && entryExport.status !== 'processing') return

  const created = Date.parse(entryExport.created_at!)
  const processingAt = created + exportSteps.pendingMs
  const doneAt = processingAt + exportSteps.processingMs

  if (now < processingAt) return

  if (!form || form.deleted_at !== null) {
    Object.assign(entryExport, {
      status: 'failed',
      error: 'The form was deleted.',
      updated_at: at(processingAt),
    })

    return
  }

  if (now < doneAt) {
    Object.assign(entryExport, { status: 'processing', updated_at: at(processingAt) })

    return
  }

  const matching = queryEntries(entries(), parametersQuery(entryExport.parameters))
  const rows = Array.isArray(matching) ? matching : []

  Object.assign(entryExport, {
    status: 'completed',
    csv: entriesCsv(form, rows),
    row_count: rows.length,
    completed_at: at(doneAt),
    updated_at: at(doneAt),
  })
}

/** The resource, with a fresh signed download link once completed. */
export function exportResource(
  entryExport: MockExport,
  links: { apiUrl: string; secret: Buffer; now: number },
): FormEntryExport {
  const { csv, ...resource } = entryExport
  const path = `/api/v1/entry-exports/${entryExport.id}/download`
  let downloadUrl: string | null = null

  if (entryExport.status === 'completed') {
    const expires = Math.floor(links.now / 1000) + downloadUrlTtlSeconds
    const url = new URL(path, links.apiUrl)

    url.searchParams.set('expires', String(expires))
    url.searchParams.set('signature', sign(links.secret, path, expires))
    downloadUrl = url.toString()
  }

  return { ...resource, download_url: downloadUrl }
}

/**
 * Whether a download link's signature is valid and unexpired: an HMAC of the path and expiry time,
 * leaving out the host, as the reference Backend signs them.
 */
export function validSignature(secret: Buffer, url: URL, now: number): boolean {
  const expires = Number(url.searchParams.get('expires'))
  const signature = url.searchParams.get('signature') ?? ''
  const expected = sign(secret, url.pathname, expires)

  return (
    Number.isInteger(expires) &&
    expires * 1000 > now &&
    signature.length === expected.length &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
}

export function signingSecret(): Buffer {
  return randomBytes(32)
}

function sign(secret: Buffer, path: string, expires: number) {
  return createHmac('sha256', secret).update(`${path}?expires=${expires}`).digest('hex')
}

/**
 * The CSV as the reference Backend writes it: id and created_at, a column per schema field in
 * order (headed by its label), a column per stored input key the schema no longer has (headed by
 * the key, sorted), then submission metadata. Cells that start like a formula are prefixed with `'`.
 */
export function entriesCsv(form: MockForm, entries: readonly FormEntry[]): string {
  const fields = new Map<string, string>()

  for (const field of [...(form.schema ?? [])].sort((a, b) => a.order - b.order)) {
    const key = field.name ?? field.id

    fields.set(key, field.label ?? key)
  }

  const storedKeys = new Set<string>()

  for (const entry of entries) {
    for (const key of Object.keys(entry.input ?? {})) storedKeys.add(key)
  }

  for (const key of [...storedKeys].sort()) if (!fields.has(key)) fields.set(key, key)

  const lines = [
    [
      'id',
      'created_at',
      ...fields.values(),
      'read_at',
      'starred',
      'spam',
      'spam_score',
      'spam_reason',
      'spam_checked_at',
      'ip',
      'referer',
      'user_agent',
      'deleted_at',
    ],
    ...entries.map((entry) => {
      const input = (entry.input ?? {}) as Record<string, unknown>

      return [
        entry.id,
        csvDate(entry.created_at),
        ...[...fields.keys()].map((key) => csvValue(input[key])),
        csvDate(entry.read_at),
        csvValue(entry.starred),
        csvValue(entry.spam),
        entry.spam_score === null ? '' : String(entry.spam_score),
        csvValue(entry.spam_reason),
        csvDate(entry.spam_checked_at),
        csvValue(entry.ip),
        csvValue(entry.referer),
        csvValue(entry.user_agent),
        csvDate(entry.deleted_at),
      ]
    }),
  ]

  return lines.map((cells) => cells.map(csvCell).join(',') + '\n').join('')
}

function csvValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'

  if (Array.isArray(value)) {
    return value.every((item) => ['string', 'number', 'boolean'].includes(typeof item))
      ? value.join(', ')
      : JSON.stringify(value)
  }

  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

/** ISO 8601 in UTC without fractions, as Carbon's `toIso8601ZuluString`. */
function csvDate(value: string | null | undefined): string {
  return value ? new Date(value).toISOString().replace(/\.\d{3}Z$/, 'Z') : ''
}

/**
 * Formula protection, then the reference Backend's CSV quoting, which also quotes cells with spaces
 * or tabs.
 */
function csvCell(value: string): string {
  const safe =
    value !== '' && ['=', '+', '-', '@', '\t', '\r'].includes(value[0]!) ? `'${value}` : value

  return /[,"\n\r\t ]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

/** Lowercase ASCII words joined by hyphens, as the reference Backend names export files. */
function slug(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
