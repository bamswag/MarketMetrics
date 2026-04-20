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

// ── Ticker / concept dictionary for humanizing feature names ───────────────
const TICKER_LABELS: Record<string, string> = {
  spy: 'S&P 500',
  qqq: 'Nasdaq 100',
  dia: 'Dow Jones',
  iwm: 'Russell 2000',
  vxx: 'Volatility (VXX)',
  vix: 'VIX',
  tlt: '20Y Treasury',
  ief: '10Y Treasury',
  shy: '2Y Treasury',
  gld: 'Gold',
  slv: 'Silver',
  uso: 'Oil',
  uup: 'US Dollar',
  hyg: 'High-yield bonds',
  lqd: 'Investment-grade bonds',
  btc: 'Bitcoin',
  eth: 'Ethereum',
}

// Translates a raw model feature name (e.g. "qqq_sma_ratio_50") into plain English.
function humanizeFeatureName(raw: string): string {
  let s = raw.toLowerCase().trim()

  // Pull off a leading known ticker prefix
  let prefix = ''
  for (const [key, label] of Object.entries(TICKER_LABELS)) {
    if (s === key) return label
    if (s.startsWith(`${key}_`)) {
      prefix = label
      s = s.substring(key.length + 1)
      break
    }
  }

  // Known patterns (order matters — longest first)
  const patterns: Array<[RegExp, string]> = [
    [/^sma_ratio_(\d+)$/, 'price vs $1-day average'],
    [/^ema_ratio_(\d+)$/, 'price vs $1-day EMA'],
    [/^sma_(\d+)$/, '$1-day moving average'],
    [/^ema_(\d+)$/, '$1-day exponential avg'],
    [/^rsi_?(\d+)?$/, 'RSI momentum'],
    [/^macd(_signal)?$/, 'MACD trend'],
    [/^bollinger_?.*$/, 'Bollinger band position'],
    [/^intraday_return$/, 'today\u2019s move'],
    [/^overnight_return$/, 'overnight move'],
    [/^return_(\d+)d$/, '$1-day return'],
    [/^return$/, 'recent return'],
    [/^log_return_(\d+)d$/, '$1-day log return'],
    [/^log_return$/, 'log return'],
    [/^volatility_(\d+)d?$/, '$1-day volatility'],
    [/^volatility$/, 'recent volatility'],
    [/^realized_vol_(\d+)$/, '$1-day realized volatility'],
    [/^volume_ratio_(\d+)?$/, 'volume vs average'],
    [/^volume_ratio$/, 'volume vs average'],
    [/^volume$/, 'trading volume'],
    [/^high_low_range$/, 'daily high-low range'],
    [/^close$/, 'close price'],
    [/^open$/, 'open price'],
    [/^day_of_week$/, 'day of week'],
    [/^month$/, 'month of year'],
    [/^gap$/, 'overnight gap'],
  ]

  let label: string | null = null
  for (const [re, template] of patterns) {
    const m = s.match(re)
    if (m) {
      label = template.replace(/\$(\d+)/g, (_full, idx) => m[Number(idx)] ?? '')
      break
    }
  }

  if (!label) {
    // Fallback: underscores → spaces, capitalize
    label = s.replace(/_/g, ' ').trim()
  }

  const combined = prefix ? `${prefix} · ${label}` : label
  return combined.charAt(0).toUpperCase() + combined.slice(1)
}

// Short user-friendly description for each metric
const METRIC_DESCRIPTIONS: Record<string, string> = {
  directional:
    'How often the model correctly predicted up vs. down on past data. Above 55% is considered genuinely useful; 50% is equivalent to a coin flip.',
  maePrice:
    'Mean Absolute Error on price — the average dollar distance between predicted and actual price during backtesting. Lower is better.',
  rmsePrice:
    'Root Mean Squared Error — like MAE but penalises large misses more heavily. Useful for spotting tail risk.',
  maeReturn:
    'Average absolute error expressed as a percent return. Keeps the number comparable across high- and low-priced instruments.',
}

