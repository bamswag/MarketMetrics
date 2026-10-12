import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { CompanySearchResult, InstrumentDetailResponse } from '../lib/api'
import { fetchInstrumentDetail } from '../lib/api'
import { buildFiveTickScale, buildTimeTicks, formatAxisNumber, parseChartTimestamp, sampleChartSeries } from '../lib/chartUtils'
import { formatCurrency, formatLongDate, formatShortDate } from '../lib/formatters'
import { assetCategoryLabel } from '../lib/marketPreferences'
import '../styles/components/ChartTooltip.css'
import { MoverLogo } from './MoverLogo'

type TopResultCardProps = {
  result: CompanySearchResult
  token?: string
  onAddWatchlist?: (symbol: string) => void
  isAddingWatchlist?: boolean
  isTracked?: boolean
}

type Tone = 'positive' | 'negative' | 'neutral'

const AXIS_TICK = { fill: 'var(--chart-axis)', fontSize: 11 } as const
const MAX_TOP_RESULT_CHART_POINTS = 28

function parsePct(changePercent: string | null | undefined): number | null {
  if (!changePercent) return null
  const n = parseFloat(changePercent.replace('%', ''))
  return isNaN(n) ? null : n
}

function getToneFromNumber(value: number | null | undefined): Tone {
  if (value == null || Number.isNaN(value)) return 'neutral'
  if (value > 0) return 'positive'
  if (value < 0) return 'negative'
  return 'neutral'
}

function getTone(changePercent: string | null | undefined): Tone {
  const n = parsePct(changePercent)
  return getToneFromNumber(n)
}

function formatPrice(price: number | null | undefined): string {
  if (price == null) return '—'
  const maxFractionDigits = price >= 1000 ? 0 : price >= 10 ? 2 : 4
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: Math.min(2, maxFractionDigits),
    maximumFractionDigits: maxFractionDigits,
  }).format(price)
}

