// Crockford base32, lowercase like the ULIDs The Backend generates for forms and entries.
const alphabet = '0123456789abcdefghjkmnpqrstvwxyz'

export const ulidPattern = /^[0-7][0-9abcdefghjkmnpqrstvwxyz]{25}$/i

/** A ULID: 48-bit millisecond timestamp, then 80 random bits, as 26 base32 characters. */
export function ulid(now = Date.now()): string {
  let time = ''
  let remaining = now

  for (let index = 0; index < 10; index += 1) {
    time = alphabet[remaining % 32] + time
    remaining = Math.floor(remaining / 32)
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let random = ''

  for (const byte of bytes) random += alphabet[byte % 32]

  return time + random
}

export function isUlid(value: string): boolean {
  return ulidPattern.test(value)
}
