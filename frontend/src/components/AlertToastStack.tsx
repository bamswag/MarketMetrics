import { formatCurrency, formatDateTime } from '../lib/formatters'
import type { AlertCondition } from '../lib/api'

export type AlertToast = {
  id: string
  symbol: string
  condition: AlertCondition
  targetPrice: number
  triggeredAt?: string | null
}

type AlertToastStackProps = {
  onDismiss: (toastId: string) => void
  toasts: AlertToast[]
}

function formatCondition(condition: AlertCondition) {
  return condition === 'above' ? 'above' : 'below'
}

export function AlertToastStack({ onDismiss, toasts }: AlertToastStackProps) {
  if (toasts.length === 0) {
    return null
  }

  return (
    <div aria-live="assertive" className="alert-toast-stack">
      {toasts.map((toast) => (
        <article className="alert-toast" key={toast.id}>
          <div className="alert-toast-copy">
            <p className="section-label">Alert triggered</p>
            <strong className="alert-toast-title">
              {toast.symbol} moved {formatCondition(toast.condition)}{' '}
              {formatCurrency(toast.targetPrice)}
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
      ))}
    </div>
  )
}
