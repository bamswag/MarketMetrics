import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
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

import { MoverLogo } from '../components/MoverLogo'
import {
  ApiError,
  fetchForecast,
  fetchInstrumentDetail,
  type ForecastResponse,
  type InstrumentDetailResponse,
} from '../lib/api'
import { formatCurrency, formatLongDate, formatShortDate } from '../lib/formatters'
import '../styles/pages/ForecastPage.css'

type ForecastPageProps = {
  token?: string
}

const HORIZON_OPTIONS = [
  { label: '7 days', value: 7 },
  { label: '14 days', value: 14 },
  { label: '30 days', value: 30 },
  { label: '60 days', value: 60 },
  { label: '90 days', value: 90 },
]

const AXIS_TICK = { fill: '#687487', fontSize: 11 } as const
const HISTORY_BARS = 60

// ── Tooltip ────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ForecastTooltip(props: any) {
  const { active, payload, label } = props ?? {}
  if (!active || !payload?.length) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actual = payload.find((p: any) => p.dataKey === 'close')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const forecast = payload.find((p: any) => p.dataKey === 'predictedClose')
  return (
    <div className="instrument-tooltip">
      <span className="instrument-tooltip-date">
        {typeof label === 'string' ? formatLongDate(label) : ''}
      </span>
      {actual?.value != null && (
        <span className="instrument-tooltip-price">
          {formatCurrency(Number(actual.value))}
        </span>
      )}
      {forecast?.value != null && (
        <span className="instrument-tooltip-price" style={{ color: '#c96a45' }}>
          Forecast: {formatCurrency(Number(forecast.value))}
        </span>
      )}
    </div>
  )
}

// ── Chart data builder ──────────────────────────────────────────────────────
function buildChartData(result: ForecastResponse) {
  const history = result.historicalSeries.slice(-HISTORY_BARS).map((p) => ({
    date: p.date,
    close: p.close,
    predictedClose: null as number | null,
    predictedCloseLow: null as number | null,
    predictedCloseHigh: null as number | null,
  }))

  // Bridge point so the two lines connect at "Today"
  const lastActual = history[history.length - 1]
  const bridge = lastActual
    ? {
        date: lastActual.date,
        close: null as number | null,
        predictedClose: result.lastActualClose,
        predictedCloseLow: null as number | null,
        predictedCloseHigh: null as number | null,
      }
    : null

  const forecast = result.forecastSeries.map((p) => ({
    date: p.date,
    close: null as number | null,
    predictedClose: p.predictedClose,
    predictedCloseLow: p.predictedCloseLow ?? null,
    predictedCloseHigh: p.predictedCloseHigh ?? null,
  }))

  return [...history, ...(bridge ? [bridge] : []), ...forecast]
}

