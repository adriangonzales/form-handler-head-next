import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createThrowawayUser } from '../support/throwaway-user'
import { e2eUserFile } from './support'

/** Creates the user the suite signs in as. global-teardown.ts deletes it. */
export default function globalSetup() {
  mkdirSync(dirname(e2eUserFile), { recursive: true })
  writeFileSync(e2eUserFile, JSON.stringify(createThrowawayUser('E2E')))
}
