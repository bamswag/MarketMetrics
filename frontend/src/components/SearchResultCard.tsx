import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Line, LineChart, ResponsiveContainer } from 'recharts'

import type { CompanySearchResult, InstrumentDetailResponse } from '../lib/api'
import { fetchInstrumentDetail } from '../lib/api'
import { assetCategoryLabel } from '../lib/marketPreferences'
import { MoverLogo } from './MoverLogo'

type SearchResultCardProps = {
  result: CompanySearchResult
  token?: string
  onAddWatchlist?: (symbol: string) => void
  isAddingWatchlist?: boolean
  isTracked?: boolean
}

type Tone = 'positive' | 'negative' | 'neutral'

function parsePct(changePercent: string | null | undefined): number | null {
  if (!changePercent) return null
  const n = parseFloat(changePercent.replace('%', ''))
  return isNaN(n) ? null : n
}

function getTone(changePercent: string | null | undefined): Tone {
  const n = parsePct(changePercent)
  if (n === null) return 'neutral'
  if (n > 0) return 'positive'
  if (n < 0) return 'negative'
  return 'neutral'
}

function formatPrice(price: number | null | undefined): string {
  if (price == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: price >= 1000 ? 0 : price >= 10 ? 2 : 4,
  }).format(price)
}

function formatChangePct(changePercent: string | null | undefined): string {
  if (!changePercent) return '—'
  const n = parsePct(changePercent)
  if (n === null) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

export function SearchResultCard({
  result,
  token,
  onAddWatchlist,
  isAddingWatchlist,
  isTracked,
}: SearchResultCardProps) {
  const [detail, setDetail] = useState<InstrumentDetailResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setDetailLoading(true)
    fetchInstrumentDetail(token, result.symbol, '1M')
      .then((data) => {
        if (!cancelled) {
          setDetail(data)
          setDetailLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => { cancelled = true }
  }, [result.symbol, token])

  const quote = detail?.latestQuote ?? null
  const tone = getTone(quote?.changePercent)
  const sparklineData = (detail?.historicalSeries ?? []).slice(-14)
  const hasSparkline = sparklineData.length >= 2
  const sparklineColor = tone === 'positive' ? '#0f766e' : tone === 'negative' ? '#b14f2b' : '#687487'

  const metaParts = [
    result.exchange ?? null,
    result.assetCategory
      ? assetCategoryLabel(result.assetCategory as 'stocks' | 'etfs' | 'crypto')
      : null,
  ].filter(Boolean)

  return (
    <div className={`search-result-card instrument-surface instrument-surface--${tone}`}>
      {/* Top: identity */}
      <Link
        className="search-result-card-link"
        to={`/instrument/${encodeURIComponent(result.symbol)}`}
      >
        <div className="search-result-card-head">
          <MoverLogo name={result.name} symbol={result.symbol} />
          <div className="search-result-card-identity">
            <strong className="search-result-card-symbol">{result.symbol}</strong>
            <span className="search-result-card-name">{result.name}</span>
          </div>
        </div>

        {metaParts.length > 0 && (
          <p className="search-result-card-meta">{metaParts.join(' • ')}</p>
        )}

        {/* Bottom: price + change + sparkline */}
        <div className="search-result-card-footer">
          <div className="search-result-card-price-block">
            {detailLoading ? (
              <span className="search-result-skeleton" />
            ) : (
              <>
                <span className="search-result-card-price">
                  {formatPrice(quote?.price)}
                </span>
                {quote?.changePercent && (
                  <span className={tone === 'positive' ? 'positive-pill' : tone === 'negative' ? 'negative-pill' : 'neutral-pill'}>
                    {formatChangePct(quote.changePercent)}
                  </span>
                )}
              </>
            )}
          </div>

          {hasSparkline && !detailLoading && (
            <div className="search-result-sparkline">
              <ResponsiveContainer height={40} width="100%">
                <LineChart data={sparklineData}>
                  <Line
                    dataKey="close"
                    dot={false}
                    isAnimationActive={false}
                    stroke={sparklineColor}
                    strokeWidth={1.5}
                    type="monotone"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </Link>

      {/* Watchlist action */}
      {onAddWatchlist && (
        <button
          className={`search-result-card-action ghost-action${isTracked ? ' is-tracked' : ''}`}
          disabled={isAddingWatchlist || isTracked}
          onClick={(e) => {
            e.preventDefault()
            if (!isTracked) onAddWatchlist(result.symbol)
          }}
          title={isTracked ? 'Already in watchlist' : 'Add to watchlist'}
          type="button"
        >
          {isTracked ? '✓ Tracked' : isAddingWatchlist ? 'Adding…' : '+ Watchlist'}
        </button>
      )}
    </div>
  )
}
