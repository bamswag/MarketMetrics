import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { InstrumentDetailResponse, InstrumentRange } from '../lib/api'
import { getMaxChartPoints, sampleChartSeries } from '../lib/chartUtils'
import { formatCurrency, formatLongDate, formatShortDate } from '../lib/formatters'

type InstrumentChartCardProps = {
  instrumentDetail: InstrumentDetailResponse
  selectedRange: InstrumentRange
  onSelectRange: (range: InstrumentRange) => void
}

const RANGE_OPTIONS: InstrumentRange[] = ['1M', '3M', '6M', '1Y', '5Y']

export function InstrumentChartCard({
  instrumentDetail,
  selectedRange,
  onSelectRange,
}: InstrumentChartCardProps) {
  const chartSeries = useMemo(
    () =>
      sampleChartSeries(
        instrumentDetail.historicalSeries,
        getMaxChartPoints(selectedRange),
      ),
    [instrumentDetail.historicalSeries, selectedRange],
  )

  const { minPrice, maxPrice } = useMemo(() => {
    if (chartSeries.length === 0) return { minPrice: 0, maxPrice: 0 }
    const prices = chartSeries.map((p) => p.close)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const padding = (max - min) * 0.08
    return { minPrice: Math.max(0, min - padding), maxPrice: max + padding }
  }, [chartSeries])

  const firstClose = chartSeries.length > 0 ? chartSeries[0].close : 0
  const lastClose = chartSeries.length > 0 ? chartSeries[chartSeries.length - 1].close : 0
  const rangeChange = lastClose - firstClose
  const rangeChangePct = firstClose > 0 ? ((rangeChange / firstClose) * 100).toFixed(2) : '0.00'
  const isRangePositive = rangeChange >= 0

  return (
    <div className="instrument-chart-wrapper">
      <div className="instrument-chart-header">
        <div className="instrument-chart-header-left">
          <h2 className="instrument-chart-title">Price History</h2>
          <div className="instrument-range-stats">
            <span className={`instrument-range-badge ${isRangePositive ? 'instrument-range-badge--up' : 'instrument-range-badge--down'}`}>
              {isRangePositive ? '+' : ''}{rangeChangePct}%
            </span>
            <span className="instrument-range-label">over {selectedRange}</span>
          </div>
        </div>

        <div className="instrument-range-bar">
          {RANGE_OPTIONS.map((rangeOption) => (
            <button
              className={selectedRange === rangeOption ? 'instrument-range-btn instrument-range-btn--active' : 'instrument-range-btn'}
              key={rangeOption}
              onClick={() => onSelectRange(rangeOption)}
              type="button"
            >
              {rangeOption}
            </button>
          ))}
        </div>
      </div>

      {chartSeries.length > 0 ? (
        <div className="instrument-chart-frame">
          <ResponsiveContainer height={380} width="100%">
            <AreaChart data={chartSeries} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
                tick={{ fill: '#687487', fontSize: 12 }}
                tickFormatter={formatShortDate}
                tickLine={false}
              />
              <YAxis
                axisLine={false}
                domain={[minPrice, maxPrice]}
                tick={{ fill: '#687487', fontSize: 12 }}
                tickFormatter={(value: number) => formatCurrency(value)}
                tickLine={false}
                width={85}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const value = Number(payload[0].value ?? 0)
                  return (
                    <div className="instrument-tooltip">
                      <span className="instrument-tooltip-date">{typeof label === 'string' ? formatLongDate(label) : ''}</span>
                      <span className="instrument-tooltip-price">{formatCurrency(value)}</span>
                    </div>
                  )
                }}
              />
              <Area
                dataKey="close"
                fill="url(#chartFill)"
                fillOpacity={1}
                isAnimationActive={false}
                stroke="url(#chartLine)"
                strokeWidth={2.5}
                type="monotone"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="empty-state">No chart points are available for the selected range.</p>
      )}

      <div className="instrument-chart-footer">
        <span className="instrument-chart-footer-note">
          {chartSeries.length === instrumentDetail.historicalSeries.length
            ? `${chartSeries.length} data points`
            : `${chartSeries.length} of ${instrumentDetail.historicalSeries.length} points sampled`}
        </span>
        <span className="instrument-chart-footer-source">
          Source: {instrumentDetail.latestQuote.source ?? 'market data'}
        </span>
      </div>
    </div>
  )
}
