import { useState } from 'react'

import type {
  AlertCondition,
  AlertEvent,
  AlertListResponse,
  BulkAlertActionPayload,
  PriceAlert,
  PriceAlertUpdatePayload,
} from '../lib/api'
import { fetchAlertHistory } from '../lib/api'
import { formatCurrency, formatDateTime } from '../lib/formatters'

type NotificationPermissionState = NotificationPermission | 'unsupported'
type PendingAlertAction = 'delete' | 'reset' | 'pause' | 'resume' | 'edit' | 'bulk' | null

type AlertsPanelProps = {
  alerts: AlertListResponse | null
  errorMessage: string
  isLoading: boolean
  notificationPermission: NotificationPermissionState
  onBulkAction?: (payload: BulkAlertActionPayload) => Promise<void>
  onDeleteAlert: (alertId: string) => Promise<void>
  onEnableNotifications: () => Promise<void>
  onPauseAlert: (alertId: string) => Promise<void>
  onResetAlert: (alertId: string) => Promise<void>
  onResumeAlert: (alertId: string) => Promise<void>
  onUpdateAlert?: (alertId: string, payload: PriceAlertUpdatePayload) => Promise<void>
  pendingAction: PendingAlertAction
  pendingActionId: string
  token?: string
}

function formatCondition(condition: string) {
  if (condition === 'above') return 'Above'
  if (condition === 'below') return 'Below'
  if (condition === 'percent_change') return '% Change'
  if (condition === 'range_exit') return 'Range exit'
  return condition
}

function formatAlertTarget(alert: PriceAlert) {
  if (alert.condition === 'range_exit' && alert.lowerBound != null && alert.upperBound != null) {
    return `${formatCurrency(alert.lowerBound)}–${formatCurrency(alert.upperBound)}`
  }
  if (alert.condition === 'percent_change' && alert.targetPrice != null) {
    const refStr = alert.referencePrice != null ? ` from ${formatCurrency(alert.referencePrice)}` : ''
    return `${alert.targetPrice}%${refStr}`
  }
  return alert.targetPrice != null ? formatCurrency(alert.targetPrice) : '--'
}

