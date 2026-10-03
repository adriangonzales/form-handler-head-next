import { randomBytes } from 'node:crypto'
import type { FormEntry, FormNotification, User } from '../../../types/models'
import { type MockExport, signingSecret } from './exports'
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
  /** Every entry, including soft-deleted ones, by ID. */
  readonly entries = new Map<string, FormEntry>()
  /** Every export, by ID. */
  readonly exports = new Map<string, MockExport>()
  /** Every alert recipient, including soft-deleted ones, by ID. */
  readonly notifications = new Map<string, FormNotification>()
  /** Alerts "sent" so far, oldest first. The mock delivers them on the spot, and never fails. */
  readonly alerts: { notificationId: string; entryId: string; to: string; at: string }[] = []
  /** Signs export download links. */
  readonly signingSecret = signingSecret()

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

  /** Changes the name or email; a new email clears its verification, as the contract says. */
  updateUser(id: number, changes: { name?: string; email?: string }): User | undefined {
    const user = this.users.get(id)

    if (!user) return undefined

    if (changes.name !== undefined) user.name = changes.name
    if (changes.email !== undefined && changes.email.toLowerCase() !== user.email) {
      user.email = changes.email.toLowerCase()
      user.email_verified_at = null
    }

    user.updated_at = this.timestamp()

    return publicUser(user)
  }

  /** Sets a new password and revokes every token the user has. */
  changePassword(id: number, password: string) {
    const user = this.users.get(id)

    if (!user) return

    user.password = password
    user.updated_at = this.timestamp()

    for (const [token, issued] of this.tokens) {
      if (issued.userId === id) this.tokens.delete(token)
    }
  }

  deleteUser(id: number) {
    this.users.delete(id)

    for (const [formId, form] of this.forms) {
      if (form.user_id !== id) continue

      this.forms.delete(formId)

      for (const [entryId, entry] of this.entries) {
        if (entry.form_id === formId) this.entries.delete(entryId)
      }

      for (const [exportId, entryExport] of this.exports) {
        if (entryExport.form_id === formId) this.exports.delete(exportId)
      }

      for (const [notificationId, notification] of this.notifications) {
        if (notification.form_id === formId) this.notifications.delete(notificationId)
      }
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

  entriesOf(formId: string): FormEntry[] {
    return [...this.entries.values()].filter((entry) => entry.form_id === formId)
  }

  /** A form's recipients, in the order they were added (the contract doesn't fix an order). */
  notificationsOf(formId: string): FormNotification[] {
    return [...this.notifications.values()].filter(
      (notification) => notification.form_id === formId && notification.deleted_at === null,
    )
  }

  /**
   * Alerts a new public entry's enabled email recipients, unless it's spam. A delivery clears the
   * recipient's error, as the contract says. SMS isn't delivered, as in the reference Backend.
   */
  sendAlerts(entry: FormEntry) {
    if (entry.spam === true) return

    for (const notification of this.notificationsOf(entry.form_id)) {
      if (!notification.enabled || notification.type !== 'email') continue

      this.alerts.push({
        notificationId: notification.id,
        entryId: entry.id,
        to: notification.value,
        at: this.timestamp(),
      })
      notification.error = null
    }
  }

  /** The current time, or `ms`, as the contract's ISO 8601 UTC string. */
  timestamp(ms = this.options.now()): string {
    return new Date(ms).toISOString().replace(/\.(\d{3})Z$/, '.$1000Z')
  }

  checkPassword(userId: number, password: string): boolean {
    return this.users.get(userId)?.password === password
  }
}

function publicUser({ password, ...user }: MockUser): User {
  return user
}
