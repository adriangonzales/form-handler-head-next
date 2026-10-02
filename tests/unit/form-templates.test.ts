import { describe, expect, it } from 'vitest'
import { formTemplates, templateSchema } from '../../lib/forms/templates'
import { isUlid } from '../../lib/ulid'

describe('form templates', () => {
  it('starts a blank form without fields', () => {
    expect(templateSchema('blank')).toBeNull()
  })

  it.each(formTemplates.filter(({ id }) => id !== 'blank').map(({ id }) => id))(
    'gives %s fields fresh ULIDs and orders from 1',
    (id) => {
      const first = templateSchema(id)!
      const second = templateSchema(id)!

      expect(first.every((field) => isUlid(field.id))).toBe(true)
      expect(first.map((field) => field.order)).toEqual(first.map((_, index) => index + 1))
      expect(first[0]!.id).not.toBe(second[0]!.id)
    },
  )

  it('uses readable input names', () => {
    expect(templateSchema('contact')!.map((field) => field.name)).toEqual([
      'name',
      'email',
      'message',
    ])
    expect(templateSchema('newsletter')!.map((field) => field.name)).toEqual(['email'])
  })
})
