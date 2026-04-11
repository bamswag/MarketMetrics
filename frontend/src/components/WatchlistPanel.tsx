import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import type { WatchlistItemDetailedOut } from '../lib/api'
import { formatCurrency } from '../lib/formatters'

type WatchlistPanelProps = {
  watchlist: WatchlistItemDetailedOut[]
  onAddSymbol: (symbol: string) => Promise<void>
  onRemoveSymbol: (symbol: string) => Promise<void>
}

export function WatchlistPanel({
  watchlist,
  onAddSymbol,
  onRemoveSymbol,
}: WatchlistPanelProps) {
  const [watchlistSymbol, setWatchlistSymbol] = useState('')
  const [watchlistActionError, setWatchlistActionError] = useState('')
  const [watchlistActionSuccess, setWatchlistActionSuccess] = useState('')
  const [isUpdatingWatchlist, setIsUpdatingWatchlist] = useState(false)
  const [removingSymbol, setRemovingSymbol] = useState('')

  async function handleAddWatchlistItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedSymbol = watchlistSymbol.trim().toUpperCase()

    if (!normalizedSymbol) {
      setWatchlistActionError('Enter a ticker symbol to add to your watchlist.')
      return
    }

    setWatchlistActionError('')
    setWatchlistActionSuccess('')
    setIsUpdatingWatchlist(true)

    try {
      await onAddSymbol(normalizedSymbol)
      setWatchlistSymbol('')
      setWatchlistActionSuccess(`${normalizedSymbol} was added to your watchlist.`)
    } catch (error) {
      setWatchlistActionError(
        error instanceof Error ? error.message : 'Unable to add symbol to watchlist.',
      )
    } finally {
      setIsUpdatingWatchlist(false)
    }
  }

  async function handleRemove(symbol: string) {
    setWatchlistActionError('')
    setWatchlistActionSuccess('')
    setRemovingSymbol(symbol)

    try {
      await onRemoveSymbol(symbol)
      setWatchlistActionSuccess(`${symbol} was removed from your watchlist.`)
    } catch (error) {
      setWatchlistActionError(
        error instanceof Error ? error.message : 'Unable to remove symbol from watchlist.',
      )
    } finally {
      setRemovingSymbol('')
    }
  }

  return (
    <article className="panel panel-wide watchlist-panel">
      <div className="panel-header">
        <div className="panel-header-copy">
          <p className="section-label">Watchlist</p>
          <h2 className="panel-title">Build a sharper list of symbols worth revisiting</h2>
        </div>
        <span className="panel-tag">{watchlist.length} tracked</span>
      </div>

      <form className="watchlist-form" onSubmit={handleAddWatchlistItem}>
        <input
          className="search-input"
          onChange={(event) => setWatchlistSymbol(event.target.value.toUpperCase())}
          placeholder="Add ticker like AAPL or NVDA"
          type="text"
          value={watchlistSymbol}
        />
        <button className="search-button" disabled={isUpdatingWatchlist} type="submit">
          {isUpdatingWatchlist ? 'Adding...' : 'Add symbol'}
        </button>
      </form>

      <p className="panel-note">
        Keep the list tight. The goal is quick access to the charts and alerts that actually matter.
      </p>
      {watchlistActionSuccess ? <p className="success-text">{watchlistActionSuccess}</p> : null}
      {watchlistActionError ? <p className="error-text">{watchlistActionError}</p> : null}

      <div className="watchlist-grid">
        {watchlist.length > 0 ? (
          watchlist.map((item) => {
            const quotePrice = item.latestQuote?.price
            const hasPrice = quotePrice !== null && quotePrice !== undefined
            const changePercent = item.latestQuote?.changePercent ?? '--'
            const pillClassName = changePercent.startsWith('-')
              ? 'negative-pill'
              : changePercent === '--'
                ? 'neutral-pill'
                : 'positive-pill'

            return (
              <article className="watchlist-card" key={item.id}>
                <div className="watchlist-card-top">
                  <div>
                    <p className="section-label">{item.symbol}</p>
                    <strong className="watchlist-price">
                      {hasPrice
                        ? formatCurrency(quotePrice)
                        : item.latestQuote?.unavailableReason ?? 'Quote unavailable'}
                    </strong>
                  </div>

                  <div className="watchlist-card-actions">
                    <Link className="inline-link" to={`/instrument/${item.symbol}`}>
                      Open chart
                    </Link>
                    <button
                      className="watchlist-remove"
                      disabled={removingSymbol === item.symbol}
                      onClick={() => void handleRemove(item.symbol)}
                      type="button"
                    >
                      {removingSymbol === item.symbol ? 'Removing...' : 'Remove'}
                    </button>
                  </div>
                </div>

                <div className="watchlist-meta">
                  <span className={pillClassName}>{changePercent}</span>
                  <span className="watchlist-alert-chip">
                    {item.alerts.activeAlerts} active alerts
                  </span>
                </div>

                <p className="watchlist-note">
                  {item.latestQuote?.latestTradingDay
                    ? `Latest trading day: ${item.latestQuote.latestTradingDay}`
                    : item.latestQuote?.unavailableReason ?? 'Waiting for quote data.'}
                </p>
              </article>
            )
          })
        ) : (
          <div className="empty-state">
            Your watchlist is empty. Add a strong candidate above, then jump straight into its
            dedicated chart page.
          </div>
        )}
      </div>
    </article>
  )
}
