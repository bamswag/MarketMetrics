import type { AlertListResponse } from '../lib/api'
import { formatCurrency, formatDateTime } from '../lib/formatters'

type AlertsPanelProps = {
  alerts: AlertListResponse | null
  isLoading: boolean
}

export function AlertsPanel({ alerts, isLoading }: AlertsPanelProps) {
  const activeAlerts = alerts?.activeAlerts.slice(0, 4) ?? []
  const triggeredAlerts = alerts?.triggeredAlerts.slice(0, 4) ?? []

  return (
    <article className="panel panel-wide">
      <div className="panel-header">
        <div className="panel-header-copy">
          <p className="section-label">Alerts and activity</p>
          <h2 className="panel-title">Monitor what matters without losing context</h2>
        </div>
        <span className="panel-tag">
          {alerts ? `${alerts.totalCount} total` : isLoading ? 'Loading' : 'Idle'}
        </span>
      </div>

      <div className="alerts-summary-grid">
        <div className="metric-card">
          <span className="metric-label">Active rules</span>
          <strong className="metric-value">{alerts?.activeCount ?? '--'}</strong>
          <p>Price rules currently waiting for a threshold to hit.</p>
        </div>
        <div className="metric-card">
          <span className="metric-label">Triggered events</span>
          <strong className="metric-value">{alerts?.triggeredCount ?? '--'}</strong>
          <p>Rules that have already fired and are ready for review.</p>
        </div>
      </div>

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
              activeAlerts.map((alert) => (
                <article className="alert-row" key={alert.id}>
                  <div className="alert-row-meta">
                    <strong>
                      {alert.symbol} · {alert.condition}
                    </strong>
                    <p>{formatCurrency(alert.targetPrice)}</p>
                  </div>
                  <span className="neutral-pill">Waiting</span>
                </article>
              ))
            ) : (
              <p className="empty-state">No active alerts yet.</p>
            )}
          </div>

          <div className="alerts-column">
            <div className="panel-header-copy">
              <p className="section-label">Triggered</p>
              <h3 className="subsection-title">Recent signals</h3>
            </div>

            {triggeredAlerts.length > 0 ? (
              triggeredAlerts.map((alert) => (
                <article className="alert-row" key={alert.id}>
                  <div className="alert-row-meta">
                    <strong>
                      {alert.symbol} · {alert.condition}
                    </strong>
                    <p>{formatCurrency(alert.targetPrice)}</p>
                    <p className="alert-row-time">{formatDateTime(alert.triggeredAt)}</p>
                  </div>
                  <span className="positive-pill">Triggered</span>
                </article>
              ))
            ) : (
              <p className="empty-state">Triggered alerts will appear here once they fire.</p>
            )}
          </div>
        </div>
      )}
    </article>
  )
}
