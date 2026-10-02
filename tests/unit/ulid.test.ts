import { describe, expect, it } from 'vitest'
import { isUlid, ulid } from '../../lib/ulid'

describe('ulid', () => {
  it('generates valid, unique ULIDs', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => ulid()))

    expect(ids.size).toBe(1000)
    expect([...ids].every(isUlid)).toBe(true)
  })

  it('starts with the timestamp, so IDs sort by creation time', () => {
    expect(ulid(0).slice(0, 10)).toBe('0000000000')
    expect(ulid(1_469_918_176_385).slice(0, 10)).toBe('01aryz6s41')
    expect(ulid(2000) > ulid(1000)).toBe(true)
  })

  it('recognises ULIDs in either case', () => {
    expect(isUlid('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(true)
    expect(isUlid('01arz3ndektsv4rrffq69g5fav')).toBe(true)
    expect(isUlid('email')).toBe(false)
    expect(isUlid('81ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(false)
  })
})
