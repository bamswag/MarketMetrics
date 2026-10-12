import { useEffect, useMemo, useState } from 'react'
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
import {
  addSimpleMovingAverages,
  buildFiveTickScale,
  buildTimeTicks,
  formatAxisNumber,
  getMaxChartPoints,
  parseChartTimestamp,
  sampleChartSeries,
  type ChartPointWithMovingAverages,
} from '../lib/chartUtils'
import { formatCurrency, formatLongDate, formatShortDate, formatShortTime } from '../lib/formatters'
import '../styles/components/ChartTooltip.css'

type ChartType = 'price' | 'ma-overlay'

type InstrumentChartCardProps = {
  instrumentDetail: InstrumentDetailResponse
  selectedRange: InstrumentRange
  onSelectRange: (range: InstrumentRange) => void
}

type MarketStat = {
  description: string
  label: string
  value: string
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
const AXIS_TICK = { fill: 'var(--chart-axis)', fontSize: 11 } as const

/**
 * Format plain numbers (like volume) with compact notation when appropriate.
 * This is separate from currency formatting and always uses compact for large numbers.
 */
function formatCompactNumber(value?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '--'
  }

  const absValue = Math.abs(value)

  // Determine the appropriate scale
  let divisor = 1
  let suffix = ''

  if (absValue >= 1_000_000_000) {
    divisor = 1_000_000_000
    suffix = 'B'
  } else if (absValue >= 1_000_000) {
    divisor = 1_000_000
    suffix = 'M'
  } else if (absValue >= 1_000) {
    divisor = 1_000
    suffix = 'K'
  }

  const scaledValue = value / divisor
  const formatted = scaledValue.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: divisor === 1 ? 0 : 1,
  })

  return `${value < 0 ? '-' : ''}${formatted}${suffix}`
}

function formatOptionalCurrency(value?: number | null): string {
  return value === null || value === undefined ? '--' : formatCurrency(value)
}

/**
 * Format volume for the stat card in standard number format (no compact notation).
 * e.g. 658,000 instead of 658K. Tooltip uses formatCompactNumber separately.
 */
function formatVolumeStandard(value?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '--'
  }
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(value)
}

function formatPointLabel(value: string): string {
  return value.includes('T') ? formatShortTime(value) : formatLongDate(value)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltipContent(props: any) {
  const { active, payload } = props ?? {}
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
        {typeof point.date === 'string' ? formatPointLabel(point.date) : ''}
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
        <span className="instrument-tooltip-ma instrument-tooltip-ma--30">30-day average {formatCurrency(Number(ma30Entry.value))}</span>
      )}
      {ma50Entry?.value != null && (
        <span className="instrument-tooltip-ma instrument-tooltip-ma--50">50-day average {formatCurrency(Number(ma50Entry.value))}</span>
      )}
    </div>
  )
}

