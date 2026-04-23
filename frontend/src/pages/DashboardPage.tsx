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
  const riskProfile = currentUser?.riskProfile as RiskProfile | null | undefined

  return (
    <div className="dashboard-shell">
      <DashboardHero
        displayName={currentUser?.displayName}
        onRetakeRiskQuiz={onRetakeRiskQuiz}
        onStartRiskQuiz={onStartRiskQuiz}
        riskProfile={riskProfile}
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
          betweenPanels={(
            <>
              <InsightCard id="live-market-data" />
              <InsightCard id="forecast-vs-projection" />
            </>
          )}
          error={dashboardError && !movers && !isLoadingDashboard ? dashboardError : ''}
          isLoading={isLoadingDashboard}
          movers={movers}
          variant="dashboard"
        />

        <div className="dashboard-insight-row">
          <InsightCard id="mae" />
          <InsightCard id="monte-carlo" />
        </div>

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

        <div className="dashboard-bottom-insight">
          <InsightCard id="not-financial-advice" />
        </div>
      </section>
    </div>
  )
}
