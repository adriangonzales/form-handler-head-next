import { describe, expect, it } from 'vitest'
import { isUlid } from '../../lib/ulid'
import {
  draftsToSchema,
  newFieldDraft,
  parseRules,
  schemaToDrafts,
  serializeRules,
  slugifyInputName,
  validateDrafts,
} from '../../lib/schema/builder'

describe('parseRules / serializeRules', () => {
  it('reads presets from an array and keeps unknown rules unchanged', () => {
    const state = parseRules(['required', 'email', 'max:255', 'regex:/^a,b$/', 'in:a,b'])

    expect(state).toMatchObject({
      required: true,
      email: true,
      max: '255',
      oneOf: ['a', 'b'],
      custom: ['regex:/^a,b$/'],
    })
    expect(serializeRules(state)).toEqual([
      'required',
      'email',
      'max:255',
      'in:a,b',
      'regex:/^a,b$/',
    ])
  })

  it('splits string rules on commas, as the API does', () => {
    expect(serializeRules(parseRules('required, numeric,min:2'))).toEqual([
      'required',
      'numeric',
      'min:2',
    ])
  })
})

const nameId = '01k6b8x9qm2v7c4d5e6f7g8h9j'
const emailId = '01k6b8x9qm2v7c4d5e6f7g8h9k'
const topicId = '01k6b8x9qm2v7c4d5e6f7g8h9m'

describe('schema round trip', () => {
  it('keeps IDs, labels, input names and rules, numbering `order` from 1', () => {
    const schema = [
      {
        id: nameId,
        order: 1,
        label: 'Full name',
        name: 'full_name',
        rules: ['required', 'max:255'],
      },
      { id: emailId, order: 2, label: 'Email', name: 'contact_email', rules: 'required,email' },
      { id: topicId, order: 5, name: 'topic', rules: ['in:sales,support', 'nullable'] },
    ]

    expect(draftsToSchema(schemaToDrafts(schema))).toEqual([
      {
        id: nameId,
        order: 1,
        label: 'Full name',
        name: 'full_name',
        rules: ['required', 'max:255'],
      },
      {
        id: emailId,
        order: 2,
        label: 'Email',
        name: 'contact_email',
        rules: ['required', 'email'],
      },
      { id: topicId, order: 3, name: 'topic', rules: ['in:sales,support', 'nullable'] },
    ])
  })

  it('reads fields sorted by `order`, not list position', () => {
    const drafts = schemaToDrafts([
      { id: topicId, order: 30 },
      { id: nameId, order: 10 },
      { id: emailId, order: 20 },
    ])

    expect(drafts.map((draft) => draft.id)).toEqual([nameId, emailId, topicId])
  })

  it('keeps a field without a name submitting under its ID', () => {
    const [draft] = schemaToDrafts([{ id: nameId, order: 1, label: 'Name' }])

    expect(draft!.name).toBe(nameId)
    expect(draftsToSchema([draft!])).toEqual([{ id: nameId, order: 1, label: 'Name' }])
  })

  it('reads an empty or null schema as no fields', () => {
    expect(schemaToDrafts([])).toEqual([])
    expect(schemaToDrafts(null)).toEqual([])
    expect(draftsToSchema([])).toEqual([])
  })
})

describe('newFieldDraft', () => {
  it('starts with a fresh ULID and no input name', () => {
    const first = newFieldDraft()
    const second = newFieldDraft()

    expect(isUlid(first.id)).toBe(true)
    expect(first.id).not.toBe(second.id)
    expect(first).toMatchObject({ label: '', name: '', nameEdited: false, required: false })
  })
})

describe('slugifyInputName', () => {
  it.each([
    ['Email address', 'email_address'],
    ['  Café & crème ', 'cafe_creme'],
    ['2nd phone', 'field_2nd_phone'],
    ['!!!', ''],
  ])('%j → %j', (label, slug) => expect(slugifyInputName(label)).toBe(slug))
})

describe('validateDrafts', () => {
  function draft(name: string, overrides: Partial<ReturnType<typeof newFieldDraft>> = {}) {
    return { ...newFieldDraft(), name, ...overrides }
  }

  it('accepts valid rows, including a legacy ULID input name', () => {
    expect(validateDrafts([draft('email'), draft('phone'), draft(nameId, { id: nameId })])).toEqual(
      {},
    )
  })

  it('requires input names that start with a letter and are unique', () => {
    const missing = draft('')
    const numeric = draft('2')
    const first = draft('email')
    const duplicate = draft('email')
    const errors = validateDrafts([missing, numeric, first, duplicate])

    expect(errors[missing.key]?.name).toBe('Give the field an input name.')
    expect(errors[numeric.key]?.name).toMatch(/Start with a letter/)
    expect(errors[duplicate.key]?.name).toBe('Another field already uses this input name.')
  })

  it('requires whole numbers for min and max', () => {
    const row = draft('age', { min: '1.5', max: 'ten' })

    expect(validateDrafts([row])[row.key]).toEqual({
      min: 'Use a whole number.',
      max: 'Use a whole number.',
    })
  })
})
