import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import type { SimilarInstrument } from '../lib/api'
import { fetchSimilarInstruments } from '../lib/api'
import { assetCategoryLabel } from '../lib/marketPreferences'
import { MoverLogo } from './MoverLogo'
import '../styles/components/SimilarInstrumentsSection.css'

type SimilarInstrumentsSectionProps = {
  assetCategory?: string | null
  instrumentName?: string | null
  symbol: string
}

type Tone = 'positive' | 'negative' | 'neutral'

function parsePct(changePercent: string | null | undefined): number | null {
  if (!changePercent) return null
  const n = parseFloat(changePercent.replace('%', ''))
  return Number.isFinite(n) ? n : null
}

function getTone(changePercent: string | null | undefined): Tone {
  const parsed = parsePct(changePercent)
  if (parsed == null) return 'neutral'
  if (parsed > 0) return 'positive'
  if (parsed < 0) return 'negative'
  return 'neutral'
}

function formatPrice(price: number | null | undefined): string {
  if (price == null || !Number.isFinite(price)) return '—'
  const maxFractionDigits = price >= 1000 ? 0 : price >= 10 ? 2 : 4
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: maxFractionDigits,
    minimumFractionDigits: Math.min(2, maxFractionDigits),
    style: 'currency',
  }).format(price)
}

function formatChangePct(changePercent: string | null | undefined): string {
  const parsed = parsePct(changePercent)
  if (parsed == null) return '—'
  return `${parsed >= 0 ? '+' : ''}${parsed.toFixed(2)}%`
}

function formatCategory(category: string | null | undefined): string {
  if (category === 'stocks' || category === 'etfs' || category === 'crypto') {
    return assetCategoryLabel(category)
  }
  return category ? category.replace(/^\w/, (char) => char.toUpperCase()) : 'Instrument'
}

function sectionTitle(category: string | null | undefined): string {
  if (category === 'crypto') return 'Similar crypto markets'
  if (category === 'etfs') return 'Similar ETFs'
  if (category === 'stocks') return 'Similar stocks'
  return 'Similar instruments'
}

function friendlyInstrumentName(name: string | null | undefined, symbol: string): string {
  const trimmedName = name?.trim()
  if (!trimmedName) return symbol

  return trimmedName
    .replace(/,\s*Inc\.?$/i, '')
    .replace(/\s+Inc\.?$/i, '')
    .replace(/\s+Corporation$/i, '')
    .replace(/\s+Company$/i, '')
    .trim()
}

function sectionCopy(
  category: string | null | undefined,
  symbol: string,
  instrumentName: string | null | undefined,
): string {
  const displayName = friendlyInstrumentName(instrumentName, symbol)
  if (category === 'crypto') {
    return `Other crypto pairs with related market structure to ${displayName}.`
  }
  if (category === 'etfs') {
    return `Comparable funds and ETF exposures near ${displayName}.`
  }
  return `Other chartable instruments related to ${displayName}.`
}

export function SimilarInstrumentsSection({
  assetCategory,
  instrumentName,
  symbol,
}: SimilarInstrumentsSectionProps) {
  const [items, setItems] = useState<SimilarInstrument[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!symbol) {
      setItems([])
      setError('')
      return
    }

    const abortController = new AbortController()
    let cancelled = false
    setIsLoading(true)
    setError('')

    fetchSimilarInstruments(symbol, 8, abortController.signal)
      .then((response) => {
        if (cancelled) return
        setItems(response.results)
      })
      .catch((err) => {
        if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) {
          return
        }
        setItems([])
        setError(err instanceof Error ? err.message : 'Unable to load similar instruments.')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
      abortController.abort()
    }
  }, [symbol])

  return (
    <section className="similar-instruments-section" aria-labelledby="similar-instruments-title">
      <div className="similar-instruments-header">
        <div>
          <p className="section-label">Explore nearby markets</p>
          <h2 className="similar-instruments-title" id="similar-instruments-title">
            {sectionTitle(assetCategory)}
          </h2>
          <p className="similar-instruments-subtitle">
            {sectionCopy(assetCategory, symbol, instrumentName)}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="similar-instruments-grid" aria-label="Loading similar instruments">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="similar-instrument-card similar-instrument-card--skeleton" key={index}>
              <span className="similar-instrument-skeleton similar-instrument-skeleton--logo" />
              <span className="similar-instrument-skeleton similar-instrument-skeleton--title" />
              <span className="similar-instrument-skeleton similar-instrument-skeleton--meta" />
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="similar-instruments-message">
          Similar instruments are unavailable right now.
        </p>
      ) : items.length === 0 ? (
        <p className="similar-instruments-message">
          No similar instruments found yet.
        </p>
      ) : (
        <div className="similar-instruments-grid">
          {items.map((item) => {
            const quote = item.latestQuote
            const tone = getTone(quote?.changePercent)
            return (
              <Link
                className={`similar-instrument-card similar-instrument-card--${tone}`}
                key={item.symbol}
                to={`/instrument/${encodeURIComponent(item.symbol)}`}
              >
                <div className="similar-instrument-topline">
                  <MoverLogo name={item.name} symbol={item.symbol} />
                  <span className="similar-instrument-category">
                    {formatCategory(item.assetCategory)}
                  </span>
                </div>

                <div className="similar-instrument-identity">
                  <strong>{item.symbol}</strong>
                  <span>{item.name}</span>
                </div>

                <div className="similar-instrument-meta-row">
                  <span>{item.exchange ?? 'Market'}</span>
                  {item.similarityReason ? <span>{item.similarityReason}</span> : null}
                </div>

                <div className="similar-instrument-quote-row">
                  <span className="similar-instrument-price">
                    {formatPrice(quote?.price)}
                  </span>
                  {quote?.changePercent ? (
                    <span className={`similar-instrument-change similar-instrument-change--${tone}`}>
                      {formatChangePct(quote.changePercent)}
                    </span>
                  ) : (
                    <span className="similar-instrument-change similar-instrument-change--neutral">
                      Quote pending
                    </span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