// Range-aware X-axis labels: year for MAX/5Y, "Apr '24" for 1Y/6M/3M, "Apr 17" for short ranges
function formatXAxisTick(value: number, range: InstrumentRange): string {
  const d = new Date(value)
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

export function InstrumentChartCard({
  instrumentDetail,
  selectedRange,
  onSelectRange,
}: InstrumentChartCardProps) {
  const [chartType, setChartType] = useState<ChartType>('price')
  const [viewportWidth, setViewportWidth] = useState(() => typeof window === 'undefined' ? 1440 : window.innerWidth)
  useEffect(() => {
    const updateWidth = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', updateWidth, { passive: true })
    return () => window.removeEventListener('resize', updateWidth)
  }, [])
  const hasAvailabilityMetadata = instrumentDetail.availableRanges.length > 0
  const availableRanges = useMemo(
    () => new Set(instrumentDetail.availableRanges),
    [instrumentDetail.availableRanges],
  )

  const finiteHistoricalSeries = useMemo(
    () => instrumentDetail.historicalSeries.filter((point) => Number.isFinite(point.close)),
    [instrumentDetail.historicalSeries],
  )

  const chartData = useMemo(() => {
    const maxPoints = getMaxChartPoints(selectedRange)
    if (chartType !== 'ma-overlay') {
      return sampleChartSeries(finiteHistoricalSeries, maxPoints)
    }

    const averagedSeries = addSimpleMovingAverages(finiteHistoricalSeries)
    return sampleChartSeries(averagedSeries, maxPoints).filter((point) => (
      Number.isFinite(point.close)
      && Number.isFinite(point.ma30)
      && Number.isFinite(point.ma50)
    ))
  }, [chartType, finiteHistoricalSeries, selectedRange])
  const chartSeries = useMemo(
    () => chartData.map((point) => ({ ...point, timestamp: parseChartTimestamp(point.date) })),
    [chartData],
  )

  const xTicks = useMemo(
    () => buildTimeTicks(chartSeries, viewportWidth),
    [chartSeries, viewportWidth],
  )

  const yScale = useMemo(() => {
    const prices = chartSeries.flatMap((point) => {
      if (chartType !== 'ma-overlay') {
        return [point.close]
      }

      const movingAveragePoint = point as unknown as ChartPointWithMovingAverages
      return [point.close, movingAveragePoint.ma30, movingAveragePoint.ma50]
    }).filter((v) => Number.isFinite(v))
    return buildFiveTickScale(prices)
  }, [chartSeries, chartType])

  const rangeSummary = instrumentDetail.rangeSummary
  const rangeChangePct = rangeSummary.changePercent.toFixed(2)
  const isRangePositive = rangeSummary.change >= 0
  const quote = instrumentDetail.latestQuote
  const livePrice = quote.price
  const marketStats: MarketStat[] = [
    {
      label: 'Chart high',
      value: formatOptionalCurrency(rangeSummary.highClose),
      description: `The highest closing price in the selected ${RANGE_LABELS[selectedRange]} range.`,
    },
    {
      label: 'Chart low',
      value: formatOptionalCurrency(rangeSummary.lowClose),
      description: `The lowest closing price in the selected ${RANGE_LABELS[selectedRange]} range.`,
    },
    {
      label: "Today's volume",
      value: formatVolumeStandard(quote.volume),
      description: 'The amount traded during the latest trading day.',
    },
    {
      label: "Today's VWAP",
      value: formatOptionalCurrency(quote.vwap),
      description: 'The volume-weighted average price. Bigger trades have more influence on this average.',
    },
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
            <option value="ma-overlay">Moving averages</option>
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
          {marketStats.map((stat, index) => {
            const tooltipId = `instrument-market-stat-${index}`
            return (
              <div
                aria-describedby={tooltipId}
                className="instrument-market-stat"
                key={stat.label}
                role="group"
                tabIndex={0}
              >
                <span className="instrument-market-stat-label">{stat.label}</span>
                <strong className="instrument-market-stat-value">{stat.value}</strong>
                <span className="instrument-market-stat-tooltip" id={tooltipId} role="tooltip">
                  {stat.description}
                </span>
              </div>
            )
          })}
        </div>
      ) : null}

      {chartType === 'ma-overlay' && (
        <div className="instrument-chart-legend-group">
          <div className="instrument-chart-legend">
            <span className={`instrument-chart-legend-pill instrument-chart-legend-pill--price ${isRangePositive ? 'instrument-chart-legend-pill--price-up' : 'instrument-chart-legend-pill--price-down'}`}>
              <span className={`instrument-chart-legend-swatch instrument-chart-legend-swatch--price ${isRangePositive ? 'instrument-chart-legend-swatch--price-up' : 'instrument-chart-legend-swatch--price-down'}`} />
              Price
            </span>
            <span className="instrument-chart-legend-pill instrument-chart-legend-pill--ma30">
              <span className="instrument-chart-legend-swatch instrument-chart-legend-swatch--ma30" />
              30-day moving average
            </span>
            <span className="instrument-chart-legend-pill instrument-chart-legend-pill--ma50">
              <span className="instrument-chart-legend-swatch instrument-chart-legend-swatch--ma50" />
              50-day moving average
            </span>
          </div>
          <p className="instrument-chart-legend-helper">
            Moving averages smooth out daily price swings; early points use the history available so far.
          </p>
        </div>
      )}

      {chartData.length > 0 ? (
        <div className="instrument-chart-frame">
          <p className="sr-only">
            {instrumentDetail.symbol} price history over {RANGE_LABELS[selectedRange]}. Latest close {formatCurrency(rangeSummary.latestClose)}, chart high {formatCurrency(rangeSummary.highClose)}, chart low {formatCurrency(rangeSummary.lowClose)}, {isRangePositive ? 'gain' : 'loss'} {Math.abs(rangeSummary.changePercent).toFixed(2)} percent.
          </p>
          <ResponsiveContainer
            height={380}
            initialDimension={{ width: 1, height: 380 }}
            minHeight={0}
            minWidth={0}
            width="100%"
          >
            <AreaChart data={chartSeries} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="chartLine" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor={isRangePositive ? 'var(--brand-green)' : 'var(--red-danger)'} />
                  <stop offset="100%" stopColor={isRangePositive ? 'var(--green-bright)' : 'var(--red-red-bright)'} />
                </linearGradient>
                <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isRangePositive ? 'var(--brand-green)' : 'var(--red-danger)'} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={isRangePositive ? 'var(--brand-green)' : 'var(--red-danger)'} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 5" vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="timestamp"
                domain={['dataMin', 'dataMax']}
                scale="time"
                type="number"
                tick={AXIS_TICK}
                tickFormatter={(v: number) => formatXAxisTick(v, selectedRange)}
                tickLine={false}
                ticks={xTicks}
              />
              <YAxis
                axisLine={false}
                domain={yScale.domain}
                tick={AXIS_TICK}
                ticks={yScale.ticks}
                tickFormatter={(value: number) => formatAxisNumber(value, yScale.step)}
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
                    activeDot={false}
                    dataKey="ma50"
                    dot={false}
                    isAnimationActive={false}
                    stroke="#3b82f6"
                    strokeLinecap="round"
                    strokeOpacity={0.18}
                    strokeWidth={7}
                    type="monotone"
                  />
                  <Line
                    activeDot={false}
                    dataKey="ma30"
                    dot={false}
                    isAnimationActive={false}
                    stroke="var(--red-amber)"
                    strokeLinecap="round"
                    strokeOpacity={0.2}
                    strokeWidth={6}
                    type="monotone"
                  />
                  <Line
                    activeDot={{ fill: '#3b82f6', r: 4.5, stroke: 'var(--bg-elevated)', strokeWidth: 2 }}
                    dataKey="ma50"
                    dot={false}
                    isAnimationActive={false}
                    stroke="#3b82f6"
                    strokeLinecap="round"
                    strokeWidth={2.35}
                    type="monotone"
                  />
                  <Line
                    activeDot={{ fill: 'var(--red-amber)', r: 4.5, stroke: 'var(--bg-elevated)', strokeWidth: 2 }}
                    dataKey="ma30"
                    dot={false}
                    isAnimationActive={false}
                    stroke="var(--red-amber)"
                    strokeLinecap="round"
                    strokeWidth={2.15}
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
          {rangeSummary.rangeStart && rangeSummary.rangeEnd ? (
            <span className="instrument-chart-footer-note">
              Range {formatShortDate(rangeSummary.rangeStart)}–{formatShortDate(rangeSummary.rangeEnd)}
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
