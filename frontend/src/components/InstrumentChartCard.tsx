import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { InstrumentDetailResponse, InstrumentRange } from '../lib/api'
import { getMaxChartPoints, sampleChartSeries } from '../lib/chartUtils'
import { formatCurrency, formatLongDate, formatShortDate, formatShortTime } from '../lib/formatters'

type ChartType = 'price' | 'ma-overlay'

type InstrumentChartCardProps = {
  instrumentDetail: InstrumentDetailResponse
  selectedRange: InstrumentRange
  onSelectRange: (range: InstrumentRange) => void
}

const RANGE_OPTIONS: InstrumentRange[] = ['1W', '1M', '3M', '6M', '1Y', '5Y', 'MAX']
const RANGE_LABELS: Record<InstrumentRange, string> = {
  '1W': '1W',
  '1M': '1M',
  '3M': '3M',
  '6M': '6M',
  '1Y': '1Y',
  '5Y': '5Y',
  MAX: 'MAX',
}
const AXIS_TICK = { fill: '#8b95a3', fontSize: 11 } as const

function formatCompactNumber(value?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '--'
  }

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
    notation: value >= 10_000 ? 'compact' : 'standard',
  }).format(value)
}

function formatOptionalCurrency(value?: number | null): string {
  return value === null || value === undefined ? '--' : formatCurrency(value)
}

function formatPointLabel(value: string): string {
  return value.includes('T') ? formatShortTime(value) : formatLongDate(value)
}

function parseChartDate(value: string): Date {
  return value.includes('T') ? new Date(value) : new Date(`${value}T00:00:00`)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltipContent(props: any) {
  const { active, payload, label } = props ?? {}
  if (!active || !payload?.length) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priceEntry = payload.find((p: any) => p.dataKey === 'close')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ma30Entry = payload.find((p: any) => p.dataKey === 'ma30')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ma50Entry = payload.find((p: any) => p.dataKey === 'ma50')
  const value = Number(priceEntry?.value ?? payload[0]?.value ?? 0)
  const point = priceEntry?.payload ?? payload[0]?.payload ?? {}
  return (
    <div className="instrument-tooltip">
      <span className="instrument-tooltip-date">
        {typeof label === 'string' ? formatPointLabel(label) : ''}
      </span>
      <span className="instrument-tooltip-price">{formatCurrency(value)}</span>
      {point.open != null || point.high != null || point.low != null ? (
        <div className="instrument-tooltip-grid">
          <span>Open <strong>{formatOptionalCurrency(point.open)}</strong></span>
          <span>High <strong>{formatOptionalCurrency(point.high)}</strong></span>
          <span>Low <strong>{formatOptionalCurrency(point.low)}</strong></span>
          <span>Volume <strong>{formatCompactNumber(point.volume)}</strong></span>
        </div>
      ) : null}
      {ma30Entry?.value != null && (
        <span className="instrument-tooltip-ma instrument-tooltip-ma--30">EMA30 {formatCurrency(Number(ma30Entry.value))}</span>
      )}
      {ma50Entry?.value != null && (
        <span className="instrument-tooltip-ma instrument-tooltip-ma--50">EMA50 {formatCurrency(Number(ma50Entry.value))}</span>
      )}
    </div>
  )
}

// Compact Y-axis labels: $1.2K, $4.5M, $463, $52.9 — no full-precision clutter
function formatYAxisTick(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000
    return `$${Number.isInteger(m) ? m : m.toFixed(1)}M`
  }
  if (value >= 1_000) {
    const k = value / 1_000
    return `$${Number.isInteger(k) ? k : k.toFixed(1)}K`
  }
  if (value >= 100) return `$${Math.round(value)}`
  if (value >= 10) return `$${value.toFixed(1)}`
  if (value >= 1) return `$${value.toFixed(2)}`
  return `$${value.toFixed(4)}`
}

// Range-aware X-axis labels: year for MAX/5Y, "Apr '24" for 1Y/6M/3M, "Apr 17" for short ranges
function formatXAxisTick(value: string, range: InstrumentRange): string {
  const d = parseChartDate(value)
  if (range === 'MAX' || range === '5Y') {
    return String(d.getFullYear())
  }
  if (range === '1Y' || range === '6M' || range === '3M') {
    const month = d.toLocaleString('en-US', { month: 'short' })
    const year = String(d.getFullYear()).slice(2)
    return `${month} '${year}`
  }
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric' })
}

