import { setupServer } from 'msw/node'
import { handlers } from './handlers'

/** The mock backend for tests running in Node (Vitest). */
export const server = setupServer(...handlers)
