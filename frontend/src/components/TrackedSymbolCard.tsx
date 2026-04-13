import { Link } from 'react-router-dom'

import { useMarketPreferences } from '../app/MarketPreferencesContext'
import type { WatchlistItemDetailedOut } from '../lib/api'
import {
  formatCurrencyWithPreferences,
  formatPriceChangeWithPreferences,
} from '../lib/marketDisplay'
import {
  resolveInstrumentTone,
  resolveInstrumentTonePillClass,
} from '../lib/instrumentTone'
import { MoverLogo } from './MoverLogo'

type TrackedSymbolCardProps = {
  actionLabel?: string
  isActionPending?: boolean
  item: WatchlistItemDetailedOut
  onAction?: (symbol: string) => Promise<void> | void
  variant?: 'preview' | 'page'
}

export function TrackedSymbolCard({
  actionLabel,
  isActionPending = false,
  item,
  onAction,
  variant = 'preview',
}: TrackedSymbolCardProps) {
  const { preferences } = useMarketPreferences()
  const quotePrice = item.latestQuote?.price
  const quoteChange = item.latestQuote?.change
  const changePercent = item.latestQuote?.changePercent ?? '--'
  const tone = resolveInstrumentTone(changePercent)
  const pillClassName = resolveInstrumentTonePillClass(tone)
  const changeDisplay = formatPriceChangeWithPreferences(
    { change: quoteChange, changePercent },
    preferences,
  )
  const hasPrice = quotePrice !== null && quotePrice !== undefined
  const trackedLabel = new Date(item.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })

  return (
    <article
      className={`tracked-symbol-card tracked-symbol-card--${variant} instrument-surface instrument-surface--${tone}`}
    >
      <Link
        className="tracked-symbol-card-link"
        to={`/instrument/${encodeURIComponent(item.symbol)}`}
      >
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

          <span className={pillClassName}>{changeDisplay}</span>
        </div>

        <strong className="tracked-symbol-card-price">
          {hasPrice
            ? formatCurrencyWithPreferences(quotePrice, preferences)
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
