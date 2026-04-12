import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import type { WatchlistItemDetailedOut } from '../lib/api'
import { TrackedSymbolCard } from '../components/TrackedSymbolCard'
import '../styles/pages/TrackedSymbolsPage.css'

type TrackedSymbolsPageProps = {
  isLoading: boolean
  onRemoveSymbol: (symbol: string) => Promise<void>
  trackedSymbols: WatchlistItemDetailedOut[]
}

export function TrackedSymbolsPage({
  isLoading,
  onRemoveSymbol,
  trackedSymbols,
}: TrackedSymbolsPageProps) {
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')
  const [removingSymbol, setRemovingSymbol] = useState('')

  const { sortedTrackedSymbols, positiveCount, negativeCount, newestTrackedSymbol } = useMemo(() => {
    const sorted = [...trackedSymbols].sort(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    )

    let positives = 0
    let negatives = 0
    for (const item of sorted) {
      const changePercent = item.latestQuote?.changePercent ?? ''
      if (changePercent.startsWith('-')) {
        negatives += 1
      } else if (changePercent.startsWith('+') || changePercent !== '--') {
        positives += 1
      }
    }

    return {
      sortedTrackedSymbols: sorted,
      positiveCount: positives,
      negativeCount: negatives,
      newestTrackedSymbol: sorted[0],
    }
  }, [trackedSymbols])

  async function handleRemoveSymbol(symbol: string) {
    setActionError('')
    setActionSuccess('')
    setRemovingSymbol(symbol)

    try {
      await onRemoveSymbol(symbol)
      setActionSuccess(`${symbol} was removed from tracked symbols.`)
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Unable to update tracked symbols right now.',
      )
    } finally {
      setRemovingSymbol('')
    }
  }

  return (
    <section className="profile-page page-section tracked-symbols-page">
      <div className="tracked-symbols-page-hero">
        <div className="tracked-symbols-page-head">
          <div className="panel-header-copy">
            <p className="section-label">Tracked symbols</p>
            <h1 className="tracked-symbols-page-title">
              Your live watch board, organized for faster chart review.
            </h1>
          </div>
          <p className="tracked-symbols-page-copy">
            Keep every tracked name in one place, trim the list quickly, and jump straight back
            into live charts whenever your focus changes.
          </p>
          <div className="tracked-symbols-page-tags">
            <span className="dashboard-tag">Newest first</span>
            <span className="dashboard-tag">One-tap chart access</span>
            <span className="dashboard-tag">Live price context</span>
          </div>
        </div>

        <article className="panel tracked-symbols-side-panel">
          <div className="panel-header">
            <div className="panel-header-copy">
              <p className="section-label">Tracked now</p>
              <h2 className="panel-title">Your active symbols</h2>
            </div>

            <span className="panel-tag">{sortedTrackedSymbols.length} total</span>
          </div>

          {actionSuccess ? <p className="success-text">{actionSuccess}</p> : null}
          {actionError ? <p className="error-text">{actionError}</p> : null}

          {isLoading && sortedTrackedSymbols.length === 0 ? (
            <p className="empty-state">Loading your tracked symbols...</p>
          ) : null}

          {!isLoading && sortedTrackedSymbols.length === 0 ? (
            <div className="empty-state tracked-symbols-empty tracked-symbols-empty--page">
              <strong>No tracked stocks yet.</strong>
              <p>Open a stock page and choose <strong>Track symbol</strong>.</p>
              <Link className="inline-link" to="/dashboard">
                Search the market
              </Link>
            </div>
          ) : null}

          {sortedTrackedSymbols.length > 0 ? (
            <div className="tracked-symbols-side-grid">
              {sortedTrackedSymbols.map((item) => (
                <TrackedSymbolCard
                  actionLabel="Untrack"
                  isActionPending={removingSymbol === item.symbol}
                  item={item}
                  key={item.id}
                  onAction={handleRemoveSymbol}
                  variant="preview"
                />
              ))}
            </div>
          ) : null}
        </article>
      </div>

      <article className="panel panel-wide tracked-symbols-page-panel">
        <div className="panel-header">
          <div className="panel-header-copy">
            <p className="section-label">Tracking data</p>
            <h2 className="panel-title">Daily read on your tracked list</h2>
          </div>

          <div className="tracked-symbols-page-actions">
            <span className="panel-tag">{sortedTrackedSymbols.length} total</span>
            <Link className="ghost-action" to="/dashboard">
              Back to dashboard
            </Link>
          </div>
        </div>

        <p className="panel-note tracked-symbols-page-note">
          A quick read on how your tracked symbols are behaving today.
        </p>

        <div className="tracked-symbols-summary-grid">
          <article className="tracked-symbols-summary-card tracked-symbols-summary-card--accent">
            <span className="metric-label">Total tracked</span>
            <strong className="metric-value">{sortedTrackedSymbols.length}</strong>
            <p>Names pinned for quick return visits.</p>
          </article>
          <article className="tracked-symbols-summary-card">
            <span className="metric-label">Positive today</span>
            <strong className="metric-value">{positiveCount}</strong>
            <p>Tracked names currently in green.</p>
          </article>
          <article className="tracked-symbols-summary-card">
            <span className="metric-label">Negative today</span>
            <strong className="metric-value">{negativeCount}</strong>
            <p>Tracked names currently in red.</p>
          </article>
          <article className="tracked-symbols-summary-card">
            <span className="metric-label">Newest tracked</span>
            <strong className="metric-value">
              {newestTrackedSymbol ? newestTrackedSymbol.symbol : '--'}
            </strong>
            <p>{newestTrackedSymbol ? 'Most recent addition.' : 'Waiting for your next pick.'}</p>
          </article>
        </div>
      </article>
    </section>
  )
}
