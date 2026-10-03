import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * NFR-7: the dashboard works with any backend that meets the contract, so its code and tests never
 * name the reference Backend's framework. Backend-specific code belongs in `lib/backend/`, and
 * backend-specific setup in the environment (`.env.example`, the README).
 *
 * Not checked: the docs, which describe the reference Backend on purpose, and the types generated
 * from its spec.
 */
const allowed = [/^lib\/backend\//, /^docs\//, /^types\/(api\.d\.ts|openapi\.json)$/, /\.md$/]
const allowedFiles = new Set([
  '.env.example',
  'pnpm-lock.yaml',
  'tests/unit/backend-independence.test.ts',
])
const frameworkNames = /\b(laravel|artisan|php|eloquent|symfony|django)\b/i

function trackedAndNewFiles(): string[] {
  const output = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
  })

  return output.split('\n').filter(Boolean)
}

describe('backend independence', () => {
  it('names no backend framework outside lib/backend, the docs and .env.example', () => {
    const offenders = trackedAndNewFiles()
      .filter((file) => !allowedFiles.has(file) && !allowed.some((pattern) => pattern.test(file)))
      .filter((file) => !/\.(ico|png|jpe?g|svg|woff2?)$/.test(file))
      .flatMap((file) => {
        let text: string

        try {
          text = readFileSync(file, 'utf8')
        } catch {
          return [] // Deleted in the working tree.
        }

        return text
          .split('\n')
          .flatMap((line, index) =>
            frameworkNames.test(line) ? [`${file}:${index + 1}: ${line.trim()}`] : [],
          )
      })

    expect(offenders).toEqual([])
  })
})
