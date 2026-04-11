import { AlertsPanel } from '../components/AlertsPanel'
import { DashboardHero } from '../components/DashboardHero'
import { DailyMoversSection } from '../components/DailyMoversSection'
import type {
  AlertListResponse,
  MoversResponse,
  UserOut,
  WatchlistItemDetailedOut,
} from '../lib/api'

type DashboardPageProps = {
  alerts: AlertListResponse | null
  currentUser: UserOut | null
  dashboardError: string
  isLoadingDashboard: boolean
  movers: MoversResponse | null
  watchlist: WatchlistItemDetailedOut[]
}

export function DashboardPage({
  alerts,
  currentUser,
  dashboardError,
  isLoadingDashboard,
  movers,
  watchlist,
}: DashboardPageProps) {
  const activeAlerts = alerts?.activeCount ?? 0
  const triggeredAlerts = alerts?.triggeredCount ?? 0

  return (
    <div className="dashboard-shell">
      <DashboardHero
        activeAlerts={activeAlerts}
        displayName={currentUser?.displayName}
        isLoadingTrackedSymbols={isLoadingDashboard}
        trackedSymbols={watchlist}
        triggeredAlerts={triggeredAlerts}
      />

      {dashboardError ? <p className="error-text">{dashboardError}</p> : null}

      <section className="workspace-grid page-section">
        <DailyMoversSection
          error={dashboardError && !movers && !isLoadingDashboard ? dashboardError : ''}
          isLoading={isLoadingDashboard}
          movers={movers}
          variant="dashboard"
        />
        <AlertsPanel alerts={alerts} isLoading={isLoadingDashboard} />
      </section>
    </div>
  )
}