// ── Main component ──────────────────────────────────────────────────────────
export function ForecastPage({ token }: ForecastPageProps) {
  const { symbol: rawSymbol } = useParams<{ symbol: string }>()
  const [searchParams] = useSearchParams()
  const symbol = rawSymbol?.toUpperCase() ?? ''

  const initialHorizon = parseInt(searchParams.get('horizon') ?? '14', 10)
  const validInitial = HORIZON_OPTIONS.some((o) => o.value === initialHorizon)
    ? initialHorizon
    : 14

  const [horizon, setHorizon] = useState(validInitial)
  const [result, setResult] = useState<ForecastResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [statusCode, setStatusCode] = useState<number | null>(null)
  const [instrument, setInstrument] = useState<InstrumentDetailResponse | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  // Fetch lightweight instrument context (name + logo)
  useEffect(() => {
    if (!symbol) return
    void fetchInstrumentDetail(token, symbol, '1M').then(setInstrument).catch(() => null)
  }, [symbol, token])

  // Auto-run forecast whenever horizon changes (or on first load)
  useEffect(() => {
    if (!symbol || !token) return

    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    let cancelled = false

    setIsLoading(true)
    setError('')
    setStatusCode(null)

    fetchForecast(token, symbol, horizon, controller.signal)
      .then((data) => {
        if (!cancelled) {
          setResult(data)
        }
      })
      .catch((err) => {
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
          if (err instanceof ApiError) setStatusCode(err.status ?? null)
          setError(msg)
          setResult(null)
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [symbol, token, horizon])

  // Chart data
  const chartData = useMemo(() => (result ? buildChartData(result) : []), [result])
  const todayDate = result?.historicalSeries.at(-1)?.date ?? null
  const showBand = result?.forecastSeries.some(
    (p) => p.predictedCloseLow != null && p.predictedCloseHigh != null,
  ) ?? false

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
  const yPad = (yMax - yMin) * 0.1 || 1
  const yDomain: [number, number] = [Math.max(0, yMin - yPad), yMax + yPad]

  // Feature importances
  const topFeatures = result
    ? [...result.featureImportances].sort((a, b) => b.importance - a.importance).slice(0, 7)
    : []
  const maxImportance = topFeatures[0]?.importance ?? 1

  // Derived stats
  const predictedEndPrice = result?.forecastSeries.at(-1)?.predictedClose ?? null
  const returnPct = result?.predictedReturnPctOverHorizon ?? null
  const tone =
    returnPct == null ? 'neutral' : returnPct > 0 ? 'positive' : returnPct < 0 ? 'negative' : 'neutral'
  const pillClass =
    tone === 'positive' ? 'positive-pill' : tone === 'negative' ? 'negative-pill' : 'neutral-pill'

  const companyName = instrument?.companyName ?? symbol
  const is503 = statusCode === 503 || error.toLowerCase().includes('model') || error.toLowerCase().includes('not available')

  return (
    <section className="forecast-page page-section">
      {/* ── Hero ── */}
      <div className="forecast-hero">
        <Link className="forecast-back-link" to={`/instrument/${encodeURIComponent(symbol)}`}>
          ← Back to {symbol}
        </Link>

        <div className="forecast-hero-row">
          <div className="forecast-hero-identity">
            <MoverLogo name={companyName} symbol={symbol} />
            <div className="forecast-hero-text">
              <h1 className="forecast-hero-symbol">{symbol}</h1>
              {companyName !== symbol && (
                <span className="forecast-hero-name">{companyName}</span>
              )}
              <span className="forecast-hero-badge">AI Price Forecast</span>
            </div>
          </div>

          <div>
            <div className="forecast-horizon-row">
              <span className="forecast-horizon-label">Horizon</span>
              {HORIZON_OPTIONS.map((opt) => (
                <button
                  className={`forecast-horizon-btn${horizon === opt.value ? ' is-active' : ''}`}
                  disabled={isLoading}
                  key={opt.value}
                  onClick={() => setHorizon(opt.value)}
                  type="button"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stats row — shown when we have a result */}
        {result && !isLoading && (
          <div className="forecast-stats-row">
            <div className="forecast-stat">
              <span className="forecast-stat-label">Current price</span>
              <span className="forecast-stat-value">
                {formatCurrency(result.lastActualClose)}
              </span>
            </div>
            <div className="forecast-stat">
              <span className="forecast-stat-label">Predicted ({horizon}d)</span>
              <span className={`forecast-stat-value${tone === 'positive' ? '' : tone === 'negative' ? ' forecast-stat-value--accent' : ''}`}>
                {predictedEndPrice != null ? formatCurrency(predictedEndPrice) : '—'}
              </span>
            </div>
            <div className="forecast-stat">
              <span className="forecast-stat-label">Expected move</span>
              <span className="forecast-stat-value">
                {returnPct != null ? (
                  <span className={pillClass}>
                    {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%
                  </span>
                ) : '—'}
              </span>
            </div>
            <div className="forecast-stat">
              <span className="forecast-stat-label">Model accuracy</span>
              <span className="forecast-stat-value">
                {(result.metrics.directionalAccuracy * 100).toFixed(0)}%
              </span>
              <span className="forecast-stat-sub">directional</span>
            </div>
          </div>
        )}

        {/* Stats skeleton */}
        {isLoading && (
          <div className="forecast-stats-row">
            {[1, 2, 3, 4].map((i) => (
              <div className="forecast-stat" key={i}>
                <div className="forecast-skeleton" style={{ height: 12, width: '60%', marginBottom: 8 }} />
                <div className="forecast-skeleton" style={{ height: 28, width: '80%' }} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── No auth ── */}
      {!token && (
        <div className="forecast-error-card">
          <span className="forecast-error-icon">🔒</span>
          <h2 className="forecast-error-title">Sign in to use AI forecasts</h2>
          <p className="forecast-error-sub">
            Price forecasting requires an account. Sign in or create a free account to continue.
          </p>
          <Link className="primary-action" to="/login">Sign in</Link>
        </div>
      )}

      {/* ── Error ── */}
      {token && !isLoading && error && (
        <div className="forecast-error-card">
          <span className="forecast-error-icon">{is503 ? '🤖' : '⚠️'}</span>
          <h2 className="forecast-error-title">
            {is503 ? 'Model not available yet' : 'Forecast unavailable'}
          </h2>
          <p className="forecast-error-sub">
            {is503
              ? `The prediction model hasn't been trained for ${symbol} yet. Try a major stock or crypto symbol.`
              : error}
          </p>
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {token && isLoading && (
        <div className="forecast-loading">
          <div className="forecast-chart-card">
            <div className="forecast-skeleton" style={{ height: 320 }} />
          </div>
          <div className="forecast-bottom-grid">
            <div className="forecast-skeleton" style={{ height: 200 }} />
            <div className="forecast-skeleton" style={{ height: 200 }} />
          </div>
        </div>
      )}

      {/* ── Chart ── */}
      {token && !isLoading && !error && result && chartData.length > 0 && (
        <div className="forecast-chart-card">
          <div className="forecast-chart-header">
            <h2 className="forecast-chart-title">Price history + {horizon}-day forecast</h2>
            <div className="forecast-chart-legend">
              <span className="forecast-legend-item">
                <span className="forecast-legend-swatch forecast-legend-swatch--actual" />
                Actual
              </span>
              <span className="forecast-legend-item">
                <span className="forecast-legend-swatch forecast-legend-swatch--forecast" />
                Forecast
              </span>
              {showBand && (
                <span className="forecast-legend-item">
                  <span className="forecast-legend-swatch forecast-legend-swatch--band" />
                  Confidence band
                </span>
              )}
            </div>
          </div>

          <div className="forecast-chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="fc-band" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#c96a45" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#c96a45" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="rgba(25,40,62,0.06)"
                  strokeDasharray="4 4"
                  vertical={false}
                />
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
                <Tooltip content={ForecastTooltip} />

                {todayDate && (
                  <ReferenceLine
                    label={{
                      fill: '#687487',
                      fontSize: 10,
                      position: 'insideTopLeft',
                      value: 'Today',
                    }}
                    stroke="#687487"
                    strokeDasharray="4 3"
                    x={todayDate}
                  />
                )}

                {showBand && (
                  <Area
                    baseValue="dataMin"
                    connectNulls
                    dataKey="predictedCloseHigh"
                    dot={false}
                    fill="url(#fc-band)"
                    fillOpacity={1}
                    isAnimationActive={false}
                    stroke="none"
                    type="monotone"
                  />
                )}

                <Line
                  connectNulls
                  dataKey="close"
                  dot={false}
                  isAnimationActive={false}
                  stroke="#0f766e"
                  strokeWidth={2.2}
                  type="monotone"
                />
                <Line
                  connectNulls
                  dataKey="predictedClose"
                  dot={false}
                  isAnimationActive={false}
                  stroke="#c96a45"
                  strokeDasharray="7 3"
                  strokeWidth={2.2}
                  type="monotone"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Bottom grid: accuracy + features ── */}
      {token && !isLoading && !error && result && (
        <div className="forecast-bottom-grid">
          {/* Accuracy */}
          <div className="forecast-accuracy-card">
            <p className="forecast-card-title">Model accuracy</p>
            <div className="forecast-metrics-grid">
              <div className="forecast-metric-tile">
                <span className="forecast-metric-label">Directional accuracy</span>
                <span className="forecast-metric-value forecast-metric-value--positive">
                  {(result.metrics.directionalAccuracy * 100).toFixed(1)}%
                </span>
              </div>
              <div className="forecast-metric-tile">
                <span className="forecast-metric-label">MAE (price)</span>
                <span className="forecast-metric-value">
                  {formatCurrency(result.metrics.maePrice)}
                </span>
              </div>
              <div className="forecast-metric-tile">
                <span className="forecast-metric-label">RMSE (price)</span>
                <span className="forecast-metric-value">
                  {formatCurrency(result.metrics.rmsePrice)}
                </span>
              </div>
              <div className="forecast-metric-tile">
                <span className="forecast-metric-label">MAE (return)</span>
                <span className="forecast-metric-value">
                  {(result.metrics.maeReturn * 100).toFixed(3)}%
                </span>
              </div>
            </div>
          </div>

          {/* Feature importances */}
          {topFeatures.length > 0 && (
            <div className="forecast-features-card">
              <p className="forecast-card-title">Top predictive signals</p>
              <div className="forecast-features-list">
                {topFeatures.map((f, i) => (
                  <div className="forecast-feature-row" key={f.feature}>
                    <span className="forecast-feature-rank">{i + 1}</span>
                    <span className="forecast-feature-name" title={f.feature}>
                      {f.feature}
                    </span>
                    <div className="forecast-feature-bar-track">
                      <div
                        className="forecast-feature-bar-fill"
                        style={{ width: `${(f.importance / maxImportance) * 100}%` }}
                      />
                    </div>
                    <span className="forecast-feature-pct">
                      {(f.importance * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Disclaimer ── */}
      {token && !isLoading && !error && result && (
        <p className="forecast-disclaimer">
          ⚠️ Forecasts are generated by a machine learning model trained on historical price data.
          They are not financial advice and should not be used as the sole basis for investment decisions.
          Past model performance does not guarantee future accuracy. Always do your own research.
        </p>
      )}
    </section>
  )
}
