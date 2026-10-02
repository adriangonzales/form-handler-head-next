/**
 * The Backend's OpenAPI spec URL: BACKEND_SPEC_URL, or BACKEND_API_URL with a trailing `/api`
 * replaced by `/docs/api.json`.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string | undefined}
 */
export function specUrlFrom(env) {
  if (env.BACKEND_SPEC_URL) return env.BACKEND_SPEC_URL

  const apiUrl = env.BACKEND_API_URL?.replace(/\/+$/, '')

  return apiUrl ? `${apiUrl.replace(/\/api$/, '')}/docs/api.json` : undefined
}
