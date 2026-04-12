import { TrackedSymbolsPreview } from './TrackedSymbolsPreview'
import type { WatchlistItemDetailedOut } from '../lib/api'

type DashboardHeroProps = {
  displayName?: string
  trackedSymbols: WatchlistItemDetailedOut[]
  isLoadingTrackedSymbols: boolean
  activeAlerts: number
  triggeredAlerts: number
}

export function DashboardHero({
  displayName,
  trackedSymbols,
  isLoadingTrackedSymbols,
  activeAlerts,
  triggeredAlerts,
}: DashboardHeroProps) {
  return (
    <section className="dashboard-hero page-section">
      <div className="dashboard-hero-copy">
        <div className="dashboard-greeting-row">
          <span className="dashboard-greeting-badge">Dashboard</span>
        </div>
        <h1 className="dashboard-heading">
          {displayName ? `Welcome back, ${displayName}.` : 'Your market overview'}
        </h1>
        <p className="hero-text">
          Track your instruments, monitor alerts, and stay on top of the market — all in one place.
        </p>

        <div className="dashboard-quick-stats">
          <div className="dashboard-quick-stat">
            <strong className="dashboard-quick-stat-value">{trackedSymbols.length}</strong>
            <span className="dashboard-quick-stat-label">Tracked</span>
          </div>
          <div className="dashboard-quick-stat-divider" />
          <div className="dashboard-quick-stat">
            <strong className="dashboard-quick-stat-value">{activeAlerts}</strong>
            <span className="dashboard-quick-stat-label">Active alerts</span>
          </div>
          <div className="dashboard-quick-stat-divider" />
          <div className="dashboard-quick-stat">
            <strong className="dashboard-quick-stat-value">{triggeredAlerts}</strong>
            <span className="dashboard-quick-stat-label">Triggered</span>
          </div>
        </div>
      </div>

      <div className="dashboard-metric-grid">
        <TrackedSymbolsPreview
          isLoading={isLoadingTrackedSymbols}
          trackedSymbols={trackedSymbols}
          variant="hero"
        />
      </div>
    </section>
  )
}
