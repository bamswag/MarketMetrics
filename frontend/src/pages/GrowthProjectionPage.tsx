import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { MoverLogo } from '../components/MoverLogo'
import {
  ApiError,
  fetchGrowthProjection,
  fetchInstrumentDetail,
  type GrowthProjectionResponse,
  type InstrumentDetailResponse,
} from '../lib/api'
import { formatCurrency } from '../lib/formatters'
import '../styles/pages/GrowthProjectionPage.css'

type GrowthProjectionPageProps = {
  token?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sampleData<T>(arr: T[], maxPoints: number): T[] {
  if (arr.length <= maxPoints) return arr
  const step = (arr.length - 1) / (maxPoints - 1)
  return Array.from({ length: maxPoints }, (_, i) => arr[Math.round(i * step)])
}

function formatYAxisValue(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`
  return `$${Math.round(value)}`
}

function formatXAxisDate(dateStr: string, years: number): string {
  const d = new Date(dateStr)
  if (years <= 5) return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  return String(d.getFullYear())
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ProjectionTooltip(props: any) {
  const { active, payload, label } = props ?? {}
  if (!active || !payload?.length) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const get = (key: string) => payload.find((p: any) => p.dataKey === key)?.value ?? null

  const p50: number | null = get('monteCarloP50')
  const p10: number | null = get('monteCarloP10')
  const p90: number | null = get('monteCarloP90')
  const baseline: number | null = get('baselineValue')
  const invested: number | null = get('investedCapital')

  const year = label ? new Date(label).getFullYear() : ''

  return (
    <div className="instrument-tooltip projection-tooltip">
      <span className="instrument-tooltip-date">{year}</span>
      {p50 != null && (
        <span className="projection-tooltip-row projection-tooltip-row--main">
          Median: {formatCurrency(p50)}
        </span>
      )}
      {p10 != null && p90 != null && (
        <span className="projection-tooltip-row">
          Range: {formatCurrency(p10)} – {formatCurrency(p90)}
        </span>
      )}
      {baseline != null && (
        <span className="projection-tooltip-row">
          Baseline: {formatCurrency(baseline)}
        </span>
      )}
      {invested != null && (
        <span className="projection-tooltip-row projection-tooltip-row--invested">
          Invested: {formatCurrency(invested)}
        </span>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function GrowthProjectionPage({ token }: GrowthProjectionPageProps) {
  const { symbol: rawSymbol } = useParams<{ symbol: string }>()
  const symbol = rawSymbol?.toUpperCase() ?? ''

  // Form state
  const [years, setYears] = useState(10)
  const [initialAmount, setInitialAmount] = useState(1000)
  const [monthlyContribution, setMonthlyContribution] = useState(0)
  const [inflationAdjust, setInflationAdjust] = useState(false)

  // Async state
  const [result, setResult] = useState<GrowthProjectionResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [instrument, setInstrument] = useState<InstrumentDetailResponse | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  // Fetch instrument context (name + logo) once on mount
  useEffect(() => {
    if (!symbol) return
    void fetchInstrumentDetail(token, symbol, '1M').then(setInstrument).catch(() => null)
  }, [symbol, token])

  const runSimulation = useCallback(() => {
    if (!token || !symbol) return

    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    let cancelled = false

    setIsLoading(true)
    setError('')

    fetchGrowthProjection(
      token,
      {
        symbol,
        years,
        initialAmount,
        recurringContribution: monthlyContribution,
        contributionFrequency: 'monthly',
        inflationRate: inflationAdjust ? 0.025 : 0,
        simulationRuns: 1000,
      },
      controller.signal,
    )
      .then((data) => {
        if (!cancelled) setResult(data)
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
                : 'Unable to run simulation right now.'
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
  }, [token, symbol, years, initialAmount, monthlyContribution, inflationAdjust])

  // Auto-run on mount and when symbol/token change
  useEffect(() => {
    const cleanup = runSimulation()
    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, token])

  // Chart data — sampled to max 240 points
  const chartData = useMemo(() => {
    if (!result) return []
    return sampleData(result.monthlyChartData, 240)
  }, [result])

  // Y-axis domain with 8% padding
  const yDomain = useMemo((): [number, number] => {
    if (!chartData.length) return [0, 1]
    const vals: number[] = []
    for (const pt of chartData) {
      if (pt.monteCarloP10 != null) vals.push(pt.monteCarloP10)
      if (pt.monteCarloP90 != null) vals.push(pt.monteCarloP90)
      if (pt.investedCapital != null) vals.push(pt.investedCapital)
    }
    if (!vals.length) return [0, 1]
    const lo = Math.min(...vals)
    const hi = Math.max(...vals)
    const pad = (hi - lo) * 0.08 || hi * 0.08 || 1
    return [Math.max(0, lo - pad), hi + pad]
  }, [chartData])

  const companyName = instrument?.companyName ?? symbol

  const scenarios = result?.deterministicScenarios ?? null
  const assumptions = result?.assumptionsUsed ?? null

  return (
    <section className="projection-page page-section">
      {/* ── Hero ── */}
      <div className="projection-hero">
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
              <span className="forecast-hero-badge">Investment Simulator</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Parameters card ── */}
      <div className="projection-params-card">
        <p className="projection-params-heading">Simulation parameters</p>

        <div className="projection-params-grid">
          {/* Years */}
          <div className="projection-field">
            <label className="projection-field-label">Years</label>
            <div className="projection-years-row">
              <input
                className="projection-slider"
                max={50}
                min={1}
                onChange={(e) => setYears(Number(e.target.value))}
                type="range"
                value={years}
              />
              <span className="projection-years-display">{years} yr{years !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* Initial investment */}
          <div className="projection-field">
            <label className="projection-field-label">Initial investment</label>
            <div className="projection-input-wrapper">
              <span className="projection-input-prefix">$</span>
              <input
                className="projection-input"
                min={1}
                onChange={(e) => setInitialAmount(Number(e.target.value))}
                step={100}
                type="number"
                value={initialAmount}
              />
            </div>
          </div>

          {/* Monthly contribution */}
          <div className="projection-field">
            <label className="projection-field-label">Monthly contribution</label>
            <div className="projection-input-wrapper">
              <span className="projection-input-prefix">$</span>
              <input
                className="projection-input"
                min={0}
                onChange={(e) => setMonthlyContribution(Number(e.target.value))}
                step={50}
                type="number"
                value={monthlyContribution}
              />
            </div>
          </div>

          {/* Inflation adjusted */}
          <div className="projection-field projection-field--toggle">
            <span className="projection-field-label">Inflation adjusted</span>
            <button
              className={inflationAdjust ? 'workspace-toggle is-active' : 'workspace-toggle'}
              onClick={() => setInflationAdjust((v) => !v)}
              type="button"
            >
              {inflationAdjust ? 'On (2.5%)' : 'Off'}
            </button>
          </div>
        </div>

        <button
          className="primary-action projection-run-btn"
          disabled={isLoading || !token}
          onClick={runSimulation}
          type="button"
        >
          {isLoading ? 'Running…' : 'Run Simulation'}
        </button>
      </div>

      {/* ── No auth ── */}
      {!token && (
        <div className="forecast-error-card">
          <span className="forecast-error-icon">🔒</span>
          <h2 className="forecast-error-title">Sign in to run simulations</h2>
          <p className="forecast-error-sub">
            Investment simulations require an account. Sign in or create a free account to continue.
          </p>
          <Link className="primary-action" to="/login">Sign in</Link>
        </div>
      )}

      {/* ── Error ── */}
      {token && !isLoading && error && (
        <div className="forecast-error-card">
          <span className="forecast-error-icon">⚠️</span>
          <h2 className="forecast-error-title">Simulation unavailable</h2>
          <p className="forecast-error-sub">{error}</p>
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {token && isLoading && (
        <div className="projection-loading">
          <div className="forecast-skeleton" style={{ height: 96, borderRadius: 22 }} />
          <div className="forecast-skeleton" style={{ height: 380, borderRadius: 22 }} />
          <div className="forecast-skeleton" style={{ height: 180, borderRadius: 22 }} />
        </div>
      )}

      {/* ── Summary grid ── */}
      {result && !isLoading && !error && (
        <div className="projection-summary-grid">
          <div className="projection-summary-card">
            <span className="projection-summary-label">Median outcome</span>
            <span className="projection-summary-value projection-summary-value--main">
              {formatCurrency(result.monteCarloSummary.p50EndValue)}
            </span>
            <span className="projection-summary-sub">after {years} year{years !== 1 ? 's' : ''} (P50)</span>
          </div>

          <div className="projection-summary-card">
            <span className="projection-summary-label">Total invested</span>
            <span className="projection-summary-value">
              {formatCurrency(result.totalInvested)}
            </span>
            <span className="projection-summary-sub">
              {formatCurrency(initialAmount)} + contributions
            </span>
          </div>

          <div className="projection-summary-card">
            <span className="projection-summary-label">Projected profit</span>
            <span
              className={`projection-summary-value ${
                result.nominalProfitGain.monteCarloP50 >= 0
                  ? 'projection-summary-value--positive'
                  : 'projection-summary-value--negative'
              }`}
            >
              {result.nominalProfitGain.monteCarloP50 >= 0 ? '+' : ''}
              {formatCurrency(result.nominalProfitGain.monteCarloP50)}
            </span>
            <span className="projection-summary-sub">
              ({result.nominalGrowthPct.monteCarloP50 >= 0 ? '+' : ''}
              {result.nominalGrowthPct.monteCarloP50.toFixed(1)}% nominal)
            </span>
          </div>

          <div className="projection-summary-card">
            <span className="projection-summary-label">Probability of profit</span>
            <span
              className={`projection-summary-value ${
                result.monteCarloSummary.probabilityOfProfit >= 0.5
                  ? 'projection-summary-value--positive'
                  : 'projection-summary-value--negative'
              }`}
            >
              {(result.monteCarloSummary.probabilityOfProfit * 100).toFixed(0)}%
            </span>
            <span className="projection-summary-sub">
              across {result.monteCarloSummary.runs.toLocaleString()} simulations
            </span>
          </div>
        </div>
      )}

      {/* ── Fan chart ── */}
      {result && !isLoading && !error && chartData.length > 0 && (
        <div className="projection-chart-card">
          <div className="forecast-chart-header">
            <div>
              <h2 className="forecast-chart-title">
                Portfolio growth — {years}-year projection
              </h2>
              <p className="forecast-chart-subtitle">
                {result.monteCarloSummary.runs.toLocaleString()} Monte Carlo simulations.
                {inflationAdjust ? ' Inflation-adjusted at 2.5% per year.' : ' Nominal values (not inflation-adjusted).'}
              </p>
            </div>
            <div className="forecast-chart-legend">
              <span className="forecast-legend-item">
                <svg aria-hidden fill="none" height="12" viewBox="0 0 28 12" width="28">
                  <line stroke="#2563EB" strokeWidth="2.5" x1="0" x2="28" y1="6" y2="6" />
                </svg>
                Median P50
              </span>
              <span className="forecast-legend-item">
                <svg aria-hidden fill="none" height="12" viewBox="0 0 28 12" width="28">
                  <rect fill="rgba(147,197,253,0.35)" height="8" rx="2" width="28" x="0" y="2" />
                </svg>
                P10–P90 range
              </span>
              <span className="forecast-legend-item">
                <svg aria-hidden fill="none" height="12" viewBox="0 0 28 12" width="28">
                  <line
                    stroke="#0f766e"
                    strokeDasharray="4 3"
                    strokeWidth="1.5"
                    x1="0"
                    x2="28"
                    y1="6"
                    y2="6"
                  />
                </svg>
                Baseline
              </span>
              <span className="forecast-legend-item">
                <svg aria-hidden fill="none" height="12" viewBox="0 0 28 12" width="28">
                  <line
                    stroke="#9ca3af"
                    strokeDasharray="3 3"
                    strokeWidth="1.5"
                    x1="0"
                    x2="28"
                    y1="6"
                    y2="6"
                  />
                </svg>
                Invested
              </span>
            </div>
          </div>

          <div className="projection-chart-wrap">
            <ResponsiveContainer height="100%" width="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="proj-band" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="rgb(147,197,253)" stopOpacity={0.30} />
                    <stop offset="100%" stopColor="rgb(147,197,253)" stopOpacity={0.08} />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  stroke="rgba(25,40,62,0.05)"
                  strokeDasharray="4 4"
                  vertical={false}
                />

                <XAxis
                  axisLine={false}
                  dataKey="date"
                  minTickGap={60}
                  tick={{ fill: '#687487', fontSize: 11 }}
                  tickFormatter={(d: string) => formatXAxisDate(d, years)}
                  tickLine={false}
                />

                <YAxis
                  axisLine={false}
                  domain={yDomain}
                  orientation="left"
                  tick={{ fill: '#687487', fontSize: 11 }}
                  tickFormatter={formatYAxisValue}
                  tickLine={false}
                  width={72}
                />

                <Tooltip content={ProjectionTooltip} />

                {/* Band: upper fill then lower cutout */}
                <Area
                  baseValue="dataMin"
                  connectNulls
                  dataKey="monteCarloP90"
                  dot={false}
                  fill="url(#proj-band)"
                  fillOpacity={1}
                  isAnimationActive={false}
                  stroke="none"
                  type="monotone"
                />
                <Area
                  baseValue="dataMin"
                  connectNulls
                  dataKey="monteCarloP10"
                  dot={false}
                  fill="#ffffff"
                  fillOpacity={1}
                  isAnimationActive={false}
                  stroke="none"
                  type="monotone"
                />

                {/* Invested capital — grey dashed */}
                <Line
                  connectNulls
                  dataKey="investedCapital"
                  dot={false}
                  isAnimationActive={false}
                  stroke="#9ca3af"
                  strokeDasharray="3 3"
                  strokeWidth={1.5}
                  type="monotone"
                />

                {/* Baseline — teal dashed */}
                <Line
                  connectNulls
                  dataKey="baselineValue"
                  dot={false}
                  isAnimationActive={false}
                  stroke="#0f766e"
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                  type="monotone"
                />

                {/* Median P50 — cobalt solid */}
                <Line
                  connectNulls
                  dataKey="monteCarloP50"
                  dot={false}
                  isAnimationActive={false}
                  stroke="#2563EB"
                  strokeWidth={2.2}
                  type="monotone"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Bottom grid ── */}
      {result && !isLoading && !error && scenarios && assumptions && (
        <div className="forecast-bottom-grid">
          {/* Deterministic scenarios */}
          <div className="forecast-accuracy-card">
            <div className="forecast-card-heading">
              <p className="forecast-card-title">Deterministic scenarios</p>
              <p className="forecast-card-subtitle">
                Fixed-rate projections using pessimistic, baseline, and optimistic annual return assumptions.
              </p>
            </div>

            <div className="projection-scenarios-grid">
              <div className="projection-scenario-header">
                <span className="projection-scenario-key"></span>
                <span>Pessimistic</span>
                <span>Baseline</span>
                <span>Optimistic</span>
              </div>

              <div className="projection-scenario-row">
                <span className="projection-scenario-key">Annual return</span>
                <span>{(scenarios.pessimistic.annualReturnUsed * 100).toFixed(1)}%</span>
                <span>{(scenarios.baseline.annualReturnUsed * 100).toFixed(1)}%</span>
                <span>{(scenarios.optimistic.annualReturnUsed * 100).toFixed(1)}%</span>
              </div>

              <div className="projection-scenario-row">
                <span className="projection-scenario-key">End value</span>
                <span>{formatCurrency(scenarios.pessimistic.projectedEndValue)}</span>
                <span>{formatCurrency(scenarios.baseline.projectedEndValue)}</span>
                <span>{formatCurrency(scenarios.optimistic.projectedEndValue)}</span>
              </div>

              <div className="projection-scenario-row">
                <span className="projection-scenario-key">Growth</span>
                <span
                  className={
                    scenarios.pessimistic.projectedGrowthPct >= 0 ? 'positive-text' : 'negative-text'
                  }
                >
                  {scenarios.pessimistic.projectedGrowthPct >= 0 ? '+' : ''}
                  {scenarios.pessimistic.projectedGrowthPct.toFixed(1)}%
                </span>
                <span
                  className={
                    scenarios.baseline.projectedGrowthPct >= 0 ? 'positive-text' : 'negative-text'
                  }
                >
                  {scenarios.baseline.projectedGrowthPct >= 0 ? '+' : ''}
                  {scenarios.baseline.projectedGrowthPct.toFixed(1)}%
                </span>
                <span
                  className={
                    scenarios.optimistic.projectedGrowthPct >= 0 ? 'positive-text' : 'negative-text'
                  }
                >
                  {scenarios.optimistic.projectedGrowthPct >= 0 ? '+' : ''}
                  {scenarios.optimistic.projectedGrowthPct.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Model assumptions */}
          <div className="forecast-features-card">
            <div className="forecast-card-heading">
              <p className="forecast-card-title">Model assumptions</p>
              <p className="forecast-card-subtitle">
                Derived from {assumptions.historyWindowYearsUsed.toFixed(1)} years of historical data.
              </p>
            </div>

            <div className="projection-assumptions-list">
              <div className="projection-assumption-row">
                <span className="projection-assumption-key">Expected annual return</span>
                <span className="projection-assumption-val">
                  {(assumptions.expectedAnnualReturn * 100).toFixed(2)}%
                </span>
              </div>
              <div className="projection-assumption-row">
                <span className="projection-assumption-key">Annual volatility</span>
                <span className="projection-assumption-val">
                  {(assumptions.annualVolatility * 100).toFixed(2)}%
                </span>
              </div>
              <div className="projection-assumption-row">
                <span className="projection-assumption-key">Data source</span>
                <span className="projection-assumption-val">{assumptions.source}</span>
              </div>
              {inflationAdjust && (
                <div className="projection-assumption-row">
                  <span className="projection-assumption-key">Inflation rate</span>
                  <span className="projection-assumption-val">
                    {(assumptions.inflationRate * 100).toFixed(1)}%
                  </span>
                </div>
              )}
              <div className="projection-assumption-row">
                <span className="projection-assumption-key">Simulation runs</span>
                <span className="projection-assumption-val">
                  {result.monteCarloSummary.runs.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Disclaimer ── */}
      {result && !isLoading && !error && (
        <p className="forecast-disclaimer">
          ⚠️ Investment simulations are hypothetical and based on historical price data. Past performance does not guarantee future results. These projections are for educational purposes only and do not constitute financial advice.
        </p>
      )}
    </section>
  )
}
