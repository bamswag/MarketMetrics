import { StatCard } from './StatCard'
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
        <p className="eyebrow personalized-eyebrow">
          {displayName ? `Hey ${displayName}, Welcome to MarketMetrics!` : 'MarketMetrics dashboard'}
        </p>
        <h1>Search faster, track smarter, and move through the market with clarity.</h1>
        <p className="hero-text">
          Your workspace is centered on chartable instruments, cleaner watchlists, faster drill-downs,
          and signal-rich summaries so the dashboard feels like a product instead of a prototype.
        </p>

        <div className="dashboard-tag-row">
          <span className="dashboard-tag">Search-ready workflow</span>
          <span className="dashboard-tag">Watchlist-first context</span>
          <span className="dashboard-tag">Chart-driven analysis</span>
        </div>
      </div>

      <div className="dashboard-metric-grid">
        <TrackedSymbolsPreview
          isLoading={isLoadingTrackedSymbols}
          trackedSymbols={trackedSymbols}
          variant="hero"
        />
        <StatCard
          description="Live monitoring rules currently waiting on price conditions."
          label="Active alerts"
          value={activeAlerts}
        />
        <StatCard
          description="Triggered alerts that have already surfaced meaningful events."
          label="Triggered alerts"
          value={triggeredAlerts}
        />
      </div>
    </section>
  )
}
