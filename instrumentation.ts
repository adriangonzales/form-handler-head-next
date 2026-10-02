// Runs once when a server instance starts. Node-only startup code lives in its own module, because
// Next.js also compiles this file for the Edge runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node')
  }
}
