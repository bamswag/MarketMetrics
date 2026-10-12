import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { useMarketPreferences } from '../app/MarketPreferencesContext'
import { MoverLogo } from './MoverLogo'
import {
  fetchFeaturedMover,
  type FeaturedMoverAsset,
  type FeaturedMoverDirection,
  type FeaturedMoverPeriod,
  type FeaturedMoverResponse,
  type FeaturedMoverSelection,
} from '../lib/api'
import { formatCurrencyWithPreferences } from '../lib/marketDisplay'
import { buildFiveTickScale, buildTimeTicks, formatAxisNumber, parseChartTimestamp, summarizeChartRange } from '../lib/chartUtils'
import '../styles/components/FeaturedMoverCard.css'

const DEFAULT_SELECTION: FeaturedMoverSelection = {
  period: 'week',
  direction: 'gainer',
  asset: 'all',
}

const PERIOD_OPTIONS: Array<{ label: string; value: FeaturedMoverPeriod }> = [
  { label: 'Day', value: 'day' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
]

const DIRECTION_OPTIONS: Array<{ label: string; value: FeaturedMoverDirection }> = [
  { label: 'Gainer', value: 'gainer' },
  { label: 'Loser', value: 'loser' },
]

const ASSET_OPTIONS: Array<{ label: string; value: FeaturedMoverAsset }> = [
  { label: 'All', value: 'all' },
  { label: 'Stocks', value: 'stocks' },
  { label: 'Crypto', value: 'crypto' },
  { label: 'ETFs', value: 'etfs' },
]

function buildTitle(selection: FeaturedMoverSelection): string {
  const assetPrefix =
    selection.asset === 'all'
      ? ''
      : selection.asset === 'stocks'
        ? 'stock '
        : selection.asset === 'crypto'
          ? 'crypto '
          : 'ETF '
  const periodSuffix =
    selection.period === 'day'
      ? 'today'
      : selection.period === 'week'
        ? 'this week'
        : 'this month'
  return `Top ${assetPrefix}${selection.direction} ${periodSuffix}`.trim()
}

function formatChangePercent(raw: string | null | undefined): string {
  if (!raw) return '--'
  const trimmed = raw.replace('%', '').trim()
  const num = parseFloat(trimmed)
  if (Number.isNaN(num)) return raw
  if (num > 0) return `+${num.toFixed(2)}%`
  if (num < 0) return `${num.toFixed(2)}%`
  return '0.00%'
}


function formatTooltipLabel(label: unknown, period: FeaturedMoverPeriod): string {
  if (label == null || label === '') return ''
  const parsed = new Date(typeof label === 'number' ? label : String(label))
  if (Number.isNaN(parsed.getTime())) {
    return String(label)
  }

  if (period === 'day') {
    return parsed.toLocaleString('en-GB', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return parsed.toLocaleDateString('en-GB', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

type SegmentedControlProps<T extends string> = {
  ariaLabel: string
  onChange: (value: T) => void
  options: Array<{ label: string; value: T }>
  value: T
}

type FeaturedMoverCardProps = {
  onDirectionChange?: (direction: FeaturedMoverDirection) => void
}

function CompactSelect<T extends string>({
  ariaLabel,
  onChange,
  options,
  value,
}: SegmentedControlProps<T>) {
  return (
    <label className="featured-mover-select-shell" data-scroll-item>
      <select
        aria-label={ariaLabel}
        className="featured-mover-select"
        onChange={(event) => onChange(event.target.value as T)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span aria-hidden="true" className="featured-mover-select-caret">
        ▾
      </span>
    </label>
  )
}

function FeaturedMoverSkeleton() {
  return (
    <div className="hero-gainer-skeleton">
      <div className="featured-mover-controls" aria-hidden="true">
        <div className="skeleton-line" style={{ width: '120px', height: '36px', borderRadius: '14px' }} />
        <div className="skeleton-line" style={{ width: '128px', height: '36px', borderRadius: '14px' }} />
        <div className="skeleton-line" style={{ width: '132px', height: '36px', borderRadius: '14px' }} />
      </div>
      <div className="hero-gainer-skeleton-body">
        <div className="skeleton-logo" />
        <div className="skeleton-lines">
          <div className="skeleton-line skeleton-line--wide" />
          <div className="skeleton-line skeleton-line--narrow" />
        </div>
        <div className="hero-gainer-skeleton-change" />
      </div>
      <div className="skeleton-chart-placeholder" />
    </div>
  )
}

export function FeaturedMoverCard({ onDirectionChange }: FeaturedMoverCardProps) {
  const { preferences } = useMarketPreferences()
  const [selection, setSelection] = useState<FeaturedMoverSelection>(DEFAULT_SELECTION)
  const [featured, setFeatured] = useState<FeaturedMoverResponse | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [viewportWidth, setViewportWidth] = useState(() => typeof window === 'undefined' ? 1440 : window.innerWidth)

  useEffect(() => {
    const updateWidth = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', updateWidth, { passive: true })
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  function formatTooltipValue(
    value: number | string | readonly (number | string)[] | undefined,
  ): [string, string] {
    const rawValue = Array.isArray(value) ? value[0] : value
    const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue)
    return [Number.isFinite(numericValue) ? formatCurrencyWithPreferences(numericValue, preferences) : '--', 'Price']
  }

  useEffect(() => {
    onDirectionChange?.(selection.direction)
  }, [onDirectionChange, selection.direction])

  useEffect(() => {
    const abortController = new AbortController()
    let cancelled = false

    async function loadFeaturedMover() {
      setIsLoading(true)
      setError('')

      try {
        const payload = await fetchFeaturedMover(selection, abortController.signal)
        if (!cancelled) {
          setFeatured(payload)
        }
      } catch (nextError) {
        if (cancelled || (nextError instanceof DOMException && nextError.name === 'AbortError')) {
          return
        }
        setFeatured(null)
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Unable to load the featured mover right now.',
        )
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadFeaturedMover()

    return () => {
      cancelled = true
      abortController.abort()
    }
  }, [selection])

  const activeFeatured =
    featured &&
    featured.period === selection.period &&
    featured.direction === selection.direction &&
    featured.asset === selection.asset
      ? featured
      : null

  const mover = activeFeatured?.mover ?? null
  const chartData = useMemo(
    () => (activeFeatured?.historicalSeries ?? []).map((point) => ({ date: point.date, timestamp: parseChartTimestamp(point.date), v: point.close })),
    [activeFeatured?.historicalSeries],
  )
  const yScale = useMemo(() => buildFiveTickScale(chartData.map((point) => point.v)), [chartData])
  const chartSummary = useMemo(
    () => summarizeChartRange(chartData.map((point) => ({ close: point.v }))),
    [chartData],
  )
  const xAxisTicks = useMemo(() => buildTimeTicks(chartData, viewportWidth), [chartData, viewportWidth])
  const title = activeFeatured?.title ?? buildTitle(selection)
  const isLoser = selection.direction === 'loser'
  const accentColor = isLoser ? 'var(--brand-red)' : 'var(--brand-green)'
  const accentFill = isLoser ? 'rgb(from var(--brand-red) r g b / 0.16)' : 'rgb(from var(--brand-green) r g b / 0.16)'

  return (
    <div
      className={`featured-mover-shell ${
        isLoser ? 'featured-mover-shell--negative' : 'featured-mover-shell--positive'
      }`}
      data-scroll-reveal="illuminate"
      data-scroll-tone={isLoser ? 'negative' : 'positive'}
      data-theme-glare
    >
      <p className="section-label" data-scroll-reveal="rise">
        {title}
      </p>

      <div className="featured-mover-controls" data-scroll-stagger>
        <CompactSelect
          ariaLabel="Featured mover time range"
          onChange={(period) => setSelection((current) => ({ ...current, period }))}
          options={PERIOD_OPTIONS}
          value={selection.period}
        />
        <CompactSelect
          ariaLabel="Featured mover direction"
          onChange={(direction) => setSelection((current) => ({ ...current, direction }))}
          options={DIRECTION_OPTIONS}
          value={selection.direction}
        />
        <CompactSelect
          ariaLabel="Featured mover asset type"
          onChange={(asset) => setSelection((current) => ({ ...current, asset }))}
          options={ASSET_OPTIONS}
          value={selection.asset}
        />
      </div>

      {isLoading && !activeFeatured ? <FeaturedMoverSkeleton /> : null}
      {!isLoading && error ? <p className="error-text">{error}</p> : null}

      {!isLoading && !error && activeFeatured && !mover ? (
        <p className="empty-state">No featured mover is available for this selection yet.</p>
      ) : null}

      {!isLoading && !error && activeFeatured && mover ? (
        <div className="hero-gainer-card" data-scroll-stagger>
          <div className="hero-gainer-topline" data-scroll-item>
            <div className="hero-gainer-identity">
              <MoverLogo name={mover.name} symbol={mover.symbol} />
              <div className="hero-gainer-info">
                <strong className="hero-gainer-symbol">{mover.symbol}</strong>
                <p className="hero-gainer-name">{mover.name ?? mover.symbol}</p>
              </div>
            </div>
            <span
              className={
                isLoser ? 'hero-gainer-change hero-gainer-change--loss' : 'hero-gainer-change'
              }
            >
              {formatChangePercent(mover.change_percent)}
            </span>
          </div>

          {chartData.length > 0 ? (
            <div className="hero-gainer-chart" data-scroll-reveal="chart">
              {chartSummary ? (
                <p className="sr-only">
                  {mover.symbol} {selection.period} chart. First {formatCurrencyWithPreferences(chartSummary.first, preferences)}, latest {formatCurrencyWithPreferences(chartSummary.latest, preferences)}, high {formatCurrencyWithPreferences(chartSummary.high, preferences)}, low {formatCurrencyWithPreferences(chartSummary.low, preferences)}. The period {chartSummary.change >= 0 ? 'gained' : 'lost'} {Math.abs(chartSummary.changePercent).toFixed(2)} percent.
                </p>
              ) : null}
              <ResponsiveContainer
                height={240}
                initialDimension={{ width: 1, height: 240 }}
                minHeight={0}
                minWidth={0}
                width="100%"
              >
                <AreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid
                    stroke={isLoser ? 'rgb(from var(--brand-red) r g b / 0.14)' : 'rgb(from var(--brand-green) r g b / 0.1)'}
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    axisLine={false}
                    dataKey="timestamp"
                    domain={['dataMin', 'dataMax']}
                    interval={0}
                    scale="time"
                    tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
                    tickFormatter={(value: number) => {
                      if (!value) return ''
                      const parsed = new Date(value)
                      if (selection.period === 'day') {
                        return parsed.toLocaleTimeString('en-GB', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      }
                      return parsed.toLocaleDateString('en-GB', {
                        month: 'short',
                        day: 'numeric',
                      })
                    }}
                    tickLine={false}
                    ticks={xAxisTicks}
                    type="number"
                  />
                  <YAxis
                    axisLine={false}
                    domain={yScale.domain}
                    orientation="right"
                    tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
                    tickFormatter={(value: number) => formatAxisNumber(value, yScale.step, 'currency')}
                    tickLine={false}
                    ticks={yScale.ticks}
                    width={64}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: '0.78rem',
                      borderRadius: '8px',
                      border: '1px solid var(--panel-border)',
                      background: 'var(--chart-tooltip-bg)',
                      color: 'var(--text-main)',
                    }}
                    formatter={formatTooltipValue}
                    labelFormatter={(label) => formatTooltipLabel(label, selection.period)}
                  />
                  <Area
                    dataKey="v"
                    fill={accentFill}
                    fillOpacity={1}
                    isAnimationActive={false}
                    stroke={accentColor}
                    strokeWidth={2.4}
                    type="monotone"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="featured-mover-chart-empty" data-scroll-item>
              <p className="empty-state">Chart data is unavailable for this selection.</p>
            </div>
          )}

          <div className="hero-gainer-footer" data-scroll-item>
            <div className="hero-gainer-price-block">
              <span className="hero-gainer-price-label">Current price</span>
              <strong className="hero-gainer-price">
                {mover.price != null ? formatCurrencyWithPreferences(mover.price, preferences) : '--'}
              </strong>
            </div>

            <Link className="hero-gainer-link" to={`/instrument/${encodeURIComponent(mover.symbol)}`}>
              View instrument
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
