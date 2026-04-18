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

const RANGE_OPTIONS: InstrumentRange[] = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y', 'MAX']
const RANGE_LABELS: Record<InstrumentRange, string> = {
  '1D': '1D',
  '1W': '1W',
  '1M': '1M',
  '3M': '3M',
  '6M': '6M',
  '1Y': '1Y',
  '5Y': '5Y',
  MAX: 'MAX',
}
const AXIS_TICK = { fill: '#687487', fontSize: 12 } as const

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
  const isIntraday = typeof label === 'string' && label.includes('T')
  return (
    <div className="instrument-tooltip">
      <span className="instrument-tooltip-date">
        {typeof label === 'string'
          ? isIntraday
            ? `${formatLongDate(label)} · ${formatShortTime(label)}`
            : formatLongDate(label)
          : ''}
      </span>
      <span className="instrument-tooltip-price">{formatCurrency(value)}</span>
      {ma30Entry?.value != null && (
        <span className="instrument-tooltip-ma instrument-tooltip-ma--30">EMA30 {formatCurrency(Number(ma30Entry.value))}</span>
      )}
      {ma50Entry?.value != null && (
        <span className="instrument-tooltip-ma instrument-tooltip-ma--50">EMA50 {formatCurrency(Number(ma50Entry.value))}</span>
      )}
    </div>
  )
}

function formatYAxisTick(value: number) {
  return formatCurrency(value)
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
  const isIntraday = selectedRange === '1D'

  const livePrice = instrumentDetail.latestQuote.price
  const liveChange = instrumentDetail.latestQuote.change
  const liveChangePct = instrumentDetail.latestQuote.changePercent
  const isLivePositive = (liveChange ?? 0) >= 0

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

      {/* ── Live price row ── */}
      <div className="instrument-live-price-row">
        <span className="instrument-live-price-value">{formatCurrency(livePrice)}</span>
        {(liveChange != null || liveChangePct) && (
          <span className={isLivePositive ? 'positive-pill instrument-live-pill' : 'negative-pill instrument-live-pill'}>
            {liveChange != null ? `${isLivePositive ? '+' : ''}${liveChange.toFixed(2)}` : ''}
            {liveChangePct ? ` (${liveChangePct})` : ''}
          </span>
        )}
        {isIntraday && (
          <span className="instrument-live-label">Today · 15-min bars</span>
        )}
      </div>

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
              <CartesianGrid stroke="rgba(25, 40, 62, 0.06)" strokeDasharray="4 4" vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="date"
                minTickGap={40}
                tick={AXIS_TICK}
                tickFormatter={isIntraday ? formatShortTime : formatShortDate}
                tickLine={false}
              />
              <YAxis
                axisLine={false}
                domain={yDomain}
                tick={AXIS_TICK}
                tickFormatter={formatYAxisTick}
                tickLine={false}
                width={85}
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