function expiresLabel(expiresAt?: string | null): string | null {
  if (!expiresAt) return null
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  const hours = Math.floor(diff / 3_600_000)
  if (hours < 24) return `Expires in ${hours}h`
  const days = Math.floor(hours / 24)
  return `Expires in ${days}d`
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
  onBulkAction,
  onDeleteAlert,
  onEnableNotifications,
  onPauseAlert,
  onResetAlert,
  onResumeAlert,
  onUpdateAlert,
  pendingAction,
  pendingActionId,
  token,
}: AlertsPanelProps) {
  const activeAlerts = alerts?.activeAlerts ?? []
  const pausedAlerts = alerts?.pausedAlerts ?? []
  const triggeredAlerts = alerts?.triggeredAlerts ?? []

  const [editState, setEditState] = useState<EditState | null>(null)
  const [editError, setEditError] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isBulkPending, setIsBulkPending] = useState(false)
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)
  const [historyEvents, setHistoryEvents] = useState<AlertEvent[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  async function toggleHistory(alertId: string) {
    if (expandedHistoryId === alertId) {
      setExpandedHistoryId(null)
      setHistoryEvents([])
      return
    }
    if (!token) return
    setExpandedHistoryId(alertId)
    setIsLoadingHistory(true)
    try {
      const result = await fetchAlertHistory(token, alertId)
      setHistoryEvents(result.events)
    } catch {
      setHistoryEvents([])
    } finally {
      setIsLoadingHistory(false)
    }
  }

  function toggleSelection(alertId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(alertId)) {
        next.delete(alertId)
      } else {
        next.add(alertId)
      }
      return next
    })
  }

  function selectAll() {
    const allIds = [
      ...activeAlerts.map((a) => a.id),
      ...pausedAlerts.map((a) => a.id),
      ...triggeredAlerts.map((a) => a.id),
    ]
    setSelectedIds(new Set(allIds))
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  async function handleBulk(action: BulkAlertActionPayload['action']) {
    if (!onBulkAction || selectedIds.size === 0) return
    setIsBulkPending(true)
    try {
      await onBulkAction({ alertIds: Array.from(selectedIds), action })
      setSelectedIds(new Set())
    } catch {
      // Error handled by parent
    } finally {
      setIsBulkPending(false)
    }
  }

  function startEditing(alertId: string, condition: AlertCondition, targetPrice: number | null) {
    setEditState({ alertId, condition, targetPrice: (targetPrice ?? 0).toString() })
    setEditError('')
  }

  function cancelEditing() {
    setEditState(null)
    setEditError('')
  }

  async function saveEdit() {
    if (!editState || !onUpdateAlert) return

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
      setEditError(error instanceof Error ? error.message : 'Unable to update alert.')
    }
  }

  const hasSelection = selectedIds.size > 0

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

      {/* Bulk action bar */}
      {hasSelection && onBulkAction ? (
        <div className="alerts-bulk-bar">
          <span className="alerts-bulk-count">{selectedIds.size} selected</span>
          <button className="ghost-action alert-inline-button" disabled={isBulkPending} onClick={() => void handleBulk('pause')} type="button">Pause</button>
          <button className="ghost-action alert-inline-button" disabled={isBulkPending} onClick={() => void handleBulk('resume')} type="button">Resume</button>
          <button className="ghost-action alert-inline-button" disabled={isBulkPending} onClick={() => void handleBulk('reset')} type="button">Reset</button>
          <button className="ghost-action alert-inline-button" disabled={isBulkPending} onClick={() => void handleBulk('delete')} type="button">Delete</button>
          <button className="ghost-action alert-inline-button" onClick={clearSelection} type="button">Clear</button>
        </div>
      ) : onBulkAction && alerts && alerts.totalCount > 0 ? (
        <div className="alerts-bulk-bar">
          <button className="ghost-action alert-inline-button" onClick={selectAll} type="button">Select all</button>
        </div>
      ) : null}

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
                const isDeleting = pendingActionId === alert.id && pendingAction === 'delete'
                const isPausing = pendingActionId === alert.id && pendingAction === 'pause'
                const isEditing = editState?.alertId === alert.id
                const isSaving = pendingActionId === alert.id && pendingAction === 'edit'
                const isUrgent = alert.severity === 'urgent'
                const expires = expiresLabel(alert.expiresAt)

                if (isEditing && editState) {
                  return (
                    <article className="alert-row alert-row--editing" key={alert.id}>
                      <div className="alert-edit-form">
                        <label className="alert-edit-field">
                          <span className="alert-edit-label">Condition</span>
                          <select className="alert-edit-select" onChange={(e) => setEditState({ ...editState, condition: e.target.value as AlertCondition })} value={editState.condition}>
                            <option value="above">Above target</option>
                            <option value="below">Below target</option>
                          </select>
                        </label>
                        <label className="alert-edit-field">
                          <span className="alert-edit-label">Target price</span>
                          <input className="alert-edit-input" inputMode="decimal" min="0" onChange={(e) => setEditState({ ...editState, targetPrice: e.target.value })} step="0.01" type="number" value={editState.targetPrice} />
                        </label>
                      </div>
                      <div className="alert-row-actions">
                        <button className="primary-action alert-inline-button" disabled={isSaving} onClick={() => void saveEdit()} type="button">{isSaving ? 'Saving...' : 'Save'}</button>
                        <button className="ghost-action alert-inline-button" disabled={isSaving} onClick={cancelEditing} type="button">Cancel</button>
                      </div>
                    </article>
                  )
                }

                return (
                  <article
                    className={`alert-row alert-row--uniform ${onBulkAction ? 'alert-row--selectable' : ''} ${isUrgent ? 'alert-row--urgent' : ''}`.trim()}
                    key={alert.id}
                  >
                    {onBulkAction ? (
                      <label className="alert-row-checkbox">
                        <input checked={selectedIds.has(alert.id)} onChange={() => toggleSelection(alert.id)} type="checkbox" />
                      </label>
                    ) : null}
                    <div className="alert-row-head">
                      <div className="alert-row-meta">
                        <strong>{alert.symbol} · {formatCondition(alert.condition)}</strong>
                        <p>{formatAlertTarget(alert)}</p>
                        <p className="alert-row-time">
                          {expires ? `${expires} · ` : ''}
                          Waiting for live price confirmation.
                        </p>
                      </div>
                      <div className="alert-row-pills">
                        {isUrgent ? <span className="negative-pill">Urgent</span> : null}
                        <span className="neutral-pill">Waiting</span>
                      </div>
                    </div>
                    <div className="alert-row-actions">
                      {onUpdateAlert ? (
                        <button className="ghost-action alert-inline-button" disabled={isPausing || isDeleting} onClick={() => startEditing(alert.id, alert.condition, alert.targetPrice)} type="button">Edit</button>
                      ) : null}
                      <button className="ghost-action alert-inline-button" disabled={isPausing || isDeleting} onClick={() => void onPauseAlert(alert.id)} type="button">{isPausing ? 'Pausing...' : 'Pause'}</button>
                      <button className="ghost-action alert-inline-button" disabled={isDeleting || isPausing} onClick={() => void onDeleteAlert(alert.id)} type="button">{isDeleting ? 'Deleting...' : 'Delete'}</button>
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
                  const isDeleting = pendingActionId === alert.id && pendingAction === 'delete'
                  const isResuming = pendingActionId === alert.id && pendingAction === 'resume'

                  return (
                    <article
                      className={`alert-row alert-row--uniform alert-row--paused ${onBulkAction ? 'alert-row--selectable' : ''}`.trim()}
                      key={alert.id}
                    >
                      {onBulkAction ? (
                        <label className="alert-row-checkbox">
                          <input checked={selectedIds.has(alert.id)} onChange={() => toggleSelection(alert.id)} type="checkbox" />
                        </label>
                      ) : null}
                      <div className="alert-row-head">
                        <div className="alert-row-meta">
                          <strong>{alert.symbol} · {formatCondition(alert.condition)}</strong>
                          <p>{formatAlertTarget(alert)}</p>
                          <p className="alert-row-time">Alert paused — not being evaluated.</p>
                        </div>
                        <span className="warning-pill">Paused</span>
                      </div>
                      <div className="alert-row-actions">
                        <button className="primary-action alert-inline-button" disabled={isResuming || isDeleting} onClick={() => void onResumeAlert(alert.id)} type="button">{isResuming ? 'Resuming...' : 'Resume'}</button>
                        <button className="ghost-action alert-inline-button" disabled={isDeleting || isResuming} onClick={() => void onDeleteAlert(alert.id)} type="button">{isDeleting ? 'Deleting...' : 'Delete'}</button>
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
                const isDeleting = pendingActionId === alert.id && pendingAction === 'delete'
                const isResetting = pendingActionId === alert.id && pendingAction === 'reset'
                const isExpanded = expandedHistoryId === alert.id

                return (
                  <article
                    className={`alert-row alert-row--uniform ${onBulkAction ? 'alert-row--selectable' : ''}`.trim()}
                    key={alert.id}
                  >
                    {onBulkAction ? (
                      <label className="alert-row-checkbox">
                        <input checked={selectedIds.has(alert.id)} onChange={() => toggleSelection(alert.id)} type="checkbox" />
                      </label>
                    ) : null}
                    <div className="alert-row-head">
                      <div className="alert-row-meta">
                        <strong>{alert.symbol} · {formatCondition(alert.condition)}</strong>
                        <p>{formatAlertTarget(alert)}</p>
                        <p className="alert-row-time">Triggered {formatDateTime(alert.triggeredAt)}</p>
                      </div>
                      <span className="positive-pill">Triggered</span>
                    </div>
                    <div className="alert-row-actions">
                      {token ? (
                        <button className="ghost-action alert-inline-button" onClick={() => void toggleHistory(alert.id)} type="button">
                          {isExpanded ? 'Hide history' : 'History'}
                        </button>
                      ) : null}
                      <button className="primary-action alert-inline-button" disabled={isResetting || isDeleting} onClick={() => void onResetAlert(alert.id)} type="button">{isResetting ? 'Resetting...' : 'Reset'}</button>
                      <button className="ghost-action alert-inline-button" disabled={isDeleting || isResetting} onClick={() => void onDeleteAlert(alert.id)} type="button">{isDeleting ? 'Deleting...' : 'Delete'}</button>
                    </div>
                    {isExpanded ? (
                      <div className="alert-history-panel">
                        {isLoadingHistory ? (
                          <p className="alert-history-loading">Loading history...</p>
                        ) : historyEvents.length > 0 ? (
                          <ul className="alert-history-list">
                            {historyEvents.map((event) => (
                              <li className="alert-history-item" key={event.id}>
                                <span className="alert-history-price">
                                  Triggered at {formatCurrency(event.triggerPrice)}
                                </span>
                                <span className="alert-history-time">
                                  {formatDateTime(event.triggeredAt)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="alert-history-empty">No trigger history recorded yet.</p>
                        )}
                      </div>
                    ) : null}
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
