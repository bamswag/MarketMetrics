import { AlertsPanel } from '../components/AlertsPanel'
import { DashboardHero } from '../components/DashboardHero'
import { DailyMoversSection } from '../components/DailyMoversSection'
import type {
  AlertListResponse,
  MoversResponse,
  PriceAlertUpdatePayload,
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
  onDeleteAlert: (alertId: string) => Promise<void>
  onEnableNotifications: () => Promise<void>
  onPauseAlert: (alertId: string) => Promise<void>
  onResetAlert: (alertId: string) => Promise<void>
  onResumeAlert: (alertId: string) => Promise<void>
  onUpdateAlert: (alertId: string, payload: PriceAlertUpdatePayload) => Promise<void>
  pendingAlertAction: PendingAlertAction
  pendingAlertActionId: string
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
  onDeleteAlert,
  onEnableNotifications,
  onPauseAlert,
  onResetAlert,
  onResumeAlert,
  onUpdateAlert,
  pendingAlertAction,
  pendingAlertActionId,
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
        <AlertsPanel
          alerts={alerts}
          errorMessage={alertActionError}
          isLoading={isLoadingDashboard}
          notificationPermission={notificationPermission}
          onDeleteAlert={onDeleteAlert}
          onEnableNotifications={onEnableNotifications}
          onPauseAlert={onPauseAlert}
          onResetAlert={onResetAlert}
          onResumeAlert={onResumeAlert}
          onUpdateAlert={onUpdateAlert}
          pendingAction={pendingAlertAction}
          pendingActionId={pendingAlertActionId}
        />
      </section>
    </div>
  )
}
