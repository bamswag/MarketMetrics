import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useMarketPreferences } from '../app/MarketPreferencesContext'
import {
  ApiError,
  fetchSearchResults,
  prefetchInstrumentDetail,
} from '../lib/api'
import type { CompanySearchResult } from '../lib/api'
import { formatMarketHoursWithPreferences } from '../lib/marketDisplay'
import {
  assetCategoryLabel,
  isAssetCategoryEnabled,
} from '../lib/marketPreferences'

type GlobalSearchProps = {
  token?: string
  onUnauthorized?: (message: string) => void
}

const RECENT_SEARCHES_STORAGE_KEY = 'marketmetrics.recentSearches'

function readRecentSearches(): CompanySearchResult[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const rawValue = window.localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY)
    if (!rawValue) {
      return []
    }

    const parsedValue = JSON.parse(rawValue)
    if (!Array.isArray(parsedValue)) {
      return []
    }

    return parsedValue
      .filter(
        (item): item is CompanySearchResult =>
          typeof item?.symbol === 'string' && typeof item?.name === 'string',
      )
      .slice(0, 2)
  } catch {
    return []
  }
}

function saveRecentSearches(searches: CompanySearchResult[]) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(
    RECENT_SEARCHES_STORAGE_KEY,
    JSON.stringify(searches.slice(0, 2)),
  )
}

