import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { MoverLogo } from './MoverLogo'
import {
  fetchFeaturedMover,
  type FeaturedMoverAsset,
  type FeaturedMoverDirection,
  type FeaturedMoverPeriod,
  type FeaturedMoverResponse,
  type FeaturedMoverSelection,
} from '../lib/api'
import { formatCurrency } from '../lib/formatters'
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

function formatAxisPrice(value: number): string {
  const absValue = Math.abs(value)
  const maximumFractionDigits = absValue >= 100 ? 0 : absValue >= 1 ? 2 : 4
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  })}`
}

function formatTooltipValue(
  value: number | string | readonly (number | string)[] | undefined,
): [string, string] {
  const rawValue = Array.isArray(value) ? value[0] : value
  const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue)
  return [Number.isFinite(numericValue) ? formatCurrency(numericValue) : '--', 'Price']
}

function formatTooltipLabel(label: unknown, period: FeaturedMoverPeriod): string {
  const labelText = String(label ?? '')
  if (!labelText) return ''

  const parsed = new Date(labelText)
  if (Number.isNaN(parsed.getTime())) {
    return labelText
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

function CompactSelect<T extends string>({
  ariaLabel,
  onChange,
  options,
  value,
}: SegmentedControlProps<T>) {
  return (
    <label className="featured-mover-select-shell">
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

export function FeaturedMoverCard() {
  const [selection, setSelection] = useState<FeaturedMoverSelection>(DEFAULT_SELECTION)
  const [featured, setFeatured] = useState<FeaturedMoverResponse | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

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
    () => (activeFeatured?.historicalSeries ?? []).map((point) => ({ date: point.date, v: point.close })),
    [activeFeatured?.historicalSeries],
  )
  const yValues = chartData.map((point) => point.v).filter((value) => Number.isFinite(value))
  const yMin = yValues.length > 0 ? Math.min(...yValues) : 0
  const yMax = yValues.length > 0 ? Math.max(...yValues) : 100
  const yPad = (yMax - yMin) * 0.08 || 1
  const yDomain: [number, number] = [yMin - yPad, yMax + yPad]
  const title = activeFeatured?.title ?? buildTitle(selection)
  const isLoser = selection.direction === 'loser'
  const accentColor = isLoser ? '#c96a45' : '#0f766e'
  const accentFill = isLoser ? 'rgba(201, 106, 69, 0.16)' : 'rgba(15, 118, 110, 0.16)'

  return (
    <div className="featured-mover-shell">
      <p className="section-label">{title}</p>

      <div className="featured-mover-controls">
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
        <div className="hero-gainer-card">
          <div className="hero-gainer-topline">
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
            <div className="hero-gainer-chart">
              <ResponsiveContainer height={240} width="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid
                    stroke={isLoser ? 'rgba(201, 106, 69, 0.14)' : 'rgba(15,118,110,0.1)'}
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    axisLine={false}
                    dataKey="date"
                    interval="preserveStartEnd"
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    tickFormatter={(value: string) => {
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
                  />
                  <YAxis
                    axisLine={false}
                    domain={yDomain}
                    orientation="right"
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    tickFormatter={formatAxisPrice}
                    tickLine={false}
                    width={64}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: '0.78rem',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      background: '#fff',
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
            <div className="featured-mover-chart-empty">
              <p className="empty-state">Chart data is unavailable for this selection.</p>
            </div>
          )}

          <div className="hero-gainer-footer">
            <div className="hero-gainer-price-block">
              <span className="hero-gainer-price-label">Current price</span>
              <strong className="hero-gainer-price">
                {mover.price != null ? formatCurrency(mover.price) : '--'}
              </strong>
            </div>

            <Link className="hero-gainer-link" to={`/instrument/${encodeURIComponent(mover.symbol)}`}>
              View instrument &rarr;
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
