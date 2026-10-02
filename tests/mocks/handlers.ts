import type { RequestHandler } from 'msw'

/** The API base the mock backend answers on. Tests point the app's backend URL here. */
export const mockBackendUrl = 'http://backend.test/api'

/** Default handlers for every test. Endpoints are added as the features that use them are built. */
export const handlers: RequestHandler[] = []
