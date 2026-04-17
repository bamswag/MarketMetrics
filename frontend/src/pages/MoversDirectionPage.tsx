import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { DailyMoverCard, DEFAULT_MOVER_CATEGORIES } from '../components/DailyMoverCard'
import { ApiError, fetchPublicMovers } from '../lib/api'
import type { Mover, MoversByCategory, MoversResponse } from '../lib/api'
import { assetCategoryLabel } from '../lib/marketPreferences'
import '../styles/pages/MoversDirectionPage.css'

type MoversDirection = 'gainers' | 'losers'
type MoversCategoryFilter = 'all' | keyof MoversByCategory

type MoversDirectionPageProps = {
  direction: MoversDirection
  token?: string
}

type MoversPageConfig = {
  cardSubtitle: string
  cardTitle: string
  copy: string
  eyebrow: string
  oppositeCta: string
  oppositePath: string
  pageTitle: string
  tone: 'positive' | 'negative'
}

const INITIAL_MOVERS_LIMIT = 10
const MOVERS_LIMIT_STEP = 10
const MAX_MOVERS_LIMIT = 30

const PAGE_CONFIG: Record<MoversDirection, MoversPageConfig> = {
  gainers: {
    cardSubtitle: 'Top 10 gainers',
    cardTitle: 'The strongest names by asset class',
    copy:
      'A focused read on the biggest positive daily movers across stocks, crypto, and ETFs, grouped so you can compare leadership inside each asset class.',
    eyebrow: 'Daily gainers',
    oppositeCta: 'View losers',
    oppositePath: '/movers/losers',
    pageTitle: "Today's market leaders",
    tone: 'positive',
  },
  losers: {
    cardSubtitle: 'Top 10 losers',
    cardTitle: 'The weakest names by asset class',
    copy:
      'A focused read on the sharpest negative daily movers across stocks, crypto, and ETFs, grouped so you can compare weakness inside each asset class.',
    eyebrow: 'Daily losers',
    oppositeCta: 'View gainers',
    oppositePath: '/movers/gainers',
    pageTitle: "Today's market laggards",
    tone: 'negative',
  },
}

