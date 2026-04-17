import { useState } from 'react'
import { NavLink } from 'react-router-dom'

type SideNavProps = {
  token: string | null
}

const AUTH_LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/movers/gainers', label: 'Gainers' },
  { to: '/movers/losers', label: 'Losers' },
  { to: '/tracked-symbols', label: 'Tracked Symbols' },
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

export function SideNav({ token }: SideNavProps) {
  const [isOpen, setIsOpen] = useState(false)
  const links = token ? AUTH_LINKS : GUEST_LINKS

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
