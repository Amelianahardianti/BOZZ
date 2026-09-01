import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { routeConfig } from './router'
import { NAV_ITEMS, ROUTES } from './routes'

/**
 * Render rute PERSIS yang jalan di production (routeConfig), cuma
 * history-nya diganti ke memory router biar bisa dites tanpa browser.
 */
function renderAt(path: string) {
  const router = createMemoryRouter(routeConfig, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

describe('routing', () => {
  it('"/" redirect ke dashboard', async () => {
    renderAt('/')

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('halaman login tampil TANPA nav shell', () => {
    renderAt(ROUTES.login)

    expect(screen.getByRole('heading', { name: 'Masuk' })).toBeInTheDocument()
    // Nav cuma ada di AppShell -- kalau ini muncul di halaman login,
    // berarti Login ketimpa di dalam shell padahal harus berdiri sendiri.
    expect(screen.queryByRole('link', { name: 'Kasir' })).not.toBeInTheDocument()
  })

  it('path yang gak dikenal nampilin halaman 404', () => {
    renderAt('/halaman-ngawur')

    expect(screen.getByText('404')).toBeInTheDocument()
  })

  it.each(NAV_ITEMS)('rute nav "$label" ($path) render tanpa error', ({ path, label }) => {
    renderAt(path)

    // AppShell dirender dua kali (sidebar desktop + tab bar mobile),
    // jadi tiap nav link nongol 2x -- pakai getAllBy, bukan getBy.
    expect(screen.getAllByRole('link', { name: 'Kasir' }).length).toBeGreaterThan(0)
    expect(screen.getAllByText(label).length).toBeGreaterThan(0)
  })

  it('klik nav link beneran pindah halaman', async () => {
    const router = renderAt(ROUTES.dashboard)

    const [ticketLink] = screen.getAllByRole('link', { name: 'Ticket Saya' })
    await userEvent.click(ticketLink)

    expect(await screen.findByRole('heading', { name: 'Ticket Saya' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(ROUTES.tickets)
  })
})
