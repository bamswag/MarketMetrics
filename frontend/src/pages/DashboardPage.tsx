import { AlertsPanel } from '../components/AlertsPanel'
import { DashboardHero } from '../components/DashboardHero'
import { DailyMoversSection } from '../components/DailyMoversSection'
import { TrackedSymbolsPreview } from '../components/TrackedSymbolsPreview'
import type {
  AlertListResponse,
  BulkAlertActionPayload,
  Mover,
  MoversResponse,
  PriceAlertUpdatePayload,
  RiskProfile,
  UserOut,
  WatchlistItemDetailedOut,
} from '../lib/api'
import '../styles/pages/DashboardPage.css'

type NotificationPermissionState = NotificationPermission | 'unsupported'
type PendingAlertAction = 'delete' | 'reset' | 'pause' | 'resume' | 'edit' | null

function getTopGainer(movers: MoversResponse | null): Mover | null {
  if (!movers) return null
  const all = [
    ...(movers.gainersByCategory?.stocks ?? movers.gainers ?? []),
    ...(movers.gainersByCategory?.crypto ?? []),
    ...(movers.gainersByCategory?.etfs ?? []),
  ]
  if (all.length === 0) return null
  return all.reduce<Mover>((best, m) => {
    const pct = parseFloat(m.change_percent ?? '0')
    const bestPct = parseFloat(best.change_percent ?? '0')
    return pct > bestPct ? m : best
  }, all[0])
}

type DashboardPageProps = {
  alerts: AlertListResponse | null
  alertActionError: string
  currentUser: UserOut | null
  dashboardError: string
  isLoadingDashboard: boolean
  movers: MoversResponse | null
  notificationPermission: NotificationPermissionState
  onBulkAction: (payload: BulkAlertActionPayload) => Promise<void>
  onDeleteAlert: (alertId: string) => Promise<void>
  onEnableNotifications: () => Promise<void>
  onPauseAlert: (alertId: string) => Promise<void>
  onResetAlert: (alertId: string) => Promise<void>
  onResumeAlert: (alertId: string) => Promise<void>
  onStartRiskQuiz?: () => void
  onRetakeRiskQuiz?: () => void
  onUpdateAlert: (alertId: string, payload: PriceAlertUpdatePayload) => Promise<void>
  pendingAlertAction: PendingAlertAction
  pendingAlertActionId: string
  token?: string
  topGainerSeries?: { date: string; close: number }[]
  watchlist: WatchlistItemDetailedOut[]
}

export function DashboardPage({
  alerts,
  alertActionError,
  currentUser,
  dashboardError,
  isLoadingDashboard,
  movers,
  notificationPermission,
  onBulkAction,
  onDeleteAlert,
  onEnableNotifications,
  onPauseAlert,
  onResetAlert,
  onResumeAlert,
  onStartRiskQuiz,
  onRetakeRiskQuiz,
  onUpdateAlert,
  pendingAlertAction,
  pendingAlertActionId,
  token,
  topGainerSeries = [],
  watchlist,
}: DashboardPageProps) {
  const activeAlerts = alerts?.activeCount ?? 0
  const triggeredAlerts = alerts?.triggeredCount ?? 0
  const riskProfile = currentUser?.riskProfile as RiskProfile | null | undefined
  const topGainer = getTopGainer(movers)

  return (
    <div className="dashboard-shell">
      <DashboardHero
        activeAlerts={activeAlerts}
        displayName={currentUser?.displayName}
        isLoadingMovers={isLoadingDashboard}
        onRetakeRiskQuiz={onRetakeRiskQuiz}
        onStartRiskQuiz={onStartRiskQuiz}
        riskProfile={riskProfile}
        topGainer={topGainer}
        topGainerSeries={topGainerSeries}
        trackedSymbols={watchlist}
        triggeredAlerts={triggeredAlerts}
      />

      {dashboardError ? <p className="error-text">{dashboardError}</p> : null}

      <TrackedSymbolsPreview
        isLoading={isLoadingDashboard}
        trackedSymbols={watchlist}
        variant="panel"
      />

      <section className="workspace-grid page-section">
        <DailyMoversSection
          error={dashboardError && !movers && !isLoadingDashboard ? dashboardError : ''}
          isLoading={isLoadingDashboard}
          movers={movers}
          variant="dashboard"
        />
        <AlertsPanel
          alerts={alerts}
          errorMessage={alertActionError}
          isLoading={isLoadingDashboard}
          notificationPermission={notificationPermission}
          onBulkAction={onBulkAction}
          onDeleteAlert={onDeleteAlert}
          onEnableNotifications={onEnableNotifications}
          onPauseAlert={onPauseAlert}
          onResetAlert={onResetAlert}
          onResumeAlert={onResumeAlert}
          onUpdateAlert={onUpdateAlert}
          pendingAction={pendingAlertAction}
          pendingActionId={pendingAlertActionId}
          token={token}
        />
      </section>
    </div>
  )
}