// Compute explicit tick positions for clean, evenly-spaced X-axis labels.
//
// Short ranges (1W, 1M) use evenly-spaced data indices so weekend gaps or
// partial weeks never bunch two labels together.
//
// Longer ranges use calendar-aligned first trading days (per month / per year)
// which are inherently ~equal since months/years have similar trading-day counts.
function computeXTicks(series: Array<{ date: string }>, range: InstrumentRange): string[] {
  if (series.length === 0) return []
  const n = series.length

  if (range === '1W' || range === '1M') {
    // Evenly spaced by array index: 5 ticks for both (≈ 1 per day for 1W, ≈ 1 per week for 1M)
    const count = Math.min(5, n)
    if (count >= n) return series.map((p) => p.date)
    const ticks: string[] = []
    for (let i = 0; i < count; i++) {
      ticks.push(series[Math.round((i / (count - 1)) * (n - 1))].date)
    }
    return ticks
  }

  // Calendar-aligned: first trading day of each month (3M/6M/1Y) or year (5Y/MAX)
  const ticks: string[] = []
  const seen = new Set<string>()
  for (const { date } of series) {
    const d = parseChartDate(date)
    const key = range === 'MAX' || range === '5Y'
      ? String(d.getFullYear())
      : `${d.getFullYear()}-${d.getMonth()}`
    if (!seen.has(key)) {
      seen.add(key)
      ticks.push(date)
    }
  }
  return ticks
}

