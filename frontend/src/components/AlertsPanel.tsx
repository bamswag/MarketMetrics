import { useState } from 'react'

import type { AlertCondition, AlertListResponse, PriceAlertUpdatePayload } from '../lib/api'
import { formatCurrency, formatDateTime } from '../lib/formatters'

type NotificationPermissionState = NotificationPermission | 'unsupported'
type PendingAlertAction = 'delete' | 'reset' | 'pause' | 'resume' | 'edit' | null

type AlertsPanelProps = {
  alerts: AlertListResponse | null
  errorMessage: string
  isLoading: boolean
  notificationPermission: NotificationPermissionState
  onDeleteAlert: (alertId: string) => Promise<void>
  onEnableNotifications: () => Promise<void>
  onPauseAlert: (alertId: string) => Promise<void>
  onResetAlert: (alertId: string) => Promise<void>
  onResumeAlert: (alertId: string) => Promise<void>
  onUpdateAlert?: (alertId: string, payload: PriceAlertUpdatePayload) => Promise<void>
  pendingAction: PendingAlertAction
  pendingActionId: string
}

function formatCondition(condition: string) {
  return condition === 'above' ? 'Above' : 'Below'
}

type EditState = {
  alertId: string
  condition: AlertCondition
  targetPrice: string
}