// Builds a plain-language verdict summarising the forecast.
function buildVerdict(
  symbol: string,
  returnPct: number | null,
  dirAcc: number,
): { headline: string; sub: string; tone: 'positive' | 'negative' | 'neutral' } {
  if (returnPct == null) {
    return {
      headline: 'Forecast unavailable',
      sub: 'The model could not produce a reliable forecast for this horizon.',
      tone: 'neutral',
    }
  }

  const mag = Math.abs(returnPct)
  const direction = returnPct >= 0 ? 'rise' : 'fall'
  const tone: 'positive' | 'negative' | 'neutral' =
    returnPct > 0.5 ? 'positive' : returnPct < -0.5 ? 'negative' : 'neutral'

  let strength: string
  if (mag < 0.75) strength = `stay roughly flat`
  else if (mag < 2.5) strength = `${direction} slightly`
  else if (mag < 6) strength = `${direction} moderately`
  else strength = `${direction} sharply`

  const accPct = dirAcc * 100
  let confidence: string
  if (accPct >= 60) confidence = 'moderate historical confidence'
  else if (accPct >= 55) confidence = 'low historical confidence'
  else if (accPct >= 50) confidence = 'barely above a coin flip on past data'
  else confidence = 'worse than random on past data — take with care'

  return {
    headline: `The model expects ${symbol} to ${strength}.`,
    sub: `Directional accuracy in backtesting is ${accPct.toFixed(0)}% — ${confidence}.`,
    tone,
  }
}

// ── Tooltip factory — closes over the current (today's) price for % change calc ──
function makeForecastTooltip(currentPrice: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function ForecastTooltip(props: any) {
    const { active, payload, label } = props ?? {}
    if (!active || !payload?.length) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actual    = payload.find((p: any) => p.dataKey === 'close')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const forecast  = payload.find((p: any) => p.dataKey === 'predictedClose')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const highEntry = payload.find((p: any) => p.dataKey === 'predictedCloseHigh')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lowEntry  = payload.find((p: any) => p.dataKey === 'predictedCloseLow')

    const forecastVal = forecast?.value != null ? Number(forecast.value) : null
    const pctChange =
      forecastVal != null && currentPrice > 0
        ? ((forecastVal - currentPrice) / currentPrice) * 100
        : null
    const highVal = highEntry?.value != null ? Number(highEntry.value) : null
    const lowVal  = lowEntry?.value  != null ? Number(lowEntry.value)  : null

    return (
      <div className="instrument-tooltip forecast-tooltip">
        <span className="instrument-tooltip-date">
          {typeof label === 'string' ? formatLongDate(label) : ''}
        </span>

        {actual?.value != null && (
          <span className="instrument-tooltip-price">
            {formatCurrency(Number(actual.value))}
          </span>
        )}

        {forecastVal != null && (
          <div className="forecast-tooltip-block">
            <span className="forecast-tooltip-tag">Model forecast</span>
            <span className="forecast-tooltip-price">{formatCurrency(forecastVal)}</span>
            {pctChange != null && (
              <span
                className={`forecast-tooltip-change ${
                  pctChange >= 0 ? 'forecast-tooltip-change--up' : 'forecast-tooltip-change--down'
                }`}
              >
                {pctChange >= 0 ? '↑' : '↓'} {Math.abs(pctChange).toFixed(2)}% from today
              </span>
            )}
            {highVal != null && lowVal != null && (
              <span className="forecast-tooltip-range">
                Range: {formatCurrency(lowVal)} – {formatCurrency(highVal)}
              </span>
            )}
          </div>
        )}
      </div>
    )
  }
}

// ── "Today" label component for the ReferenceLine ─────────────────────────
function TodayLabel(props: { viewBox?: { x: number; y: number; height: number } }) {
  const { viewBox } = props
  if (!viewBox) return null
  const { x, y } = viewBox
  return (
    <g>
      <rect
        fill="rgba(104,116,135,0.10)"
        height={18}
        rx={5}
        stroke="rgba(104,116,135,0.22)"
        strokeWidth={0.5}
        width={46}
        x={x - 23}
        y={y + 10}
      />
      <text
        dominantBaseline="middle"
        fill="#687487"
        fontSize={9}
        fontWeight={700}
        letterSpacing={0.8}
        textAnchor="middle"
        x={x}
        y={y + 19}
      >
        TODAY
      </text>
    </g>
  )
}

