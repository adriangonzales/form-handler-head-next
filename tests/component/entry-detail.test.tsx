import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EntryDetail } from '../../components/entries/entry-detail'
import { TooltipProvider } from '../../components/ui/tooltip'
import type { FormEntry } from '../../types/models'

const created = '2026-10-02T10:00:00.000000Z'
const at = (seconds: number) => Date.parse(created) + seconds * 1000

function entry(overrides: Partial<FormEntry> = {}): FormEntry {
  return {
    id: '01k0000000000000000000000a',
    form_id: '01k0000000000000000000000f',
    input: { message: 'Hello' },
    ip: '203.0.113.7',
    ip_location_display: null,
    referer: 'https://example.com/contact',
    user_agent: 'Mozilla/5.0',
    user_agent_display: { platform: 'macOS', browser: 'Safari', browser_version: '18.0' },
    spam: false,
    spam_score: 0.12,
    spam_reason: null,
    spam_checked_at: '2026-10-02T10:00:05.000000Z',
    starred: false,
    read_at: null,
    created_at: created,
    updated_at: created,
    deleted_at: null,
    ...overrides,
  }
}

const fields = [{ key: 'message', label: 'Message' }]

function renderDetail(value: FormEntry, now = at(10)) {
  return render(
    <TooltipProvider>
      <EntryDetail entry={value} fields={fields} now={now} />
    </TooltipProvider>,
  )
}

describe('EntryDetail', () => {
  it('shows hostile values as text, without links or markup', () => {
    const { container } = renderDetail(
      entry({
        input: { message: '<img src=x onerror=alert(1)>', sneaky: '<script>alert(2)</script>' },
        referer: 'javascript:alert(3)',
        spam_reason: '<b>bold</b>',
      }),
    )

    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeVisible()
    expect(screen.getByText('<script>alert(2)</script>')).toBeVisible()
    expect(screen.getByText('javascript:alert(3)')).toBeVisible()
    expect(container.querySelector('img, script, a, b')).toBeNull()
  })

  it('lists keys that are no longer in the schema under Other fields', () => {
    renderDetail(entry({ input: { message: 'Hi', old_name: 'Kept' } }))

    expect(screen.getByRole('heading', { name: 'Other fields' })).toBeVisible()
    expect(screen.getByText('old_name')).toBeVisible()
    expect(screen.getByText('Kept')).toBeVisible()
  })

  it('shows the spam likelihood as a percentage once checked', () => {
    renderDetail(entry({ spam: true, spam_score: 0.95, spam_reason: 'Classified as spam.' }))

    expect(screen.getByText('95% likely spam')).toBeVisible()
    expect(screen.getByText('Classified as spam.')).toBeVisible()
  })

  it('is checking while young and unchecked, then not checked, with no likelihood', () => {
    const pending = entry({ spam_checked_at: null, spam_score: 0, user_agent_display: null })

    renderDetail(pending, at(30))
    expect(screen.getByText('Checking for spam…')).toBeVisible()
    expect(screen.getByText('Parsing…')).toBeVisible()

    renderDetail(pending, at(600))
    expect(screen.getByText('Not checked for spam')).toBeVisible()
    expect(screen.queryByText(/likely spam/)).toBeNull()
  })
})
