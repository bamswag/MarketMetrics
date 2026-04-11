import { Link } from 'react-router-dom'

import type { WatchlistItemDetailedOut } from '../lib/api'
import { formatCurrency } from '../lib/formatters'
import { MoverLogo } from './MoverLogo'

type TrackedSymbolCardProps = {
  actionLabel?: string
  isActionPending?: boolean
  item: WatchlistItemDetailedOut
  onAction?: (symbol: string) => Promise<void> | void
  variant?: 'preview' | 'page'
}

function resolvePillClass(changePercent?: string | null) {
  if (!changePercent || changePercent === '--') {
    return 'neutral-pill'
  }

  return changePercent.startsWith('-') ? 'negative-pill' : 'positive-pill'
}

export function TrackedSymbolCard({
  actionLabel,
  isActionPending = false,
  item,
  onAction,
  variant = 'preview',
}: TrackedSymbolCardProps) {
  const quotePrice = item.latestQuote?.price
  const changePercent = item.latestQuote?.changePercent ?? '--'
  const pillClassName = resolvePillClass(changePercent)
  const hasPrice = quotePrice !== null && quotePrice !== undefined
  const trackedLabel = new Date(item.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })

  return (
    <article className={`tracked-symbol-card tracked-symbol-card--${variant}`}>
      <Link className="tracked-symbol-card-link" to={`/instrument/${item.symbol}`}>
        <div className="tracked-symbol-card-head">
          <div className="tracked-symbol-card-brand">
            <MoverLogo symbol={item.symbol} />
            <div className="tracked-symbol-card-copy">
              <strong className="tracked-symbol-card-symbol">{item.symbol}</strong>
              {variant === 'page' ? (
                <span className="tracked-symbol-card-meta">Tracked {trackedLabel}</span>
              ) : null}
            </div>
          </div>

          <span className={pillClassName}>{changePercent}</span>
        </div>

        <strong className="tracked-symbol-card-price">
          {hasPrice
            ? formatCurrency(quotePrice)
            : item.latestQuote?.unavailableReason ?? 'Price unavailable'}
        </strong>
      </Link>

      {onAction && actionLabel ? (
        <div className="tracked-symbol-card-actions">
          <button
            className="watchlist-remove tracked-symbol-card-action"
            disabled={isActionPending}
            onClick={() => void onAction(item.symbol)}
            type="button"
          >
            {isActionPending ? 'Updating...' : actionLabel}
          </button>
        </div>
      ) : null}
    </article>
  )
}
