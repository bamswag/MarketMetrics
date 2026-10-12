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
  const isChartReady = item.chartReady !== false
  const trackedLabel = new Date(item.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })

  return (
    <article
      className={`tracked-symbol-card tracked-symbol-card--${variant} instrument-surface instrument-surface--${tone}`}
      data-scroll-item
      data-scroll-tone={tone}
    >
      {isChartReady ? (
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
      ) : (
        <div className="tracked-symbol-card-link tracked-symbol-card-link--unavailable">
          <div className="tracked-symbol-card-head">
            <div className="tracked-symbol-card-brand">
              <MoverLogo symbol={item.symbol} />
              <div className="tracked-symbol-card-copy">
                <strong className="tracked-symbol-card-symbol">{item.symbol}</strong>
                <span className="tracked-symbol-card-meta">Chart unavailable</span>
              </div>
            </div>
          </div>
          <span className="tracked-symbol-card-meta">
            {item.unavailableReason ?? 'This instrument does not have enough usable history yet.'}
          </span>
        </div>
      )}

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