export function GlobalSearch({ token, onUnauthorized }: GlobalSearchProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { preferences } = useMarketPreferences()
  const onUnauthorizedEvent = useEffectEvent((message: string) => {
    onUnauthorized?.(message)
  })

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CompanySearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const [hasTyped, setHasTyped] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [recentSearches, setRecentSearches] = useState<CompanySearchResult[]>(() => readRecentSearches())
  const [didFilterOutSearchResults, setDidFilterOutSearchResults] = useState(false)

  const filteredRecentSearches = recentSearches.filter((result) =>
    isAssetCategoryEnabled(result.assetCategory, preferences.preferredAssetClasses),
  )

  useEffect(() => {
    const match = location.pathname.match(/^\/instrument\/([^/]+)$/)
    if (!match) {
      setQuery('')
      setHasTyped(false)
      setResults([])
      setIsOpen(false)
      setActiveIndex(-1)
      setSearchError('')
      setIsSearching(false)
      setDidFilterOutSearchResults(false)
      return
    }

    setQuery(decodeURIComponent(match[1]).toUpperCase())
    setHasTyped(false)
    setIsOpen(false)
    setResults([])
    setActiveIndex(-1)
    setSearchError('')
    setIsSearching(false)
    setDidFilterOutSearchResults(false)
  }, [location.pathname])

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
        setActiveIndex(-1)
        setIsFocused(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [])

  useEffect(() => {
    const trimmedQuery = query.trim()
    if (!hasTyped || trimmedQuery.length < 2) {
      setResults([])
      setIsSearching(false)
      setSearchError('')
      setDidFilterOutSearchResults(false)
      setIsOpen(isFocused && filteredRecentSearches.length > 0)
      setActiveIndex(isFocused && filteredRecentSearches.length > 0 ? 0 : -1)
      return
    }

    let cancelled = false
    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true)
      setSearchError('')

      try {
        const response = await fetchSearchResults(token, trimmedQuery)
        if (cancelled) {
          return
        }

        const filteredResults = response.results.filter((result) =>
          isAssetCategoryEnabled(result.assetCategory, preferences.preferredAssetClasses),
        )
        setDidFilterOutSearchResults(
          response.results.length > 0 && filteredResults.length === 0,
        )
        setResults(filteredResults.slice(0, 8))
        setIsOpen(true)
        setActiveIndex(filteredResults.length > 0 ? 0 : -1)
      } catch (error) {
        if (cancelled) {
          return
        }

        if (error instanceof ApiError && error.status === 401) {
          if (token) {
            onUnauthorizedEvent('Your session expired. Log in again to search for instruments.')
          } else {
            setSearchError('Search is unavailable right now.')
            setResults([])
            setIsOpen(true)
            setActiveIndex(-1)
            setDidFilterOutSearchResults(false)
          }
          return
        }

        setSearchError(error instanceof Error ? error.message : 'Search is unavailable right now.')
        setResults([])
        setIsOpen(true)
        setActiveIndex(-1)
        setDidFilterOutSearchResults(false)
      } finally {
        if (!cancelled) {
          setIsSearching(false)
        }
      }
    }, 260)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [filteredRecentSearches.length, hasTyped, preferences.preferredAssetClasses, isFocused, query, token])

  const shouldShowRecentSearches =
    !searchError && query.trim().length < 2 && filteredRecentSearches.length > 0
  const displayedResults = shouldShowRecentSearches ? filteredRecentSearches : results

  function selectResult(result: CompanySearchResult) {
    const updatedRecentSearches = [
      result,
      ...recentSearches.filter((item) => item.symbol !== result.symbol),
    ].slice(0, 2)

    setRecentSearches(updatedRecentSearches)
    saveRecentSearches(updatedRecentSearches)
    setQuery(result.symbol)
    setHasTyped(false)
    setIsOpen(false)
    setIsSearching(false)
    setResults([])
    setActiveIndex(-1)
    setSearchError('')
    setIsFocused(false)
    setDidFilterOutSearchResults(false)
    prefetchInstrumentDetail(token, result.symbol, preferences.defaultChartRange)
    navigate(`/instrument/${encodeURIComponent(result.symbol)}`)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || displayedResults.length === 0) {
      if (event.key === 'Escape') {
        setIsOpen(false)
        setActiveIndex(-1)
      }
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((currentIndex) => (currentIndex + 1) % displayedResults.length)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((currentIndex) =>
        currentIndex <= 0 ? displayedResults.length - 1 : currentIndex - 1,
      )
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const selectedResult = displayedResults[activeIndex] ?? displayedResults[0]
      if (selectedResult) {
        selectResult(selectedResult)
      }
      return
    }

    if (event.key === 'Escape') {
      setIsOpen(false)
      setActiveIndex(-1)
    }
  }

  return (
    <div className="global-search" ref={containerRef}>
      <div className="global-search-shell">
        <input
          aria-label="Search instruments"
          className="global-search-input"
          onChange={(event) => {
            setQuery(event.target.value.toUpperCase())
            setHasTyped(true)
          }}
          onFocus={() => {
            setIsFocused(true)
            if (results.length > 0 || searchError || filteredRecentSearches.length > 0) {
              setIsOpen(true)
              setActiveIndex(
                filteredRecentSearches.length > 0 && query.trim().length < 2
                  ? 0
                  : activeIndex,
              )
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search symbols or company names"
          type="text"
          value={query}
        />
        <span className="global-search-status">
          {isSearching ? 'Searching...' : 'Search'}
        </span>
      </div>

      {isOpen ? (
        <div className="global-search-dropdown">
          {shouldShowRecentSearches ? (
            <p className="global-search-group-label">Recent searches</p>
          ) : null}
          {searchError ? <p className="global-search-empty">{searchError}</p> : null}
          {!searchError && !shouldShowRecentSearches && results.length === 0 ? (
            <p className="global-search-empty">
              {didFilterOutSearchResults
                ? 'No matching instruments fit your preferred asset classes.'
                : 'No matching instruments found.'}
            </p>
          ) : null}

          {!searchError
            ? displayedResults.map((result, index) => (
                <button
                  className={index === activeIndex ? 'search-suggestion is-active' : 'search-suggestion'}
                  key={`${shouldShowRecentSearches ? 'recent' : 'result'}-${result.symbol}`}
                  onClick={() => selectResult(result)}
                  type="button"
                >
                  <span className="search-suggestion-symbol">{result.symbol}</span>
                  <span className="search-suggestion-copy">
                    <span className="search-suggestion-name">{result.name}</span>
                    <span className="search-suggestion-exchange">
                      {[
                        result.exchange ?? 'US market',
                        result.assetCategory
                          ? assetCategoryLabel(result.assetCategory as 'stocks' | 'etfs' | 'crypto')
                          : null,
                        formatMarketHoursWithPreferences(result, preferences),
                      ]
                        .filter(Boolean)
                        .join(' • ')}
                    </span>
                  </span>
                </button>
              ))
            : null}
        </div>
      ) : null}
    </div>
  )
}
