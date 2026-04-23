import { AlertsPanel } from '../components/AlertsPanel'
import { DashboardHero } from '../components/DashboardHero'
import { DailyMoversSection } from '../components/DailyMoversSection'
import { InsightCard } from '../components/InsightCard'
import { TrackedSymbolsPreview } from '../components/TrackedSymbolsPreview'
import type {
  AlertListResponse,
  BulkAlertActionPayload,
  MoversResponse,
  PriceAlertUpdatePayload,
  RiskProfile,
  UserOut,
  WatchlistItemDetailedOut,
} from '../lib/api'
import '../styles/pages/DashboardPage.css'

type NotificationPermissionState = NotificationPermission | 'unsupported'
type PendingAlertAction = 'delete' | 'reset' | 'pause' | 'resume' | 'edit' | null

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
  watchlist,
}: DashboardPageProps) {
  const activeAlerts = alerts?.activeCount ?? 0
  const triggeredAlerts = alerts?.triggeredCount ?? 0
  const riskProfile = currentUser?.riskProfile as RiskProfile | null | undefined

  return (
    <div className="dashboard-shell">
      <DashboardHero
        activeAlerts={activeAlerts}
        displayName={currentUser?.displayName}
        onRetakeRiskQuiz={onRetakeRiskQuiz}
        onStartRiskQuiz={onStartRiskQuiz}
        riskProfile={riskProfile}
        trackedSymbols={watchlist}
        triggeredAlerts={triggeredAlerts}
      />

      <section className="dashboard-hero-followup page-section">
        <TrackedSymbolsPreview
          isLoading={isLoadingDashboard}
          trackedSymbols={watchlist}
          variant="panel"
        />
        <InsightCard id="random-forest" />
      </section>

      {dashboardError ? <p className="error-text">{dashboardError}</p> : null}

      <section className="dashboard-main-stack page-section">
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

        <div className="dashboard-insight-library">
          <InsightCard id="live-market-data" />
          <InsightCard id="mae" />
          <InsightCard id="forecast-vs-projection" />
          <InsightCard id="monte-carlo" />
          <InsightCard id="not-financial-advice" />
        </div>
      </section>
    </div>
  )
}
