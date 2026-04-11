import {
  CartesianGrid,
  Line,
  LineChart,
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
  const chartSeries = sampleChartSeries(
    instrumentDetail.historicalSeries,
    getMaxChartPoints(selectedRange),
  )

  return (
    <article className="panel panel-wide instrument-panel">
      <div className="instrument-summary-grid">
        <div className="metric-card metric-card--accent">
          <span className="metric-label">Last price</span>
          <strong className="metric-value">{formatCurrency(instrumentDetail.latestQuote.price)}</strong>
          <p>Latest snapshot from {instrumentDetail.latestQuote.source ?? 'market data'}.</p>
        </div>
        <div className="metric-card">
          <span className="metric-label">Daily change</span>
          <strong className="metric-value">{instrumentDetail.latestQuote.changePercent ?? '--'}</strong>
          <p>
            {instrumentDetail.latestQuote.change !== null &&
            instrumentDetail.latestQuote.change !== undefined
              ? `${instrumentDetail.latestQuote.change >= 0 ? '+' : ''}${instrumentDetail.latestQuote.change.toFixed(2)} USD`
              : 'No intraday change available.'}
          </p>
        </div>
        <div className="metric-card">
          <span className="metric-label">Latest trading day</span>
          <strong className="metric-value">{instrumentDetail.latestQuote.latestTradingDay ?? '--'}</strong>
          <p>{instrumentDetail.exchange ?? 'US market'}</p>
        </div>
      </div>

      <div className="chart-shell">
        <div className="chart-meta">
          <div className="panel-header-copy">
            <p className="section-label">Historical prices</p>
            <h2 className="panel-title">Daily close performance</h2>
          </div>

          <div className="range-selector">
            {RANGE_OPTIONS.map((rangeOption) => (
              <button
                className={selectedRange === rangeOption ? 'range-pill is-active' : 'range-pill'}
                key={rangeOption}
                onClick={() => onSelectRange(rangeOption)}
                type="button"
              >
                {rangeOption}
              </button>
            ))}
          </div>
        </div>

        <div className="chart-meta chart-meta--supporting">
          <p className="panel-note">
            {chartSeries.length === instrumentDetail.historicalSeries.length
              ? `${chartSeries.length} chart points in view.`
              : `${chartSeries.length} of ${instrumentDetail.historicalSeries.length} points shown for smoother rendering.`}
          </p>
          <span className="panel-tag">Range: {instrumentDetail.range}</span>
        </div>

        {chartSeries.length > 0 ? (
          <div className="chart-frame">
            <ResponsiveContainer height={340} width="100%">
              <LineChart data={chartSeries}>
                <CartesianGrid stroke="rgba(25, 40, 62, 0.08)" vertical={false} />
                <XAxis
                  axisLine={false}
                  dataKey="date"
                  minTickGap={28}
                  tickFormatter={formatShortDate}
                  tickLine={false}
                />
                <YAxis
                  axisLine={false}
                  tickFormatter={(value: number) => formatCurrency(value)}
                  tickLine={false}
                  width={92}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 18,
                    border: '1px solid rgba(25, 40, 62, 0.08)',
                    background: 'rgba(255, 255, 255, 0.98)',
                    boxShadow: '0 18px 40px rgba(10, 23, 39, 0.12)',
                  }}
                  formatter={(value) => [formatCurrency(Number(value ?? 0)), 'Close']}
                  labelFormatter={(label) =>
                    typeof label === 'string' ? formatLongDate(label) : ''
                  }
                />
                <Line
                  dataKey="close"
                  dot={false}
                  isAnimationActive={false}
                  stroke="url(#instrumentLine)"
                  strokeWidth={3}
                  type="monotone"
                />
                <defs>
                  <linearGradient id="instrumentLine" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="#0f766e" />
                    <stop offset="100%" stopColor="#cf6c41" />
                  </linearGradient>
                </defs>
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="empty-state">No chart points are available for the selected range.</p>
        )}
      </div>
    </article>
  )
}
