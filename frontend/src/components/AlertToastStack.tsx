import { formatCurrency, formatDateTime } from '../lib/formatters'
import type { AlertCondition, AlertSeverity } from '../lib/api'

export type AlertToast = {
  id: string
  symbol: string
  condition: AlertCondition
  targetPrice: number | null
  severity?: AlertSeverity | null
  triggeredAt?: string | null
}

type AlertToastStackProps = {
  onDismiss: (toastId: string) => void
  toasts: AlertToast[]
}

function formatCondition(condition: AlertCondition) {
  if (condition === 'above') return 'above'
  if (condition === 'below') return 'below'
  if (condition === 'percent_change') return 'by'
  if (condition === 'range_exit') return 'outside range of'
  return condition
}

function formatPercentThreshold(value: number): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`
}

function formatToastTarget(condition: AlertCondition, targetPrice: number | null): string {
  if (targetPrice == null) {
    return ''
  }

  if (condition === 'percent_change') {
    return formatPercentThreshold(targetPrice)
  }

  return formatCurrency(targetPrice)
}

function formatToastTitle(toast: AlertToast): string {
  if (toast.condition === 'range_exit') {
    return `${toast.symbol} moved outside its alert range`
  }

  return `${toast.symbol} moved ${formatCondition(toast.condition)} ${formatToastTarget(toast.condition, toast.targetPrice)}`.trim()
}

export function AlertToastStack({ onDismiss, toasts }: AlertToastStackProps) {
  if (toasts.length === 0) {
    return null
  }

  return (
    <div aria-live="assertive" className="alert-toast-stack">
      {toasts.map((toast) => {
        const isUrgent = toast.severity === 'urgent'

        return (
          <article
            className={`alert-toast ${isUrgent ? 'alert-toast--urgent' : ''}`}
            key={toast.id}
          >
            <div className="alert-toast-copy">
              <p className="section-label">
                {isUrgent ? 'Urgent alert triggered' : 'Alert triggered'}
              </p>
              <strong className="alert-toast-title">
                {formatToastTitle(toast)}
              </strong>
              <p className="alert-toast-meta">
                Threshold hit {formatDateTime(toast.triggeredAt)}.
              </p>
            </div>

            <button
              aria-label={`Dismiss alert notification for ${toast.symbol}`}
              className="alert-toast-dismiss"
              onClick={() => onDismiss(toast.id)}
              type="button"
            >
              Dismiss
            </button>
          </article>
        )
      })}
    </div>
  )
}
