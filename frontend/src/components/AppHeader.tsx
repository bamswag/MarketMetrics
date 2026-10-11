import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

type AppHeaderProps = {
  center?: ReactNode
  actions?: ReactNode
  bannerMessage?: string
  className?: string
}

export function AppHeader({ center, actions, bannerMessage, className }: AppHeaderProps) {
  return (
    <div className={className ? `top-shell ${className}` : 'top-shell'}>
      <header
        className="top-bar"
        data-scroll-reveal="fade"
        data-scroll-stagger
        data-theme-glare={className === 'top-shell--landing' ? '' : undefined}
      >
        <div className="top-brand">
          <Link aria-label="MarketMetrics home" className="top-brand-link" to="/">
            <img
              alt=""
              className="top-brand-logo top-brand-logo--light-text"
              src="/marketmetrics-logo-light-text.png"
            />
            <img
              alt=""
              className="top-brand-logo top-brand-logo--dark-text"
              src="/marketmetrics-logo-dark-text.png"
            />
          </Link>
        </div>

        <div className="top-bar-center">{center}</div>

        <div className="top-bar-actions">{actions}</div>
      </header>

      {bannerMessage ? (
        <p className="success-text top-banner" data-scroll-reveal="fade" data-scroll-tone="positive">
          {bannerMessage}
        </p>
      ) : null}
    </div>
  )
}