function formatChangeValue(changePercent: number | null | undefined): string {
  if (changePercent == null || Number.isNaN(changePercent)) {
    return '—'
  }

  return `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TopResultTooltip(props: any) {
  const { active, payload } = props ?? {}
  if (!active || !payload?.length) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priceEntry = payload.find((p: any) => p.dataKey === 'close')
  const value = Number(priceEntry?.value ?? payload[0]?.value ?? 0)
  const point = priceEntry?.payload ?? payload[0]?.payload ?? {}
  return (
    <div className="instrument-tooltip">
      <span className="instrument-tooltip-date">
        {typeof point.date === 'string' ? formatLongDate(point.date) : ''}
      </span>
      <span className="instrument-tooltip-price">{formatCurrency(value)}</span>
    </div>
  )
}

export function TopResultCard({
  result,
  token,
  onAddWatchlist,
  isAddingWatchlist,
  isTracked,
}: TopResultCardProps) {
  const [detail, setDetail] = useState<InstrumentDetailResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(true)
  const [viewportWidth, setViewportWidth] = useState(() => typeof window === 'undefined' ? 1440 : window.innerWidth)

  useEffect(() => {
    const updateWidth = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', updateWidth, { passive: true })
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  useEffect(() => {
    const abortController = new AbortController()
    let cancelled = false
    setDetailLoading(true)
    setDetail(null)

    fetchInstrumentDetail(token, result.symbol, '1M', abortController.signal)
      .then((data) => {
        if (!cancelled) {
          setDetail(data)
          setDetailLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setDetailLoading(false)
      })

    return () => {
      cancelled = true
      abortController.abort()
    }
  }, [result.symbol, token])

  const quote = detail?.latestQuote ?? null
  const fullMonthHistory = useMemo(
    () =>
      (detail?.historicalSeries ?? []).filter((p) => Number.isFinite(p.close)),
    [detail],
  )
  const chartData = useMemo(
    () => sampleChartSeries(fullMonthHistory, MAX_TOP_RESULT_CHART_POINTS).map((point) => ({ ...point, timestamp: parseChartTimestamp(point.date) })),
    [fullMonthHistory],
  )
  const hasChart = chartData.length >= 2
  const monthlyChangePercent = useMemo(() => {
    if (fullMonthHistory.length < 2) {
      return null
    }

    const startingClose = fullMonthHistory[0]?.close ?? null
    const endingClose = fullMonthHistory[fullMonthHistory.length - 1]?.close ?? null

    if (
      startingClose == null
      || endingClose == null
      || !Number.isFinite(startingClose)
      || !Number.isFinite(endingClose)
      || startingClose <= 0
    ) {
      return null
    }

    return ((endingClose - startingClose) / startingClose) * 100
  }, [fullMonthHistory])
  const tone = monthlyChangePercent != null
    ? getToneFromNumber(monthlyChangePercent)
    : getTone(quote?.changePercent)
  const monthlyChangeLabel = monthlyChangePercent != null
    ? formatChangeValue(monthlyChangePercent)
    : null

  const strokeColor =
    tone === 'positive' ? 'var(--brand-green)' : tone === 'negative' ? 'var(--red-danger)' : 'var(--chart-neutral)'
  const fillColor =
    tone === 'positive' ? 'var(--brand-green)' : tone === 'negative' ? 'var(--red-danger)' : 'var(--chart-neutral)'

  const yScale = useMemo(() => buildFiveTickScale(chartData.map((point) => point.close)), [chartData])
  const xTicks = useMemo(() => buildTimeTicks(chartData, viewportWidth), [chartData, viewportWidth])

  const gradientId = `tr-fill-${result.symbol.replace(/\W/g, '')}`

  const metaParts = [
    result.exchange ?? null,
    result.assetCategory
      ? assetCategoryLabel(result.assetCategory as 'stocks' | 'etfs' | 'crypto')
      : null,
  ].filter(Boolean)

  return (
    <div
      className={`top-result-card instrument-surface instrument-surface--${tone}`}
      data-scroll-reveal="illuminate"
      data-scroll-tone={tone}
    >
      <div className="top-result-eyebrow">
        <span className="top-result-badge">Top Result</span>
      </div>

      <Link
        className="top-result-link"
        to={`/instrument/${encodeURIComponent(result.symbol)}`}
      >
        <div className="top-result-left">
          <div className="top-result-logo-wrap">
            <MoverLogo name={result.name} symbol={result.symbol} />
          </div>
          <div className="top-result-identity">
            <strong className="top-result-symbol">{result.symbol}</strong>
            <span className="top-result-name">{result.name}</span>
            {metaParts.length > 0 && (
              <span className="top-result-meta">{metaParts.join(' • ')}</span>
            )}
          </div>
        </div>

        <div className="top-result-right">
          <div className="top-result-stats">
            {detailLoading ? (
              <>
                <span className="search-result-skeleton top-result-skeleton-price" />
                <div className="top-result-skeleton-change-group">
                  <span className="search-result-skeleton top-result-skeleton-pill" />
                  <span className="search-result-skeleton top-result-skeleton-timeframe" />
                </div>
              </>
            ) : (
              <>
                <div className="top-result-price-stack">
                  <span className="top-result-price-label">Latest price</span>
                  <span className="top-result-price">{formatPrice(quote?.price)}</span>
                </div>

                {monthlyChangeLabel ? (
                  <div className="top-result-change-copy">
                    <span
                      className={
                        tone === 'positive'
                          ? 'positive-pill top-result-pill'
                          : tone === 'negative'
                            ? 'negative-pill top-result-pill'
                            : 'neutral-pill top-result-pill'
                      }
                    >
                      {monthlyChangeLabel}
                    </span>
                    <span className="top-result-timeframe">Over the past month</span>
                  </div>
                ) : null}
              </>
            )}
          </div>

          {detailLoading && (
            <span
              className="search-result-skeleton"
              style={{ height: 132, display: 'block', borderRadius: 18 }}
            />
          )}

          {!detailLoading && hasChart && (
            <div className="top-result-chart-shell" data-scroll-reveal="chart">
              {detail?.rangeSummary ? (
                <p className="sr-only">
                  {result.symbol} one-month chart. First {formatPrice(detail.rangeSummary.firstClose)}, latest {formatPrice(detail.rangeSummary.latestClose)}, high {formatPrice(detail.rangeSummary.highClose)}, low {formatPrice(detail.rangeSummary.lowClose)}. The period {detail.rangeSummary.change >= 0 ? 'gained' : 'lost'} {Math.abs(detail.rangeSummary.changePercent).toFixed(2)} percent.
                </p>
              ) : null}
              <div className="top-result-chart">
                <ResponsiveContainer
                  height={132}
                  initialDimension={{ width: 1, height: 132 }}
                  minHeight={0}
                  minWidth={0}
                  width="100%"
                >
                  <AreaChart
                    data={chartData}
                    margin={{ top: 10, right: 4, bottom: 0, left: 0 }}
                  >
                    <defs>
                      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={fillColor} stopOpacity={0.18} />
                        <stop offset="100%" stopColor={fillColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke="var(--chart-grid)"
                      strokeDasharray="4 4"
                      vertical={false}
                    />
                    <XAxis
                      axisLine={false}
                      dataKey="timestamp"
                      domain={['dataMin', 'dataMax']}
                      scale="time"
                      tick={AXIS_TICK}
                      tickFormatter={(value: number) => formatShortDate(new Date(value).toISOString())}
                      tickLine={false}
                      tickMargin={10}
                      ticks={xTicks}
                      type="number"
                    />
                    <YAxis
                      axisLine={false}
                      domain={yScale.domain}
                      orientation="right"
                      ticks={yScale.ticks}
                      tick={AXIS_TICK}
                      tickFormatter={(v: number) => formatAxisNumber(v, yScale.step)}
                      tickLine={false}
                      width={64}
                    />
                    <Tooltip content={TopResultTooltip} />
                    <Area
                      dataKey="close"
                      dot={false}
                      fill={`url(#${gradientId})`}
                      fillOpacity={1}
                      isAnimationActive={false}
                      stroke={strokeColor}
                      strokeWidth={2}
                      type="monotone"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
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
