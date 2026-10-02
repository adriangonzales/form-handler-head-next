// Browser-visible configuration. Next.js inlines `NEXT_PUBLIC_*` values at build time, so each one
// must be read by its full literal name, and changing one needs a rebuild.

/** The Backend's public API base, used in embed snippets and by the test-submit tool. */
export const backendPublicUrl = (process.env.NEXT_PUBLIC_BACKEND_PUBLIC_URL ?? '').replace(
  /\/+$/,
  '',
)

/** Password rules shown on the Account and reset pages. Match The Backend's policy. */
export const passwordRequirements =
  process.env.NEXT_PUBLIC_PASSWORD_REQUIREMENTS ?? 'Use at least 8 characters.'