export function MoversDirectionPage({ direction, token }: MoversDirectionPageProps) {
  const config = PAGE_CONFIG[direction]
  const [movers, setMovers] = useState<MoversResponse | null>(null)
  const [activeCategory, setActiveCategory] = useState<MoversCategoryFilter>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)
  const [limit, setLimit] = useState(INITIAL_MOVERS_LIMIT)
  const [requestedLimit, setRequestedLimit] = useState(INITIAL_MOVERS_LIMIT)

  useEffect(() => {
    const abortController = new AbortController()
    let cancelled = false
    const nextLimit = requestedLimit
    const isInitialLoad = !movers

    setIsLoading(isInitialLoad)
    setIsLoadingMore(!isInitialLoad)
    setError('')

    fetchPublicMovers(nextLimit, abortController.signal)
      .then((payload) => {
        if (cancelled) {
          return
        }

        setMovers(payload)
        setLimit(nextLimit)
        setLastUpdatedAt(new Date())
      })
      .catch((requestError) => {
        if (cancelled || (requestError instanceof DOMException && requestError.name === 'AbortError')) {
          return
        }

        if (requestError instanceof ApiError && requestError.status === 422 && nextLimit > limit) {
          setRequestedLimit(limit)
          setError(
            'Load more was rejected by the running backend. Restart the backend so the higher movers limit is picked up, then try again.',
          )
          return
        }

        if (!movers) {
          setMovers(null)
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load today's movers right now.",
        )
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
          setIsLoadingMore(false)
        }
      })

    return () => {
      cancelled = true
      abortController.abort()
    }
  }, [direction, limit, movers, requestedLimit])

  useEffect(() => {
    setActiveCategory('all')
    setMovers(null)
    setLimit(INITIAL_MOVERS_LIMIT)
    setRequestedLimit(INITIAL_MOVERS_LIMIT)
    setLastUpdatedAt(null)
    setError('')
  }, [direction])

  const categoryItems =
    direction === 'gainers'
      ? movers?.gainersByCategory
      : movers?.losersByCategory
  const fallbackItems =
    direction === 'gainers'
      ? movers?.gainers.slice(0, limit) ?? []
      : movers?.losers.slice(0, limit) ?? []

  const categoriesWithData = useMemo(() => (
    DEFAULT_MOVER_CATEGORIES.filter(({ key }) => (categoryItems?.[key].length ?? 0) > 0)
  ), [categoryItems])

  const visibleCategories = useMemo(() => {
    const sourceCategories = categoriesWithData.length > 0 ? categoriesWithData : DEFAULT_MOVER_CATEGORIES

    if (activeCategory === 'all') {
      return sourceCategories
    }

    return sourceCategories.filter(({ key }) => key === activeCategory)
  }, [activeCategory, categoriesWithData])

  const loadedItems = useMemo(() => {
    const items: Mover[] = []
    const seen = new Set<string>()

    for (const { key } of categoriesWithData.length > 0 ? categoriesWithData : DEFAULT_MOVER_CATEGORIES) {
      for (const item of categoryItems?.[key] ?? []) {
        const dedupeKey = `${key}:${item.symbol}`
        if (seen.has(dedupeKey)) {
          continue
        }
        seen.add(dedupeKey)
        items.push(item)
      }
    }

    if (items.length > 0) {
      return items
    }

    return fallbackItems
  }, [categoriesWithData, categoryItems, fallbackItems])

  const hasMoverData =
    visibleCategories.some(({ key }) => (categoryItems?.[key].length ?? 0) > 0)
    || fallbackItems.length > 0

  const strongestMover = useMemo(() => {
    if (loadedItems.length === 0) {
      return null
    }

    return loadedItems.reduce<Mover | null>((best, candidate) => {
      const candidateChange = Number.parseFloat(String(candidate.change_percent ?? '').replace('%', ''))
      const bestChange = Number.parseFloat(String(best?.change_percent ?? '').replace('%', ''))

      if (!Number.isFinite(candidateChange)) {
        return best
      }

      if (!best || !Number.isFinite(bestChange)) {
        return candidate
      }

      if (direction === 'gainers') {
        return candidateChange > bestChange ? candidate : best
      }

      return candidateChange < bestChange ? candidate : best
    }, null)
  }, [direction, loadedItems])

  const totalLoadedItems = loadedItems.length
  const categoryCount = categoriesWithData.length || visibleCategories.length
  const updatedLabel = lastUpdatedAt
    ? lastUpdatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null
  const canLoadMore = limit < MAX_MOVERS_LIMIT && !isLoading && !isLoadingMore

  function handleLoadMore() {
    setRequestedLimit((currentLimit) => Math.min(currentLimit + MOVERS_LIMIT_STEP, MAX_MOVERS_LIMIT))
  }

  return (
    <div className={`movers-direction-shell movers-direction-shell--${config.tone}`}>
      <section className={`movers-direction-hero movers-direction-hero--${config.tone} page-section`}>
        <div className="movers-direction-head">
          <p className="section-label">{config.eyebrow}</p>
          <h1 className="movers-direction-title">{config.pageTitle}</h1>
          <p className="movers-direction-copy">{config.copy}</p>

          <div className="dashboard-tag-row">
            <span className="dashboard-tag">Top {limit} per category</span>
            <span className="dashboard-tag">Stocks + Crypto + ETFs</span>
            <span className="dashboard-tag">Latest daily move %</span>
          </div>
        </div>

        <div className="movers-direction-actions">
          <Link className="ghost-action" to={config.oppositePath}>
            {config.oppositeCta}
          </Link>
          <Link className="ghost-action movers-direction-secondary-link" to={token ? '/dashboard' : '/'}>
            {token ? 'Back to dashboard' : 'Back home'}
          </Link>
        </div>
      </section>

      <section className="movers-direction-content page-section">
        <div className="movers-direction-summary-grid">
          <article className="movers-direction-summary-card movers-direction-summary-card--accent">
            <span className="metric-label">Loaded now</span>
            <strong className="metric-value">{totalLoadedItems}</strong>
            <p>Public mover entries currently shown across the board.</p>
          </article>
          <article className="movers-direction-summary-card">
            <span className="metric-label">Asset classes</span>
            <strong className="metric-value">{categoryCount}</strong>
            <p>Separate market groups ranked side by side.</p>
          </article>
          <article className="movers-direction-summary-card">
            <span className="metric-label">Lead symbol</span>
            <strong className="metric-value">{strongestMover?.symbol ?? '--'}</strong>
            <p>
              {strongestMover?.change_percent
                ? `${strongestMover.change_percent} on the latest daily move.`
                : 'Waiting for the next market update.'}
            </p>
          </article>
          <article className="movers-direction-summary-card">
            <span className="metric-label">Updated</span>
            <strong className="metric-value">{updatedLabel ?? '--'}</strong>
            <p>Loaded from the shared public movers feed with no account-specific payload.</p>
          </article>
        </div>

        <div className="movers-direction-toolbar">
          <div className="movers-direction-filter-group" role="tablist" aria-label="Mover category focus">
            <button
              aria-selected={activeCategory === 'all'}
              className={`workspace-toggle${activeCategory === 'all' ? ' is-active' : ''}`}
              onClick={() => setActiveCategory('all')}
              role="tab"
              type="button"
            >
              All
            </button>
            {DEFAULT_MOVER_CATEGORIES.map(({ key }) => (
              <button
                aria-selected={activeCategory === key}
                className={`workspace-toggle${activeCategory === key ? ' is-active' : ''}`}
                key={key}
                onClick={() => setActiveCategory(key)}
                role="tab"
                type="button"
              >
                {assetCategoryLabel(key)}
              </button>
            ))}
          </div>

          <p className="movers-direction-toolbar-note">
            These pages use public market data only, so opening them never exposes account-specific watchlist or alert data.
          </p>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
        {isLoading && !movers ? (
          <p className="empty-state">
            Loading today&apos;s {direction} across stocks, crypto, and ETFs...
          </p>
        ) : null}

        {isLoadingMore && movers ? (
          <p className="panel-note movers-direction-load-note">
            Loading more {direction} while keeping the current board visible...
          </p>
        ) : null}

        {!error && !isLoading && !hasMoverData ? (
          <p className="empty-state movers-direction-empty">
            Daily mover data is available, but there are no {direction} to show right now.
          </p>
        ) : null}

        {movers && hasMoverData ? (
          <DailyMoverCard
            categoryItems={categoryItems}
            className="movers-direction-card"
            countTarget={limit}
            fallbackItems={fallbackItems}
            itemLimit={limit}
            subtitle={config.cardSubtitle}
            title={config.cardTitle}
            tone={config.tone}
            visibleCategories={visibleCategories}
          />
        ) : null}

        {movers && hasMoverData ? (
          <div className="movers-direction-footer">
            <p className="panel-note movers-direction-load-note">
              Showing up to {limit} {direction} per asset class.
            </p>

            {canLoadMore ? (
              <button
                className="primary-action"
                disabled={isLoadingMore}
                onClick={handleLoadMore}
                type="button"
              >
                Load {Math.min(MOVERS_LIMIT_STEP, MAX_MOVERS_LIMIT - limit)} more
              </button>
            ) : (
              <p className="panel-note movers-direction-load-note">
                You&apos;re already viewing the deepest movers set supported on this page.
              </p>
            )}
          </div>
        ) : null}
      </section>
    </div>
  )
}