export function InstrumentChartCard({
  instrumentDetail,
  selectedRange,
  onSelectRange,
}: InstrumentChartCardProps) {
  const [chartType, setChartType] = useState<ChartType>('price')
  const hasAvailabilityMetadata = instrumentDetail.availableRanges.length > 0
  const availableRanges = useMemo(
    () => new Set(instrumentDetail.availableRanges),
    [instrumentDetail.availableRanges],
  )

  const chartSeries = useMemo(
    () =>
      sampleChartSeries(
        instrumentDetail.historicalSeries,
        getMaxChartPoints(selectedRange),
      ).filter((p) => Number.isFinite(p.close)),
    [instrumentDetail.historicalSeries, selectedRange],
  )

  // EMA (Exponential Moving Average) — different smoothing factors mean EMA30 and EMA50
  // produce distinct values from point 1 onwards, so both lines are visible for the full chart.
  const chartData = useMemo(() => {
    if (chartType === 'price') return chartSeries
    const alpha30 = 2 / (30 + 1)
    const alpha50 = 2 / (50 + 1)
    let ema30 = 0
    let ema50 = 0
    return chartSeries.map((p, i) => {
      if (i === 0) {
        ema30 = p.close
        ema50 = p.close
      } else {
        ema30 = p.close * alpha30 + ema30 * (1 - alpha30)
        ema50 = p.close * alpha50 + ema50 * (1 - alpha50)
      }
      return { ...p, ma30: ema30, ma50: ema50 }
    })
  }, [chartSeries, chartType])

  const xTicks = useMemo(
    () => computeXTicks(chartSeries, selectedRange),
    [chartSeries, selectedRange],
  )

  const yDomain = useMemo((): [number, number] => {
    if (chartSeries.length === 0) return [0, 1]
    const prices = chartSeries.map((p) => p.close).filter((v) => Number.isFinite(v))
    if (prices.length === 0) return [0, 1]
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const yPad = (max - min) * 0.07 || 1
    return [Math.max(0, min - yPad), max + yPad]
  }, [chartSeries])

  const firstClose = chartSeries.length > 0 ? chartSeries[0].close : 0
  const lastClose = chartSeries.length > 0 ? chartSeries[chartSeries.length - 1].close : 0
  const rangeChange = lastClose - firstClose
  const rangeChangePct = firstClose > 0 ? ((rangeChange / firstClose) * 100).toFixed(2) : '0.00'
  const isRangePositive = rangeChange >= 0
  const quote = instrumentDetail.latestQuote
  const livePrice = quote.price
  const marketStats = [
    { label: 'Open', value: formatOptionalCurrency(quote.open) },
    { label: 'High', value: formatOptionalCurrency(quote.high) },
    { label: 'Low', value: formatOptionalCurrency(quote.low) },
    { label: 'Close', value: formatOptionalCurrency(quote.close) },
    { label: 'Volume', value: formatCompactNumber(quote.volume) },
    { label: 'VWAP', value: formatOptionalCurrency(quote.vwap) },
  ]
  const hasMarketStats = marketStats.some((stat) => stat.value !== '--')

  return (
    <div className="instrument-chart-wrapper">
      <div className="instrument-chart-header">
        <div className="instrument-chart-header-left">
          <h2 className="instrument-chart-title">Price History</h2>
          <div className="instrument-range-stats">
            <span className={`instrument-range-badge ${isRangePositive ? 'instrument-range-badge--up' : 'instrument-range-badge--down'}`}>
              {isRangePositive ? '+' : ''}{rangeChangePct}%
            </span>
            <span className="instrument-range-label">over {RANGE_LABELS[selectedRange]}</span>
          </div>
        </div>

        <div className="instrument-chart-controls">
          <select
            className="instrument-chart-type-select"
            onChange={(e) => setChartType(e.target.value as ChartType)}
            value={chartType}
          >
            <option value="price">Regular</option>
            <option value="ma-overlay">MA Overlay</option>
          </select>

          <div className="instrument-range-bar">
            {RANGE_OPTIONS.map((rangeOption) => (
              <button
                className={selectedRange === rangeOption ? 'instrument-range-btn instrument-range-btn--active' : 'instrument-range-btn'}
                disabled={hasAvailabilityMetadata ? !availableRanges.has(rangeOption) : false}
                key={rangeOption}
                onClick={() => onSelectRange(rangeOption)}
                type="button"
              >
                {RANGE_LABELS[rangeOption]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Live price ── */}
      <div className="instrument-live-price-row">
        <span className="instrument-live-price-value">{formatCurrency(livePrice)}</span>
      </div>

      {hasMarketStats ? (
        <div className="instrument-market-stat-grid" aria-label="Latest trading day market stats">
          <div className="instrument-market-stat instrument-market-stat--range">
            <span className="instrument-market-stat-label">Day range</span>
            <strong className="instrument-market-stat-value">
              {formatOptionalCurrency(quote.low)} - {formatOptionalCurrency(quote.high)}
            </strong>
          </div>
          {marketStats.map((stat) => (
            <div className="instrument-market-stat" key={stat.label}>
              <span className="instrument-market-stat-label">{stat.label}</span>
              <strong className="instrument-market-stat-value">{stat.value}</strong>
            </div>
          ))}
          {quote.previousClose != null ? (
            <div className="instrument-market-stat">
              <span className="instrument-market-stat-label">Previous close</span>
              <strong className="instrument-market-stat-value">{formatCurrency(quote.previousClose)}</strong>
            </div>
          ) : null}
          {quote.tradeCount != null ? (
            <div className="instrument-market-stat">
              <span className="instrument-market-stat-label">Trades</span>
              <strong className="instrument-market-stat-value">{formatCompactNumber(quote.tradeCount)}</strong>
            </div>
          ) : null}
        </div>
      ) : null}

      {chartType === 'ma-overlay' && (
        <div className="instrument-chart-legend">
          <span className="instrument-chart-legend-pill instrument-chart-legend-pill--price">
            <span className="instrument-chart-legend-swatch instrument-chart-legend-swatch--price" />
            Price
          </span>
          <span className="instrument-chart-legend-pill instrument-chart-legend-pill--ma30">
            <span className="instrument-chart-legend-swatch instrument-chart-legend-swatch--ma30" />
            30-day EMA
          </span>
          <span className="instrument-chart-legend-pill instrument-chart-legend-pill--ma50">
            <span className="instrument-chart-legend-swatch instrument-chart-legend-swatch--ma50" />
            50-day EMA
          </span>
        </div>
      )}

      {chartData.length > 0 ? (
        <div className="instrument-chart-frame">
          <ResponsiveContainer height={380} width="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="chartLine" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor={isRangePositive ? '#0f766e' : '#b14f2b'} />
                  <stop offset="100%" stopColor={isRangePositive ? '#10b981' : '#ef4444'} />
                </linearGradient>
                <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isRangePositive ? '#0f766e' : '#b14f2b'} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={isRangePositive ? '#0f766e' : '#b14f2b'} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(25, 40, 62, 0.05)" strokeDasharray="3 5" vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="date"
                tick={AXIS_TICK}
                tickFormatter={(v: string) => formatXAxisTick(v, selectedRange)}
                tickLine={false}
                ticks={xTicks}
              />
              <YAxis
                axisLine={false}
                domain={yDomain}
                tick={AXIS_TICK}
                tickCount={5}
                tickFormatter={formatYAxisTick}
                tickLine={false}
                width={72}
              />
              <Tooltip content={ChartTooltipContent} />
              <Area
                dataKey="close"
                fill="url(#chartFill)"
                fillOpacity={1}
                isAnimationActive={false}
                stroke="url(#chartLine)"
                strokeWidth={2.5}
                type="monotone"
              />
              {chartType === 'ma-overlay' && (
                <>
                  <Line
                    connectNulls
                    dataKey="ma30"
                    dot={false}
                    isAnimationActive={false}
                    stroke="#f59e0b"
                    strokeWidth={1.8}
                    type="monotone"
                  />
                  <Line
                    connectNulls
                    dataKey="ma50"
                    dot={false}
                    isAnimationActive={false}
                    stroke="#3b82f6"
                    strokeWidth={1.8}
                    type="monotone"
                  />
                </>
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="empty-state">No chart points are available for the selected range.</p>
      )}

      <div className="instrument-chart-footer">
        <div className="instrument-chart-footer-meta">
          <span className="instrument-chart-footer-note">
            {chartSeries.length === instrumentDetail.historicalSeries.length
              ? `${chartSeries.length} data points`
              : `${chartSeries.length} of ${instrumentDetail.historicalSeries.length} points sampled`}
          </span>
          {instrumentDetail.earliestAvailableDate ? (
            <span className="instrument-chart-footer-note">
              History since {formatShortDate(instrumentDetail.earliestAvailableDate)}
            </span>
          ) : null}
        </div>
        <span className="instrument-chart-footer-source">
          Source: {instrumentDetail.latestQuote.source ?? 'market data'}
        </span>
      </div>
    </div>
  )
}