// ── Chart data builder ──────────────────────────────────────────────────────
function buildChartData(result: ForecastResponse) {
  const sliced = result.historicalSeries.slice(-HISTORY_BARS)

  const history = sliced.map((p, i) => {
    const isLast = i === sliced.length - 1
    // At the last history point seed predictedClose + band at the close price.
    // This anchors the blue dot and the uncertainty band right at "Today" with
    // zero width, then both expand naturally into the forecast zone.
    return {
      date: p.date,
      close: p.close,
      predictedClose:    isLast ? (p.close as number | null) : (null as number | null),
      predictedCloseLow: isLast ? (p.close as number | null) : (null as number | null),
      predictedCloseHigh:isLast ? (p.close as number | null) : (null as number | null),
    }
  })

  const forecast = result.forecastSeries.map((p, i) => {
    // Use API bounds when available, otherwise synthesise an expanding band
    // that widens ±0.6% per step — communicates growing uncertainty over time
    const expansionRate = 0.006 * (i + 1)
    const high = p.predictedCloseHigh ?? p.predictedClose * (1 + expansionRate)
    const low  = p.predictedCloseLow  ?? Math.max(0, p.predictedClose * (1 - expansionRate))
    return {
      date: p.date,
      close:              null as number | null,
      predictedClose:     p.predictedClose,
      predictedCloseLow:  low,
      predictedCloseHigh: high,
    }
  })

  return [...history, ...forecast]
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
  // Band is always shown — we synthesise expanding bounds if the API doesn't provide them
  const showBand = (result?.forecastSeries.length ?? 0) > 0

  // Tooltip renderer closes over current price for % change calculation
  const tooltipComponent = useMemo(
    () => (result ? makeForecastTooltip(result.lastActualClose) : undefined),
    [result],
  )

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
  const verdict = result
    ? buildVerdict(symbol, returnPct, result.metrics.directionalAccuracy)
    : null
  const priceDelta =
    result && predictedEndPrice != null
      ? predictedEndPrice - result.lastActualClose
      : null

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

          <div className="forecast-horizon-group">
            <span className="forecast-horizon-label">Forecast horizon</span>
            <div className="forecast-horizon-row">
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
              ? `The prediction model hasn\u2019t been trained for ${symbol} yet. Try a major stock or crypto symbol.`
              : error}
          </p>
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {token && isLoading && (
        <div className="forecast-loading">
          <div className="forecast-skeleton" style={{ height: 180, borderRadius: 22 }} />
          <div className="forecast-skeleton" style={{ height: 360, borderRadius: 22 }} />
          <div className="forecast-bottom-grid">
            <div className="forecast-skeleton" style={{ height: 220, borderRadius: 22 }} />
            <div className="forecast-skeleton" style={{ height: 220, borderRadius: 22 }} />
          </div>
        </div>
      )}

      {/* ── Verdict / summary card ── */}
      {token && !isLoading && !error && result && verdict && (
        <div className={`forecast-verdict-card forecast-verdict-card--${verdict.tone}`}>
          <div className="forecast-verdict-main">
            <span className="forecast-verdict-eyebrow">
              In the next {horizon} days
            </span>
            <h2 className="forecast-verdict-headline">{verdict.headline}</h2>
            <p className="forecast-verdict-sub">{verdict.sub}</p>
          </div>

          <div className="forecast-verdict-figures">
            <div className="forecast-figure">
              <span className="forecast-figure-label">Today</span>
              <span className="forecast-figure-value">
                {formatCurrency(result.lastActualClose)}
              </span>
            </div>
            <span className="forecast-figure-arrow" aria-hidden>→</span>
            <div className="forecast-figure">
              <span className="forecast-figure-label">
                Predicted in {horizon}d
              </span>
              <span className="forecast-figure-value forecast-figure-value--forecast">
                {predictedEndPrice != null ? formatCurrency(predictedEndPrice) : '—'}
              </span>
              {priceDelta != null && returnPct != null && (
                <span className={`forecast-figure-delta forecast-figure-delta--${verdict.tone}`}>
                  {priceDelta >= 0 ? '+' : '−'}
                  {formatCurrency(Math.abs(priceDelta)).replace('$', '$')} (
                  {returnPct >= 0 ? '+' : ''}
                  {returnPct.toFixed(2)}%)
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Chart ── */}
      {token && !isLoading && !error && result && chartData.length > 0 && (
        <div className="forecast-chart-card">
          <div className="forecast-chart-header">
            <div>
              <h2 className="forecast-chart-title">Recent price + {horizon}-day outlook</h2>
              <p className="forecast-chart-subtitle">
                Solid teal = confirmed closes. Dotted blue = model projection.
                Shaded band widens over time to reflect growing uncertainty.
              </p>
            </div>
            <div className="forecast-chart-legend">
              <span className="forecast-legend-item">
                <svg aria-hidden fill="none" height="12" viewBox="0 0 28 12" width="28">
                  <line stroke="#0f766e" strokeWidth="2.5" x1="0" x2="28" y1="6" y2="6" />
                </svg>
                Actual
              </span>
              <span className="forecast-legend-item">
                <svg aria-hidden fill="none" height="12" viewBox="0 0 28 12" width="28">
                  <line
                    opacity="0.9"
                    stroke="#2563EB"
                    strokeDasharray="3 4"
                    strokeWidth="1.5"
                    x1="0"
                    x2="28"
                    y1="6"
                    y2="6"
                  />
                </svg>
                Forecast
              </span>
              <span className="forecast-legend-item">
                <svg aria-hidden fill="none" height="12" viewBox="0 0 28 12" width="28">
                  <rect fill="rgba(147,197,253,0.35)" height="8" rx="2" width="28" x="0" y="2" />
                </svg>
                Uncertainty
              </span>
            </div>
          </div>

          <div className="forecast-chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 6, right: 16, bottom: 0, left: 0 }}>
                <defs>
                  {/* Confidence band fill: transparent at Today, pale blue at horizon */}
                  <linearGradient id="fc-band-h" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%"   stopColor="rgb(147,197,253)" stopOpacity={0.00} />
                    <stop offset="30%"  stopColor="rgb(147,197,253)" stopOpacity={0.12} />
                    <stop offset="100%" stopColor="rgb(147,197,253)" stopOpacity={0.25} />
                  </linearGradient>
                  {/* Forecast line stroke: cobalt blue fading as uncertainty grows */}
                  <linearGradient id="fc-forecast-line" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%"   stopColor="#2563EB" stopOpacity={1.00} />
                    <stop offset="100%" stopColor="#2563EB" stopOpacity={0.45} />
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
                  orientation="left"
                  tick={AXIS_TICK}
                  tickFormatter={(v: number) => formatCurrency(v)}
                  tickLine={false}
                  width={80}
                />
                <Tooltip content={tooltipComponent} />

                {/* ── Uncertainty band (render before lines so lines sit on top) ── */}
                {showBand && (
                  <>
                    {/* Upper envelope filled with expanding orange tint */}
                    <Area
                      baseValue="dataMin"
                      connectNulls
                      dataKey="predictedCloseHigh"
                      dot={false}
                      fill="url(#fc-band-h)"
                      fillOpacity={1}
                      isAnimationActive={false}
                      stroke="none"
                      type="monotone"
                    />
                    {/* Lower cutout — fills below lower bound with background to create a band */}
                    <Area
                      baseValue="dataMin"
                      connectNulls
                      dataKey="predictedCloseLow"
                      dot={false}
                      fill="#ffffff"
                      fillOpacity={1}
                      isAnimationActive={false}
                      stroke="none"
                      type="monotone"
                    />
                  </>
                )}

                {/* ── Today boundary ── */}
                {todayDate && (
                  <ReferenceLine
                    stroke="rgba(104,116,135,0.35)"
                    strokeDasharray="2 4"
                    strokeWidth={1}
                    x={todayDate}
                    label={<TodayLabel />}
                  />
                )}

                {/* ── Price lines (render last so they sit above band) ── */}

                {/* 1. Historical close — solid teal, 2.5px */}
                <Line
                  connectNulls
                  dataKey="close"
                  dot={false}
                  isAnimationActive={false}
                  stroke="#0f766e"
                  strokeWidth={2.5}
                  type="monotone"
                />
                {/* 2. Forecast — dotted cobalt, fading with distance.
                    A filled circle is rendered only at todayDate (the anchor point where
                    the teal line ends and the forecast begins). */}
                <Line
                  connectNulls
                  dataKey="predictedClose"
                  isAnimationActive={false}
                  stroke="url(#fc-forecast-line)"
                  strokeDasharray="3 4"
                  strokeWidth={1.5}
                  type="monotone"
                  activeDot={{ r: 4, fill: '#2563EB', stroke: '#ffffff', strokeWidth: 1.5 }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  dot={(dotProps: any) => {
                    if (dotProps.payload?.date !== todayDate) return <g key={dotProps.key} />
                    return (
                      <circle
                        key={dotProps.key}
                        cx={dotProps.cx}
                        cy={dotProps.cy}
                        fill="#2563EB"
                        r={4}
                        stroke="#ffffff"
                        strokeWidth={1.5}
                      />
                    )
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Bottom grid: accuracy + signals ── */}
      {token && !isLoading && !error && result && (
        <div className="forecast-bottom-grid">
          {/* Accuracy */}
          <div className="forecast-accuracy-card">
            <div className="forecast-card-heading">
              <p className="forecast-card-title">How reliable is this model?</p>
              <p className="forecast-card-subtitle">
                Measured on past data the model has never seen during training.
              </p>
            </div>
            <div className="forecast-metrics-grid">
              <div className="forecast-metric-tile" title={METRIC_DESCRIPTIONS.directional}>
                <span className="forecast-metric-label">
                  Right direction
                  <span className="forecast-metric-hint" aria-hidden>ⓘ</span>
                </span>
                <span
                  className={`forecast-metric-value${
                    result.metrics.directionalAccuracy >= 0.55
                      ? ' forecast-metric-value--positive'
                      : ''
                  }`}
                >
                  {(result.metrics.directionalAccuracy * 100).toFixed(1)}%
                </span>
                <span className="forecast-metric-sub">
                  of the time (50% = random)
                </span>
              </div>
              <div className="forecast-metric-tile" title={METRIC_DESCRIPTIONS.maePrice}>
                <span className="forecast-metric-label">
                  Avg price error
                  <span className="forecast-metric-hint" aria-hidden>ⓘ</span>
                </span>
                <span className="forecast-metric-value">
                  ±{formatCurrency(result.metrics.maePrice)}
                </span>
                <span className="forecast-metric-sub">per prediction</span>
              </div>
              <div className="forecast-metric-tile" title={METRIC_DESCRIPTIONS.rmsePrice}>
                <span className="forecast-metric-label">
                  Worst-case error
                  <span className="forecast-metric-hint" aria-hidden>ⓘ</span>
                </span>
                <span className="forecast-metric-value">
                  ±{formatCurrency(result.metrics.rmsePrice)}
                </span>
                <span className="forecast-metric-sub">RMSE</span>
              </div>
              <div className="forecast-metric-tile" title={METRIC_DESCRIPTIONS.maeReturn}>
                <span className="forecast-metric-label">
                  Return error
                  <span className="forecast-metric-hint" aria-hidden>ⓘ</span>
                </span>
                <span className="forecast-metric-value">
                  ±{(result.metrics.maeReturn * 100).toFixed(2)}%
                </span>
                <span className="forecast-metric-sub">avg percent miss</span>
              </div>
            </div>
          </div>

          {/* Feature importances */}
          {topFeatures.length > 0 && (
            <div className="forecast-features-card">
              <div className="forecast-card-heading">
                <p className="forecast-card-title">What the model looks at</p>
                <p className="forecast-card-subtitle">
                  The signals that influenced this forecast the most, in plain English.
                </p>
              </div>
              <div className="forecast-features-list">
                {topFeatures.map((f, i) => (
                  <div className="forecast-feature-row" key={f.feature}>
                    <span className="forecast-feature-rank">{i + 1}</span>
                    <span
                      className="forecast-feature-name"
                      title={f.feature}
                    >
                      {humanizeFeatureName(f.feature)}
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
