import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

import { SearchResultCard } from '../components/SearchResultCard'
import { TopResultCard } from '../components/TopResultCard'
import type { CompanySearchResult } from '../lib/api'
import { createWatchlistItem, fetchSearchResults } from '../lib/api'
import { assetCategoryLabel } from '../lib/marketPreferences'
import '../styles/pages/SearchResultsPage.css'

type CategoryFilter = 'all' | 'stocks' | 'crypto' | 'etfs'

const PAGE_SIZE = 18

type SearchResultsPageProps = {
  token?: string
  trackedSymbols?: string[]
  onUnauthorized?: (message: string) => void
}

export function SearchResultsPage({
  token,
  trackedSymbols = [],
  onUnauthorized,
}: SearchResultsPageProps) {
  const { query: rawQuery = '' } = useParams<{ query: string }>()
  const query = decodeURIComponent(rawQuery).toUpperCase()

  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all')
  const [allResults, setAllResults] = useState<CompanySearchResult[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [pageIndex, setPageIndex] = useState(1)
  const [addingSymbol, setAddingSymbol] = useState<string | null>(null)
  const [addedSymbols, setAddedSymbols] = useState<Set<string>>(new Set())

  // Fetch results when query changes
  useEffect(() => {
    if (!query) return
    const abortController = new AbortController()
    let cancelled = false
    setIsLoading(true)
    setError('')
    setPageIndex(1)

    fetchSearchResults(token, query, abortController.signal)
      .then((res) => {
        if (!cancelled) {
          setAllResults(res.results)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Search failed. Please try again.')
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
      abortController.abort()
    }
  }, [query, token])

  // Reset pagination when category changes
  useEffect(() => {
    setPageIndex(1)
  }, [activeCategory])

  // Group results by asset category
  const resultsByCategory = useMemo(() => {
    const groups: Record<string, CompanySearchResult[]> = {
      stocks: [],
      crypto: [],
      etfs: [],
      other: [],
    }
    for (const result of allResults) {
      const cat = result.assetCategory ?? 'other'
      if (cat in groups) groups[cat].push(result)
      else groups.other.push(result)
    }
    return groups
  }, [allResults])

  // Filtered + paginated results for specific category tabs
  const filteredResults = useMemo(() => {
    if (activeCategory === 'all') return allResults
    return resultsByCategory[activeCategory] ?? []
  }, [activeCategory, allResults, resultsByCategory])

  const displayedResults = filteredResults.slice(0, pageIndex * PAGE_SIZE)
  const hasMore = displayedResults.length < filteredResults.length

  // Category counts for tab badges
  const counts: Record<CategoryFilter, number> = {
    all: allResults.length,
    stocks: resultsByCategory.stocks.length,
    crypto: resultsByCategory.crypto.length,
    etfs: resultsByCategory.etfs.length,
  }

  const trackedSet = useMemo(
    () => new Set([...trackedSymbols, ...addedSymbols]),
    [trackedSymbols, addedSymbols],
  )

  async function handleAddWatchlist(symbol: string) {
    if (!token) {
      onUnauthorized?.('Sign in to add symbols to your watchlist.')
      return
    }
    setAddingSymbol(symbol)
    try {
      await createWatchlistItem(token, symbol)
      setAddedSymbols((prev) => new Set([...prev, symbol]))
    } catch {
      // silent fail — user can try again
    } finally {
      setAddingSymbol(null)
    }
  }

  const TABS: { key: CategoryFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'stocks', label: assetCategoryLabel('stocks') },
    { key: 'crypto', label: assetCategoryLabel('crypto') },
    { key: 'etfs', label: assetCategoryLabel('etfs') },
  ]

  function renderGrid(items: CompanySearchResult[]) {
    return (
      <div className="search-results-grid">
        {items.map((result) => (
          <SearchResultCard
            isAddingWatchlist={addingSymbol === result.symbol}
            isTracked={trackedSet.has(result.symbol)}
            key={result.symbol}
            onAddWatchlist={handleAddWatchlist}
            result={result}
            token={token}
          />
        ))}
      </div>
    )
  }

  function renderGroupedSections() {
    const sections: { key: string; label: string; items: CompanySearchResult[] }[] = [
      { key: 'stocks', label: 'Stocks', items: resultsByCategory.stocks },
      { key: 'crypto', label: 'Crypto', items: resultsByCategory.crypto },
      { key: 'etfs', label: 'ETFs', items: resultsByCategory.etfs },
    ].filter((s) => s.items.length > 0)

    if (sections.length === 0) return null

    return (
      <div className="search-results-sections">
        {sections.map((section) => {
          const preview = section.items.slice(0, PAGE_SIZE)
          const hasMoreInSection = section.items.length > PAGE_SIZE
          const catKey = section.key as CategoryFilter
          return (
            <div className="search-results-section" key={section.key}>
              <div className="search-results-section-header">
                <h2 className="search-results-section-title">
                  {section.label}
                  <span className="search-results-section-count">{section.items.length}</span>
                </h2>
                {hasMoreInSection && (
                  <button
                    className="search-results-section-more ghost-action"
                    onClick={() => setActiveCategory(catKey)}
                    type="button"
                  >
                    View all {section.label} →
                  </button>
                )}
              </div>
              {renderGrid(preview)}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="search-results-shell">
      {/* Sticky header — tabs only; search input lives in the AppHeader */}
      <div className="search-results-header">
        <div className="search-results-header-inner page-section">
          {/* Category tabs */}
          <div className="search-results-tabs" role="tablist">
            {TABS.filter((t) => t.key === 'all' || counts[t.key] > 0).map((tab) => (
              <button
                aria-selected={activeCategory === tab.key}
                className={`search-results-tab${activeCategory === tab.key ? ' is-active' : ''}`}
                key={tab.key}
                onClick={() => setActiveCategory(tab.key)}
                role="tab"
                type="button"
              >
                {tab.label}
                {counts[tab.key] > 0 && (
                  <span className="search-results-tab-count">{counts[tab.key]}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="search-results-body page-section">
        {error && (
          <p className="error-text">{error}</p>
        )}

        {!isLoading && !error && allResults.length === 0 && (
          <div className="search-results-empty">
            <p className="search-results-empty-icon" aria-hidden="true">⌕</p>
            <p className="search-results-empty-title">No results for "{query}"</p>
            <p className="search-results-empty-sub">
              Try a different symbol or company name.
            </p>
          </div>
        )}

        {/* Skeleton loading */}
        {isLoading && (
          <>
            <div className="top-result-card top-result-card--skeleton instrument-surface">
              <div className="top-result-eyebrow">
                <span className="search-result-skeleton" style={{ width: 80, height: 20, borderRadius: 999 }} />
              </div>
              <div className="top-result-link">
                <div className="top-result-left">
                  <span className="search-result-skeleton search-result-skeleton--logo top-result-skeleton-logo" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span className="search-result-skeleton" style={{ width: 120, height: 28, borderRadius: 6 }} />
                    <span className="search-result-skeleton" style={{ width: 180, height: 14 }} />
                    <span className="search-result-skeleton" style={{ width: 100, height: 12 }} />
                  </div>
                </div>
                <div className="top-result-right">
                  <div className="top-result-stats">
                    <span className="search-result-skeleton top-result-skeleton-price" />
                  </div>
                  <span className="search-result-skeleton" style={{ height: 96, display: 'block', borderRadius: 10 }} />
                </div>
              </div>
            </div>
            <div className="search-results-grid">
              {Array.from({ length: 6 }).map((_, i) => (
                <div className="search-result-card search-result-card--skeleton" key={i}>
                  <div className="search-result-skeleton search-result-skeleton--logo" />
                  <div className="search-result-skeleton search-result-skeleton--title" />
                  <div className="search-result-skeleton search-result-skeleton--meta" />
                  <div className="search-result-skeleton search-result-skeleton--price" />
                </div>
              ))}
            </div>
          </>
        )}

        {/* Top Result hero card (All tab) */}
        {!isLoading && !error && activeCategory === 'all' && allResults.length > 0 && (
          <TopResultCard
            isAddingWatchlist={addingSymbol === allResults[0].symbol}
            isTracked={trackedSet.has(allResults[0].symbol)}
            onAddWatchlist={handleAddWatchlist}
            result={allResults[0]}
            token={token}
          />
        )}

        {/* Grouped sections (All tab) */}
        {!isLoading && !error && activeCategory === 'all' && renderGroupedSections()}

        {/* Top Result hero card (specific category tab) */}
        {!isLoading && !error && activeCategory !== 'all' && filteredResults.length > 0 && (
          <TopResultCard
            isAddingWatchlist={addingSymbol === filteredResults[0].symbol}
            isTracked={trackedSet.has(filteredResults[0].symbol)}
            onAddWatchlist={handleAddWatchlist}
            result={filteredResults[0]}
            token={token}
          />
        )}

        {/* Flat filtered grid (specific category tab) — skip first since it's the Top Result */}
        {!isLoading && !error && activeCategory !== 'all' && (
          <>
            {filteredResults.length === 0 ? (
              <div className="search-results-empty">
                <p className="search-results-empty-title">
                  No {assetCategoryLabel(activeCategory as 'stocks' | 'etfs' | 'crypto')} results for "{query}"
                </p>
              </div>
            ) : filteredResults.length > 1 ? (
              renderGrid(displayedResults.slice(1))
            ) : null}
          </>
        )}

        {/* Load more */}
        {!isLoading && !error && activeCategory !== 'all' && hasMore && (
          <div className="search-results-load-more">
            <button
              className="primary-action"
              onClick={() => setPageIndex((p) => p + 1)}
              type="button"
            >
              Load more results
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
