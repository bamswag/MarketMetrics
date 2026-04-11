import { NavLink } from 'react-router-dom'

function authLinkClass(isActive: boolean) {
  return isActive ? 'auth-launcher is-active' : 'auth-launcher'
}

export function AuthActions() {
  return (
    <div className="top-auth-buttons">
      <NavLink className={({ isActive }) => authLinkClass(isActive)} to="/signup">
        Sign up
      </NavLink>
      <NavLink className={({ isActive }) => authLinkClass(isActive)} to="/login">
        Log in
      </NavLink>
    </div>
  )
}
