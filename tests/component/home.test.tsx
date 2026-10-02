import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import Home from '../../app/page'
import { mockBackendUrl } from '../mocks/handlers'
import { server } from '../mocks/server'

describe('component test setup', () => {
  it('renders a page with jest-dom matchers', () => {
    render(<Home />)

    expect(screen.getByRole('heading', { name: 'Form Handler' })).toBeInTheDocument()
  })

  it('answers requests from the mock backend', async () => {
    server.use(
      http.get(`${mockBackendUrl}/v1/auth/me`, () =>
        HttpResponse.json({ message: 'Unauthenticated.' }, { status: 401 }),
      ),
    )

    const response = await fetch(`${mockBackendUrl}/v1/auth/me`)

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ message: 'Unauthenticated.' })
  })
})