export function AlertsPanel({
  alerts,
  errorMessage,
  isLoading,
  notificationPermission,
  onDeleteAlert,
  onEnableNotifications,
  onPauseAlert,
  onResetAlert,
  onResumeAlert,
  onUpdateAlert,
  pendingAction,
  pendingActionId,
}: AlertsPanelProps) {
  const activeAlerts = alerts?.activeAlerts ?? []
  const pausedAlerts = alerts?.pausedAlerts ?? []
  const triggeredAlerts = alerts?.triggeredAlerts ?? []

  const [editState, setEditState] = useState<EditState | null>(null)
  const [editError, setEditError] = useState('')

  function startEditing(alertId: string, condition: AlertCondition, targetPrice: number) {
    setEditState({ alertId, condition, targetPrice: targetPrice.toString() })
    setEditError('')
  }

  function cancelEditing() {
    setEditState(null)
    setEditError('')
  }

  async function saveEdit() {
    if (!editState || !onUpdateAlert) {
      return
    }

    const parsedPrice = Number.parseFloat(editState.targetPrice)
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setEditError('Enter a valid target price greater than zero.')
      return
    }

    setEditError('')

    try {
      await onUpdateAlert(editState.alertId, {
        condition: editState.condition,
        targetPrice: parsedPrice,
      })
      setEditState(null)
    } catch (error) {
      setEditError(
        error instanceof Error ? error.message : 'Unable to update alert.',
      )
    }
  }

  return (
    <article className="panel panel-wide">
      <div className="panel-header">
        <div className="panel-header-copy">
          <p className="section-label">Alerts and activity</p>
          <h2 className="panel-title">Keep every price rule live and within reach</h2>
        </div>
        <span className="panel-tag">
          {alerts ? `${alerts.totalCount} total` : isLoading ? 'Loading' : 'Idle'}
        </span>
      </div>

      <div className="alerts-summary-grid">
        <div className="metric-card">
          <span className="metric-label">Active rules</span>
          <strong className="metric-value">{alerts?.activeCount ?? '--'}</strong>
          <p>Rules currently waiting for a live threshold to hit.</p>
        </div>
        <div className="metric-card">
          <span className="metric-label">Paused</span>
          <strong className="metric-value">{alerts?.pausedCount ?? '--'}</strong>
          <p>Alerts temporarily silenced.</p>
        </div>
        <div className="metric-card">
          <span className="metric-label">Triggered events</span>
          <strong className="metric-value">{alerts?.triggeredCount ?? '--'}</strong>
          <p>Alerts that have fired and are ready to reset or review.</p>
        </div>
      </div>

      <div className="alerts-notification-banner">
        <div className="panel-header-copy">
          <p className="section-label">Notifications</p>
          <h3 className="subsection-title">Realtime alert delivery</h3>
        </div>

        {notificationPermission === 'default' ? (
          <div className="alerts-notification-actions">
            <p className="panel-note">
              Enable browser notifications to surface alerts the moment they trigger.
            </p>
            <button className="primary-action alerts-inline-action" onClick={() => void onEnableNotifications()} type="button">
              Enable notifications
            </button>
          </div>
        ) : notificationPermission === 'granted' ? (
          <span className="positive-pill">Browser alerts enabled</span>
        ) : notificationPermission === 'denied' ? (
          <span className="neutral-pill">Browser notifications blocked</span>
        ) : (
          <span className="neutral-pill">Browser notifications unavailable</span>
        )}
      </div>

      {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
      {editError ? <p className="error-text">{editError}</p> : null}

      {isLoading && !alerts ? (
        <p className="empty-state">Loading active and triggered alerts...</p>
      ) : (
        <div className="alerts-columns">
          <div className="alerts-column">
            <div className="panel-header-copy">
              <p className="section-label">Active</p>
              <h3 className="subsection-title">Armed rules</h3>
            </div>

            {activeAlerts.length > 0 ? (
              activeAlerts.map((alert) => {
                const isDeleting =
                  pendingActionId === alert.id && pendingAction === 'delete'
                const isPausing =
                  pendingActionId === alert.id && pendingAction === 'pause'
                const isEditing = editState?.alertId === alert.id
                const isSaving =
                  pendingActionId === alert.id && pendingAction === 'edit'

                if (isEditing && editState) {
                  return (
                    <article className="alert-row alert-row--editing" key={alert.id}>
                      <div className="alert-edit-form">
                        <label className="alert-edit-field">
                          <span className="alert-edit-label">Condition</span>
                          <select
                            className="alert-edit-select"
                            onChange={(e) =>
                              setEditState({ ...editState, condition: e.target.value as AlertCondition })
                            }
                            value={editState.condition}
                          >
                            <option value="above">Above target</option>
                            <option value="below">Below target</option>
                          </select>
                        </label>

                        <label className="alert-edit-field">
                          <span className="alert-edit-label">Target price</span>
                          <input
                            className="alert-edit-input"
                            inputMode="decimal"
                            min="0"
                            onChange={(e) =>
                              setEditState({ ...editState, targetPrice: e.target.value })
                            }
                            step="0.01"
                            type="number"
                            value={editState.targetPrice}
                          />
                        </label>
                      </div>

                      <div className="alert-row-actions">
                        <button
                          className="primary-action alert-inline-button"
                          disabled={isSaving}
                          onClick={() => void saveEdit()}
                          type="button"
                        >
                          {isSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          className="ghost-action alert-inline-button"
                          disabled={isSaving}
                          onClick={cancelEditing}
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    </article>
                  )
                }

                return (
                  <article className="alert-row" key={alert.id}>
                    <div className="alert-row-head">
                      <div className="alert-row-meta">
                        <strong>
                          {alert.symbol} · {formatCondition(alert.condition)}
                        </strong>
                        <p>{formatCurrency(alert.targetPrice)}</p>
                        <p className="alert-row-time">Waiting for live price confirmation.</p>
                      </div>
                      <span className="neutral-pill">Waiting</span>
                    </div>

                    <div className="alert-row-actions">
                      {onUpdateAlert ? (
                        <button
                          className="ghost-action alert-inline-button"
                          disabled={isPausing || isDeleting}
                          onClick={() => startEditing(alert.id, alert.condition, alert.targetPrice)}
                          type="button"
                        >
                          Edit
                        </button>
                      ) : null}
                      <button
                        className="ghost-action alert-inline-button"
                        disabled={isPausing || isDeleting}
                        onClick={() => void onPauseAlert(alert.id)}
                        type="button"
                      >
                        {isPausing ? 'Pausing...' : 'Pause'}
                      </button>
                      <button
                        className="ghost-action alert-inline-button"
                        disabled={isDeleting || isPausing}
                        onClick={() => void onDeleteAlert(alert.id)}
                        type="button"
                      >
                        {isDeleting ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </article>
                )
              })
            ) : (
              <p className="empty-state">No active alerts yet.</p>
            )}

            {pausedAlerts.length > 0 ? (
              <>
                <div className="panel-header-copy alerts-paused-header">
                  <p className="section-label">Paused</p>
                  <h3 className="subsection-title">Silenced rules</h3>
                </div>

                {pausedAlerts.map((alert) => {
                  const isDeleting =
                    pendingActionId === alert.id && pendingAction === 'delete'
                  const isResuming =
                    pendingActionId === alert.id && pendingAction === 'resume'

                  return (
                    <article className="alert-row alert-row--paused" key={alert.id}>
                      <div className="alert-row-head">
                        <div className="alert-row-meta">
                          <strong>
                            {alert.symbol} · {formatCondition(alert.condition)}
                          </strong>
                          <p>{formatCurrency(alert.targetPrice)}</p>
                          <p className="alert-row-time">Alert paused — not being evaluated.</p>
                        </div>
                        <span className="warning-pill">Paused</span>
                      </div>

                      <div className="alert-row-actions">
                        <button
                          className="primary-action alert-inline-button"
                          disabled={isResuming || isDeleting}
                          onClick={() => void onResumeAlert(alert.id)}
                          type="button"
                        >
                          {isResuming ? 'Resuming...' : 'Resume'}
                        </button>
                        <button
                          className="ghost-action alert-inline-button"
                          disabled={isDeleting || isResuming}
                          onClick={() => void onDeleteAlert(alert.id)}
                          type="button"
                        >
                          {isDeleting ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </article>
                  )
                })}
              </>
            ) : null}
          </div>

          <div className="alerts-column">
            <div className="panel-header-copy">
              <p className="section-label">Triggered</p>
              <h3 className="subsection-title">Recent signals</h3>
            </div>

            {triggeredAlerts.length > 0 ? (
              triggeredAlerts.map((alert) => {
                const isDeleting =
                  pendingActionId === alert.id && pendingAction === 'delete'
                const isResetting =
                  pendingActionId === alert.id && pendingAction === 'reset'

                return (
                  <article className="alert-row" key={alert.id}>
                    <div className="alert-row-head">
                      <div className="alert-row-meta">
                        <strong>
                          {alert.symbol} · {formatCondition(alert.condition)}
                        </strong>
                        <p>{formatCurrency(alert.targetPrice)}</p>
                        <p className="alert-row-time">
                          Triggered {formatDateTime(alert.triggeredAt)}
                        </p>
                      </div>
                      <span className="positive-pill">Triggered</span>
                    </div>

                    <div className="alert-row-actions">
                      <button
                        className="primary-action alert-inline-button"
                        disabled={isResetting || isDeleting}
                        onClick={() => void onResetAlert(alert.id)}
                        type="button"
                      >
                        {isResetting ? 'Resetting...' : 'Reset'}
                      </button>
                      <button
                        className="ghost-action alert-inline-button"
                        disabled={isDeleting || isResetting}
                        onClick={() => void onDeleteAlert(alert.id)}
                        type="button"
                      >
                        {isDeleting ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </article>
                )
              })
            ) : (
              <p className="empty-state">Triggered alerts will appear here once they fire.</p>
            )}
          </div>
        </div>
      )}
    </article>
  )
}
