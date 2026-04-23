import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

type SideNavProps = {
  token: string | null
}

const AUTH_LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/movers/gainers', label: 'Gainers' },
  { to: '/movers/losers', label: 'Losers' },
  { to: '/tracked-symbols', label: 'Tracked Symbols' },
  { to: '/simulation-history', label: 'Simulation History' },
  { to: '/account', label: 'Account' },
  { to: '/settings', label: 'Settings' },
]

const GUEST_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/movers/gainers', label: 'Gainers' },
  { to: '/movers/losers', label: 'Losers' },
  { to: '/login', label: 'Login' },
  { to: '/signup', label: 'Sign Up' },
]

function symbolFromPath(pathname: string) {
  const instrumentMatch = pathname.match(/^\/instrument\/([^/]+)/)
  if (instrumentMatch?.[1]) {
    return decodeURIComponent(instrumentMatch[1])
  }

  const forecastMatch = pathname.match(/^\/forecast\/([^/]+)/)
  if (forecastMatch?.[1]) {
    return decodeURIComponent(forecastMatch[1])
  }

  return ''
}

export function SideNav({ token }: SideNavProps) {
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const activeSymbol = symbolFromPath(location.pathname)
  const symbolLinks = token && activeSymbol
    ? [
        { to: `/forecast/${encodeURIComponent(activeSymbol)}`, label: 'Forecast' },
        { to: `/instrument/${encodeURIComponent(activeSymbol)}/project`, label: 'Simulator' },
      ]
    : []
  const links = token
    ? [
        ...AUTH_LINKS.slice(0, 4),
        ...symbolLinks,
        ...AUTH_LINKS.slice(4),
      ]
    : GUEST_LINKS

  return (
    <>
      <button
        aria-label={isOpen ? 'Close navigation' : 'Open navigation'}
        className="sidenav-toggle"
        onClick={() => setIsOpen((prev) => !prev)}
        type="button"
      >
        {isOpen ? '‹' : '›'}
      </button>

      {isOpen && (
        <div
          aria-hidden="true"
          className="sidenav-backdrop"
          onClick={() => setIsOpen(false)}
        />
      )}

      <nav className={`sidenav-panel${isOpen ? ' sidenav-panel--open' : ''}`}>
        <p className="sidenav-header">Navigation</p>
        {links.map(({ to, label }) => (
          <NavLink
            className={({ isActive }) =>
              `sidenav-link${isActive ? ' sidenav-link--active' : ''}`
            }
            end={to === '/'}
            key={to}
            onClick={() => setIsOpen(false)}
            to={to}
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
