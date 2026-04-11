import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

type UserMenuProps = {
  displayName?: string
}

function menuItemClass(isActive: boolean) {
  return isActive ? 'user-menu-item is-active' : 'user-menu-item'
}

export function UserMenu({ displayName }: UserMenuProps) {
  const location = useLocation()
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    setIsOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={isOpen ? 'user-menu-trigger is-open' : 'user-menu-trigger'}
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        type="button"
      >
        <span className="user-menu-trigger-label">{displayName ?? 'My account'}</span>
        <span aria-hidden="true" className="user-menu-caret">
          {isOpen ? '▴' : '▾'}
        </span>
      </button>

      {isOpen ? (
        <div className="user-menu-dropdown" role="menu">
          <NavLink className={({ isActive }) => menuItemClass(isActive)} to="/tracked-symbols">
            Tracked symbols
          </NavLink>
          <NavLink className={({ isActive }) => menuItemClass(isActive)} to="/account">
            Account
          </NavLink>
          <NavLink className={({ isActive }) => menuItemClass(isActive)} to="/settings">
            Settings
          </NavLink>
        </div>
      ) : null}
    </div>
  )
}
