import { useRef, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { ApiError, fetchForecast, type ForecastResponse } from '../lib/api'
import { formatCurrency, formatLongDate, formatShortDate } from '../lib/formatters'
import '../styles/components/PricePredictionPanel.css'

type PricePredictionPanelProps = {
  symbol: string
  token: string | undefined
  currentPrice: number | null
}

const HORIZON_OPTIONS = [
  { label: '7d', value: 7 },
  { label: '14d', value: 14 },
  { label: '30d', value: 30 },
  { label: '60d', value: 60 },
  { label: '90d', value: 90 },
]

const AXIS_TICK = { fill: '#687487', fontSize: 11 } as const
const HISTORY_BARS = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PredictionTooltip(props: any) {
  const { active, payload, label } = props ?? {}
  if (!active || !payload?.length) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actual = payload.find((p: any) => p.dataKey === 'close')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const forecast = payload.find((p: any) => p.dataKey === 'predictedClose')
  return (
    <div className="prediction-tooltip">
      <span className="prediction-tooltip-date">
        {typeof label === 'string' ? formatLongDate(label) : ''}
      </span>
      {actual?.value != null && (
        <span className="prediction-tooltip-price">
          {formatCurrency(Number(actual.value))}
        </span>
      )}
      {forecast?.value != null && (
        <span className="prediction-tooltip-forecast">
          Forecast: {formatCurrency(Number(forecast.value))}
        </span>
      )}
    </div>
  )
}

function buildChartData(result: ForecastResponse) {
  // Take last HISTORY_BARS of historical series
  const history = result.historicalSeries.slice(-HISTORY_BARS).map((p) => ({
    date: p.date,
    close: p.close,
    predictedClose: null as number | null,
    predictedCloseLow: null as number | null,
    predictedCloseHigh: null as number | null,
    isForecast: false,
  }))

  // Bridge: duplicate the last actual point as the first forecast point so lines connect
  const lastActual = history[history.length - 1]
  const bridge = lastActual
    ? {
        date: lastActual.date,
        close: null as number | null,
        predictedClose: result.lastActualClose,
        predictedCloseLow: null as number | null,
        predictedCloseHigh: null as number | null,
        isForecast: true,
      }
    : null

  const forecast = result.forecastSeries.map((p) => ({
    date: p.date,
    close: null as number | null,
    predictedClose: p.predictedClose,
    predictedCloseLow: p.predictedCloseLow ?? null,
    predictedCloseHigh: p.predictedCloseHigh ?? null,
    isForecast: true,
  }))

  return [...history, ...(bridge ? [bridge] : []), ...forecast]
}

function hasConfidenceBand(result: ForecastResponse): boolean {
  return result.forecastSeries.some(
    (p) => p.predictedCloseLow != null && p.predictedCloseHigh != null,
  )
}

export function PricePredictionPanel({ symbol, token, currentPrice }: PricePredictionPanelProps) {
  const [horizon, setHorizon] = useState(14)
  const [result, setResult] = useState<ForecastResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasFetched, setHasFetched] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  async function runForecast() {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    let cancelled = false

    setIsLoading(true)
    setError('')

    try {
      const data = await fetchForecast(token, symbol, horizon, controller.signal)
      if (!cancelled) {
        setResult(data)
        setHasFetched(true)
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        cancelled = true
        return
      }
      if (!cancelled) {
        const msg =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Unable to generate forecast right now.'
        setError(msg)
        setResult(null)
        setHasFetched(true)
      }
    } finally {
      if (!cancelled) setIsLoading(false)
    }
  }

  const predictedClose = result?.forecastSeries.at(-1)?.predictedClose ?? null
  const returnPct = result?.predictedReturnPctOverHorizon ?? null
  const tone =
    returnPct == null ? 'neutral' : returnPct > 0 ? 'positive' : returnPct < 0 ? 'negative' : 'neutral'
  const pillClass =
    tone === 'positive' ? 'positive-pill' : tone === 'negative' ? 'negative-pill' : 'neutral-pill'

  const chartData = result ? buildChartData(result) : []
  const todayDate = result?.historicalSeries.at(-1)?.date ?? null
  const showBand = result ? hasConfidenceBand(result) : false

  // Y-axis domain across both series
  const allPrices = chartData.flatMap((p) => {
    const vals: number[] = []
    if (p.close != null) vals.push(p.close)
    if (p.predictedClose != null) vals.push(p.predictedClose)
    if (p.predictedCloseLow != null) vals.push(p.predictedCloseLow)
    if (p.predictedCloseHigh != null) vals.push(p.predictedCloseHigh)
    return vals
  })
  const yMin = allPrices.length ? Math.min(...allPrices) : 0
  const yMax = allPrices.length ? Math.max(...allPrices) : 1
  const yPad = (yMax - yMin) * 0.08 || 1
  const yDomain: [number, number] = [Math.max(0, yMin - yPad), yMax + yPad]

  // Top-5 feature importances normalised to max=100%
  const topFeatures = result
    ? [...result.featureImportances]
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 5)
    : []
  const maxImportance = topFeatures[0]?.importance ?? 1

  const is503 = error.includes('not available') || error.includes('503') || error.includes('model')

  return (
    <div className="prediction-panel instrument-surface">
      {/* Header */}
      <div className="prediction-header">
        <div className="prediction-header-left">
          <h2 className="prediction-title">AI Price Forecast</h2>
          <div className="prediction-horizon-btns" role="group" aria-label="Forecast horizon">
            {HORIZON_OPTIONS.map((opt) => (
              <button
                className={`prediction-horizon-btn${horizon === opt.value ? ' is-active' : ''}`}
                key={opt.value}
                onClick={() => setHorizon(opt.value)}
                type="button"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <button
          className="primary-action prediction-run-btn"
          disabled={isLoading || !token}
          onClick={() => void runForecast()}
          title={!token ? 'Sign in to use forecasts' : undefined}
          type="button"
        >
          {isLoading ? 'Running…' : hasFetched ? 'Re-run' : 'Run forecast'}
        </button>
      </div>

      <p className="prediction-disclaimer">
        Forecasts are generated by a machine learning model and are not financial advice.
        {currentPrice != null && (
          <> Current price: <strong>{formatCurrency(currentPrice)}</strong>.</>
        )}
      </p>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="prediction-skeleton">
          <div className="prediction-skeleton-line" style={{ height: 32, width: '40%' }} />
          <div className="prediction-skeleton-line" style={{ height: 220 }} />
          <div className="prediction-skeleton-line" style={{ height: 56 }} />
        </div>
      )}

      {/* Idle — not yet fetched */}
      {!isLoading && !hasFetched && (
        <div className="prediction-idle">
          Choose a horizon above and click <strong>&nbsp;Run forecast&nbsp;</strong> to see a
          machine-learning price prediction for {symbol}.
        </div>
      )}

      {/* Error */}
      {!isLoading && hasFetched && error && (
        <div className={is503 ? 'prediction-unavailable' : 'prediction-error'}>
          {is503 ? (
            <span className="neutral-pill">Prediction model not available for {symbol} yet.</span>
          ) : (
            error
          )}
        </div>
      )}

      {/* Results */}
      {!isLoading && !error && result && (
        <>
          {/* Summary */}
          <div className="prediction-summary">
            <span className="prediction-price">
              {predictedClose != null ? formatCurrency(predictedClose) : '—'}
            </span>
            {returnPct != null && (
              <span className={pillClass}>
                {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%
              </span>
            )}
            <span className="prediction-horizon-label">over {horizon} days</span>
          </div>

          {/* Chart */}
          {chartData.length > 0 && (
            <div className="prediction-chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="pred-conf-band" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#c96a45" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#c96a45" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(25,40,62,0.06)" strokeDasharray="4 4" vertical={false} />
                  <XAxis
                    axisLine={false}
                    dataKey="date"
                    minTickGap={48}
                    tick={AXIS_TICK}
                    tickFormatter={formatShortDate}
                    tickLine={false}
                  />
                  <YAxis
                    axisLine={false}
                    domain={yDomain}
                    orientation="right"
                    tick={AXIS_TICK}
                    tickFormatter={(v: number) => formatCurrency(v)}
                    tickLine={false}
                    width={80}
                  />
                  <Tooltip content={PredictionTooltip} />

                  {/* Vertical "Today" reference line */}
                  {todayDate && (
                    <ReferenceLine
                      x={todayDate}
                      stroke="#687487"
                      strokeDasharray="4 3"
                      label={{
                        value: 'Today',
                        position: 'insideTopLeft',
                        fill: '#687487',
                        fontSize: 10,
                      }}
                    />
                  )}

                  {/* Confidence band (Area between low/high) */}
                  {showBand && (
                    <Area
                      dataKey="predictedCloseHigh"
                      stroke="none"
                      fill="url(#pred-conf-band)"
                      fillOpacity={1}
                      isAnimationActive={false}
                      dot={false}
                      connectNulls
                      type="monotone"
                      baseValue="dataMin"
                    />
                  )}

                  {/* Actual history line */}
                  <Line
                    dataKey="close"
                    stroke="#0f766e"
                    strokeWidth={2.2}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                    type="monotone"
                  />

                  {/* Forecast line */}
                  <Line
                    dataKey="predictedClose"
                    stroke="#c96a45"
                    strokeWidth={2.2}
                    strokeDasharray="6 3"
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                    type="monotone"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Accuracy metrics */}
          <div className="prediction-metrics-row">
            <div className="prediction-metric-tile">
              <span className="prediction-metric-label">Directional accuracy</span>
              <span className="prediction-metric-value">
                {(result.metrics.directionalAccuracy * 100).toFixed(1)}%
              </span>
            </div>
            <div className="prediction-metric-tile">
              <span className="prediction-metric-label">MAE (price)</span>
              <span className="prediction-metric-value">
                {formatCurrency(result.metrics.maePrice)}
              </span>
            </div>
            <div className="prediction-metric-tile">
              <span className="prediction-metric-label">Horizon</span>
              <span className="prediction-metric-value">{result.forecastHorizonDays}d</span>
            </div>
          </div>

          {/* Feature importances */}
          {topFeatures.length > 0 && (
            <div className="prediction-features">
              <p className="prediction-features-title">Top signals</p>
              {topFeatures.map((f) => (
                <div className="prediction-feature-row" key={f.feature}>
                  <span className="prediction-feature-name" title={f.feature}>
                    {f.feature}
                  </span>
                  <div className="prediction-feature-bar-track">
                    <div
                      className="prediction-feature-bar-fill"
                      style={{ width: `${(f.importance / maxImportance) * 100}%` }}
                    />
                  </div>
                  <span className="prediction-feature-value">
                    {(f.importance * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
