import { randomBytes } from 'node:crypto'
import type { User } from '../../../types/models'
import type { MockForm } from './forms'

interface MockUser extends User {
  password: string
}

interface IssuedToken {
  userId: number
  /** When the token chain's original login happened; refreshing keeps it, as the contract says. */
  loginAt: number
  expiresAt: number
}

export interface MockBackendOptions {
  /** Access token lifetime. */
  tokenTtlSeconds: number
  /** How long after login a token chain can be refreshed. */
  refreshWindowSeconds: number
  now: () => number
}

/** In-memory state behind the mock backend. One instance per server or test. */
export class MockBackendState {
  private readonly users = new Map<number, MockUser>()
  private readonly tokens = new Map<string, IssuedToken>()
  private nextUserId = 1
  /** Every form, including soft-deleted ones, by ID. */
  readonly forms = new Map<string, MockForm>()

  constructor(readonly options: MockBackendOptions) {}

  createUser(input: { name: string; email: string; password: string }): User {
    const email = input.email.toLowerCase()

    if (this.findUserByEmail(email)) throw new Error(`A user with ${email} exists.`)

    const at = new Date(this.options.now()).toISOString()
    const user: MockUser = {
      id: this.nextUserId++,
      name: input.name,
      email,
      email_verified_at: null,
      created_at: at,
      updated_at: at,
      password: input.password,
    }

    this.users.set(user.id, user)

    return publicUser(user)
  }

  findUserByEmail(email: string): MockUser | undefined {
    return [...this.users.values()].find((user) => user.email === email.toLowerCase())
  }

  deleteUser(id: number) {
    this.users.delete(id)

    for (const [formId, form] of this.forms) {
      if (form.user_id === id) this.forms.delete(formId)
    }

    for (const [token, issued] of this.tokens) {
      if (issued.userId === id) this.tokens.delete(token)
    }
  }

  /** Issues a token, starting a new chain unless `loginAt` continues one. */
  issueToken(userId: number, loginAt = this.options.now()) {
    const token = `mock.${randomBytes(24).toString('base64url')}`

    this.tokens.set(token, {
      userId,
      loginAt,
      expiresAt: this.options.now() + this.options.tokenTtlSeconds * 1000,
    })

    return {
      access_token: token,
      token_type: 'bearer' as const,
      expires_in: this.options.tokenTtlSeconds,
    }
  }

  /** The user for a valid, unexpired token. */
  authenticate(token: string | undefined): User | undefined {
    const issued = token ? this.tokens.get(token) : undefined

    if (!issued || issued.expiresAt <= this.options.now()) return undefined

    const user = this.users.get(issued.userId)

    return user && publicUser(user)
  }

  /** Exchanges a current or expired token within its refresh window; the old one stops working. */
  refresh(token: string | undefined) {
    const issued = token ? this.tokens.get(token) : undefined

    if (!token || !issued) return undefined

    this.tokens.delete(token)

    if (this.options.now() >= issued.loginAt + this.options.refreshWindowSeconds * 1000) {
      return undefined
    }

    return this.issueToken(issued.userId, issued.loginAt)
  }

  revoke(token: string | undefined) {
    if (token) this.tokens.delete(token)
  }

  /** The current time as the contract's ISO 8601 UTC string. */
  timestamp(): string {
    return new Date(this.options.now()).toISOString().replace(/\.(\d{3})Z$/, '.$1000Z')
  }

  checkPassword(userId: number, password: string): boolean {
    return this.users.get(userId)?.password === password
  }
}

function publicUser({ password, ...user }: MockUser): User {
  return user
}
