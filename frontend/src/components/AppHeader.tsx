import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

type AppHeaderProps = {
  center?: ReactNode
  actions?: ReactNode
  bannerMessage?: string
}

export function AppHeader({ center, actions, bannerMessage }: AppHeaderProps) {
  return (
    <div className="top-shell">
      <header className="top-bar">
        <div className="top-brand">
          <Link className="top-brand-link" to="/">
            MarketMetrics
          </Link>
        </div>

        <div className="top-bar-center">{center}</div>

        <div className="top-bar-actions">{actions}</div>
      </header>

      {bannerMessage ? <p className="success-text top-banner">{bannerMessage}</p> : null}
    </div>
  )
}
