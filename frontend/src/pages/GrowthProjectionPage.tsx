import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
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
import { SimilarInstrumentsSection } from '../components/SimilarInstrumentsSection'
import {
  ApiError,
  fetchGrowthProjection,
  fetchInstrumentDetail,
  type GrowthProjectionResponse,
  type InstrumentDetailResponse,
} from '../lib/api'
import { readStoredMarketPreferences } from '../lib/marketPreferences'
import '../styles/components/ChartTooltip.css'
import '../styles/pages/ForecastPage.css'
import '../styles/pages/GrowthProjectionPage.css'

type GrowthProjectionPageProps = {
  token?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sampleData<T>(arr: T[], maxPoints: number): T[] {
  if (arr.length <= maxPoints) return arr
  const step = (arr.length - 1) / (maxPoints - 1)
  return Array.from({ length: maxPoints }, (_, i) => arr[Math.round(i * step)])
}

function formatYAxisValue(value: number): string {
  const sym = getCurrencySymbol()
  if (value >= 1_000_000_000_000) return `${sym}${(value / 1_000_000_000_000).toFixed(1)}T`
  if (value >= 1_000_000_000) return `${sym}${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `${sym}${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${sym}${Math.round(value / 1_000)}K`
  return `${sym}${Math.round(value)}`
}

function resolveLocale() {
  return typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US'
}

function getProjPreferences() {
  return readStoredMarketPreferences()
}

function isCompactMode(): boolean {
  return getProjPreferences().numberFormat === 'compact'
}

function getCurrencyCode(): string {
  return getProjPreferences().currency
}

function getCurrencySymbol(): string {
  return getCurrencyCode() === 'GBP' ? '£' : '$'
}

/**
 * Format a currency value — compact (K/M/B/T) or standard based on user preference.
 * Standard mode uses Intl.NumberFormat with no decimals for whole values.
 */
function formatCompact(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  const sym = getCurrencySymbol()
  if (isCompactMode()) {
    if (abs >= 1_000_000_000_000) return `${sign}${sym}${(abs / 1_000_000_000_000).toFixed(1)}T`
    if (abs >= 1_000_000_000) return `${sign}${sym}${(abs / 1_000_000_000).toFixed(1)}B`
    if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000) return `${sign}${sym}${Math.round(abs / 1_000)}K`
    return `${sign}${sym}${Math.round(abs)}`
  }
  // Standard: full number with comma separators, no decimals for clean display
  return new Intl.NumberFormat(resolveLocale(), {
    style: 'currency',
    currency: getCurrencyCode(),
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(value)
}

/**
 * Format a pair of values using the same unit (determined by the larger of the two)
 * so tooltip ranges like "£167 – £1K" never mix raw and K formats.
 */
function formatTooltipPair(a: number, b: number): string {
  const max = Math.max(Math.abs(a), Math.abs(b))
  const sym = getCurrencySymbol()
  if (isCompactMode()) {
    const fmt = (v: number): string => {
      const sign = v < 0 ? '-' : ''
      const abs = Math.abs(v)
      if (max >= 1_000_000_000_000) return `${sign}${sym}${(abs / 1_000_000_000_000).toFixed(1)}T`
      if (max >= 1_000_000_000) return `${sign}${sym}${(abs / 1_000_000_000).toFixed(1)}B`
      if (max >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(1)}M`
      if (max >= 1_000) return `${sign}${sym}${Math.round(abs / 1_000)}K`
      return `${sign}${sym}${Math.round(abs)}`
    }
    return `${fmt(a)} – ${fmt(b)}`
  }
  // Standard: both values formatted with commas, no decimals
  const stdFmt = new Intl.NumberFormat(resolveLocale(), {
    style: 'currency',
    currency: getCurrencyCode(),
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })
  return `${stdFmt.format(a)} – ${stdFmt.format(b)}`
}

/**
 * Format a set of values using a consistent unit (largest drives the choice)
 * so scenario rows never show "£153" and "£3K" side by side.
 */
function formatRowValues(values: number[]): string[] {
  const max = Math.max(...values.map(Math.abs))
  const sym = getCurrencySymbol()
  if (isCompactMode()) {
    return values.map((v) => {
      const sign = v < 0 ? '-' : ''
      const abs = Math.abs(v)
      if (max >= 1_000_000_000_000) return `${sign}${sym}${(abs / 1_000_000_000_000).toFixed(1)}T`
      if (max >= 1_000_000_000) return `${sign}${sym}${(abs / 1_000_000_000).toFixed(1)}B`
      if (max >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(1)}M`
      if (max >= 1_000) return `${sign}${sym}${Math.round(abs / 1_000)}K`
      return `${sign}${sym}${Math.round(abs)}`
    })
  }
  // Standard: format all values with commas, no decimals
  const stdFmt = new Intl.NumberFormat(resolveLocale(), {
    style: 'currency',
    currency: getCurrencyCode(),
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })
  return values.map((v) => stdFmt.format(v))
}

function formatHistoryDateRange(yearsUsed: number): string {
  const end = new Date()
  const start = new Date()
  start.setMonth(end.getMonth() - Math.round(yearsUsed * 12))
  const opts: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric' }
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`
}

function resolveSourceLabel(source: string): string {
  if (source === 'historical_defaults' || source === 'historical') return 'Historical price data'
  return source
}

/** Sanitise a text input to digits only, stripping leading zeros */
function sanitiseAmount(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.replace(/^0+(?=\d)/, '')
}

// ── Volatility badge ──────────────────────────────────────────────────────────

function VolatilityBadge({ value }: { value: number }) {
  const pct = value * 100
  if (pct > 40)
    return <span className="proj-vol-badge proj-vol-badge--high">High — this asset swings a lot</span>
  if (pct >= 20)
    return <span className="proj-vol-badge proj-vol-badge--moderate">Moderate</span>
  return <span className="proj-vol-badge proj-vol-badge--low">Low — relatively stable</span>
}

/** Return a CSS class for a numeric value: green positive, red negative, plain zero */
function signClass(value: number): string {
  if (value > 0) return 'positive-text'
  if (value < 0) return 'negative-text'
  return 'neutral-text'
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

  // P&L relative to invested capital at this point in time
  const pnl = p50 != null && invested != null ? p50 - invested : null
  const pnlPct = pnl != null && invested != null && invested > 0
    ? (pnl / invested) * 100
    : null
  const isGain = pnl != null ? pnl >= 0 : true

  return (
    <div className="instrument-tooltip projection-tooltip">
      <span className="instrument-tooltip-date">{year}</span>
      {p50 != null && (
        <span className={`projection-tooltip-row ${isGain ? 'projection-tooltip-row--main' : 'projection-tooltip-row--main-loss'}`}>
          Most likely: {formatCompact(p50)}
        </span>
      )}
      {pnl != null && (
        <span className={`projection-tooltip-row ${isGain ? 'projection-tooltip-row--gain' : 'projection-tooltip-row--loss'}`}>
          P&amp;L: {pnl >= 0 ? '+' : ''}{formatCompact(pnl)}
          {pnlPct != null ? ` (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)` : ''}
        </span>
      )}
      {p10 != null && p90 != null && (
        <span className="projection-tooltip-row">
          Range: {formatTooltipPair(p10, p90)}
        </span>
      )}
      {baseline != null && (
        <span className="projection-tooltip-row">
          Average growth: {formatCompact(baseline)}
        </span>
      )}
      {invested != null && (
        <span className="projection-tooltip-row projection-tooltip-row--invested">
          Invested: {formatCompact(invested)}
        </span>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type HistoryPrefill = {
  years?: number
  initialAmount?: number
  monthlyContribution?: number
  inflationRate?: number
}

export function GrowthProjectionPage({ token }: GrowthProjectionPageProps) {
  const { symbol: rawSymbol } = useParams<{ symbol: string }>()
  const symbol = rawSymbol?.toUpperCase() ?? ''
  const location = useLocation()
  const prefill = (location.state as { prefill?: HistoryPrefill } | null)?.prefill ?? null

  // Form state — string values for display, derived numbers for calculations
  const [years, setYears] = useState(prefill?.years ?? 10)
  const [initialAmountStr, setInitialAmountStr] = useState(String(prefill?.initialAmount ?? 1000))
  const [monthlyContributionStr, setMonthlyContributionStr] = useState(String(prefill?.monthlyContribution ?? 0))
  const [inflationAdjust, setInflationAdjust] = useState(prefill ? (prefill.inflationRate ?? 0) > 0 : false)

  // Committed numeric values — only updated 600 ms after the user stops typing
  // (string state above controls the visible input; these drive the simulation)
  const [initialAmount, setInitialAmount] = useState(prefill?.initialAmount ?? 1000)
  const [monthlyContribution, setMonthlyContribution] = useState(prefill?.monthlyContribution ?? 0)
  const inputCommitDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Async state
  const [result, setResult] = useState<GrowthProjectionResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [instrument, setInstrument] = useState<InstrumentDetailResponse | null>(null)
  const [simulationVersion, setSimulationVersion] = useState(0)

  const abortRef = useRef<AbortController | null>(null)
  // Gate: auto-run only fires after the first simulation has returned results
  const initialRunDoneRef = useRef(false)
  // Debounce timer for param-change auto-run
  const paramDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!symbol) return
    void fetchInstrumentDetail(token, symbol, '1M').then(setInstrument).catch(() => null)
  }, [symbol, token])

  function handleInitialAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const clean = sanitiseAmount(e.target.value)
    setInitialAmountStr(clean)
    // Debounce numeric commit so the simulation doesn't fire on every keystroke
    if (inputCommitDebounceRef.current) clearTimeout(inputCommitDebounceRef.current)
    inputCommitDebounceRef.current = setTimeout(() => {
      setInitialAmount(clean === '' ? 0 : Math.max(0, parseInt(clean, 10) || 0))
    }, 600)
  }

  function handleMonthlyContributionChange(e: React.ChangeEvent<HTMLInputElement>) {
    const clean = sanitiseAmount(e.target.value)
    setMonthlyContributionStr(clean)
    if (inputCommitDebounceRef.current) clearTimeout(inputCommitDebounceRef.current)
    inputCommitDebounceRef.current = setTimeout(() => {
      setMonthlyContribution(clean === '' ? 0 : Math.max(0, parseInt(clean, 10) || 0))
    }, 600)
  }

  const runSimulation = useCallback(() => {
    if (!symbol) return

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
        if (!cancelled) {
          setResult(data)
          setSimulationVersion((v) => v + 1)
          initialRunDoneRef.current = true
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

  // Keep a stable ref so the debounced callback always calls the latest closure
  const runSimulationRef = useRef(runSimulation)
  runSimulationRef.current = runSimulation

  // Initial run whenever symbol or token changes — clears stale data
  useEffect(() => {
    initialRunDoneRef.current = false
    setResult(null)
    setError('')
    const cleanup = runSimulation()
    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, token])

  // Auto-run on param changes (debounced 300ms), gated until first result is ready
  useEffect(() => {
    if (!initialRunDoneRef.current) return
    if (paramDebounceRef.current) clearTimeout(paramDebounceRef.current)
    paramDebounceRef.current = setTimeout(() => {
      runSimulationRef.current()
    }, 300)
    return () => {
      if (paramDebounceRef.current) clearTimeout(paramDebounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years, initialAmount, monthlyContribution, inflationAdjust])

  const chartData = useMemo(() => {
    if (!result) return []
    return sampleData(result.monthlyChartData, 240)
  }, [result])

  const yDomain = useMemo((): [number, number] => {
    if (!chartData.length) return [0, 1]
    let hi = 0
    for (const pt of chartData) {
      if (pt.monteCarloP90 != null && pt.monteCarloP90 > hi) hi = pt.monteCarloP90
    }
    return [0, hi * 1.08 || 1]
  }, [chartData])

  const xTicks = useMemo(() => {
    if (!chartData.length) return undefined
    const seen = new Set<number>()
    const ticks: string[] = []
    for (const pt of chartData) {
      const yr = new Date(pt.date).getFullYear()
      if (!seen.has(yr)) {
        seen.add(yr)
        ticks.push(pt.date)
      }
    }
    if (ticks.length > 12) {
      const step = Math.ceil(ticks.length / 10)
      return ticks.filter((_, i) => i % step === 0 || i === ticks.length - 1)
    }
    return ticks
  }, [chartData])

  const companyName = instrument?.companyName ?? symbol
  const scenarios = result?.deterministicScenarios ?? null
  const assumptions = result?.assumptionsUsed ?? null

  // Outcome direction — used to colour cards and rewrite copy consistently
  const isGain = result ? result.monteCarloSummary.p50EndValue >= result.totalInvested : true
  const pctChange = result && result.totalInvested > 0
    ? ((result.monteCarloSummary.p50EndValue - result.totalInvested) / result.totalInvested) * 100
    : 0
  const isDeclineTrend = assumptions ? assumptions.expectedAnnualReturn < 0 : false

  // Show results as long as we have data — even while a re-run is in progress
  const hasResults = Boolean(result && !error)
  // Distinguish between a fresh first load (no data yet) and a background update
  const isFirstLoad = isLoading && !result
  const isUpdating = isLoading && Boolean(result)

  // Auto-generated plain-English summary sentence
  const summaryLine = useMemo(() => {
    if (!result) return null
    const probPct = Math.round(result.monteCarloSummary.probabilityOfProfit * 100)
    const p50 = formatCompact(result.monteCarloSummary.p50EndValue)
    const invested = formatCompact(result.totalInvested)
    const yrs = `${years} year${years !== 1 ? 's' : ''}`
    const gaining = result.monteCarloSummary.p50EndValue >= result.totalInvested
    if (gaining) {
      return `Based on your inputs, there's a ${probPct}% chance your ${invested} investment grows to at least ${p50} over ${yrs}.`
    }
    return `Based on your inputs, your ${invested} investment is most likely to decline to ${p50} over ${yrs}. There's only a ${probPct}% chance of ending with a profit.`
  }, [result, years])

  // CSS custom property for slider track fill
  const sliderFill = `${((years - 1) / 49) * 100}%`

  return (
    <section className="projection-page page-section">

      {/* ── Hero ── */}
      <div className="projection-hero">
        <div className="projection-hero-nav">
          <Link className="forecast-back-link" to={`/instrument/${encodeURIComponent(symbol)}`}>
            ← Back to {symbol}
          </Link>
          {token ? (
            <Link className="forecast-back-link" to="/simulation-history">
              View history
            </Link>
          ) : null}
        </div>
        <div className="forecast-hero-row">
          <div className="forecast-hero-identity">
            <MoverLogo name={companyName} symbol={symbol} />
            <div className="forecast-hero-text">
              <h1 className="forecast-hero-symbol">{symbol}</h1>
              <span className="forecast-hero-name">
                {companyName !== symbol ? `${companyName} · ` : ''}Investment Simulator
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Declining-trend warning ── */}
      {hasResults && isDeclineTrend && (
        <div className="proj-decline-warning">
          <span className="proj-decline-warning-icon" aria-hidden>⚠</span>
          <p>
            This asset has historically declined in value. Simulations based on past performance will project losses.
          </p>
        </div>
      )}

      {/* ── Summary cards (above the fold once results arrive) ── */}
      {hasResults && result && (
        <>
          <div className={`projection-summary-grid${isUpdating ? ' projection-summary-grid--updating' : ''}`}>

            {/* Card 1: Most likely outcome — colour reflects gain vs loss */}
            <div className={`projection-summary-card ${isGain ? 'projection-summary-card--main' : 'projection-summary-card--main-loss'}`}>
              <span className="projection-summary-label">Most likely outcome</span>
              <span className={`projection-summary-value ${isGain ? 'projection-summary-value--positive' : 'projection-summary-value--negative'}`}>
                {formatCompact(result.monteCarloSummary.p50EndValue)}
              </span>
              <span className={`projection-summary-delta ${isGain ? 'projection-summary-delta--positive' : 'projection-summary-delta--negative'}`}>
                {pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}% from invested
              </span>
              <span className="projection-summary-sub">
                your most likely portfolio value after {years} year{years !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Card 2: Chance of profit */}
            <div className="projection-summary-card">
              <span className="projection-summary-label">
                Chance of profit
                <span
                  className="proj-info-icon"
                  title="Out of 1,000 simulated futures, this many ended with more money than you put in"
                >
                  {' '}ⓘ
                </span>
              </span>
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
                across {result.monteCarloSummary.runs.toLocaleString()} simulated futures
              </span>
            </div>

            {/* Card 3: Estimated profit */}
            <div className="projection-summary-card">
              <span className="projection-summary-label">Estimated profit</span>
              <span
                className={`projection-summary-value ${
                  result.nominalProfitGain.monteCarloP50 >= 0
                    ? 'projection-summary-value--positive'
                    : 'projection-summary-value--negative'
                }`}
              >
                {result.nominalProfitGain.monteCarloP50 >= 0 ? '+' : ''}
                {formatCompact(result.nominalProfitGain.monteCarloP50)}
              </span>
              <span className="projection-summary-sub">
                {result.nominalGrowthPct.monteCarloP50 >= 0 ? '+' : ''}
                {result.nominalGrowthPct.monteCarloP50.toFixed(1)}% total growth
              </span>
            </div>

            {/* Card 4: Total you'll invest */}
            <div className="projection-summary-card">
              <span className="projection-summary-label">Total you'll invest</span>
              <span className="projection-summary-value">
                {formatCompact(result.totalInvested)}
              </span>
              <span className="projection-summary-sub">
                your total money put in over {years} year{years !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Auto-generated summary sentence */}
          {summaryLine && (
            <p className={`projection-summary-sentence${!isGain ? ' projection-summary-sentence--decline' : ''}${isUpdating ? ' projection-summary-sentence--updating' : ''}`}>
              {summaryLine}
            </p>
          )}
        </>
      )}

      {/* ── Parameters card ── */}
      <div className={`projection-params-card${hasResults ? ' projection-params-card--secondary' : ''}`}>
        <p className="projection-params-heading">
          {hasResults ? 'Adjust parameters' : 'Simulation parameters'}
        </p>
        <p className="projection-params-explainer">
          Adjust the sliders and fields below — your results update instantly.
        </p>

        <div className="projection-params-grid">

          {/* Investment period slider */}
          <div className="projection-field">
            <label className="projection-field-label">Investment period</label>
            <div className="projection-years-row">
              <input
                className="projection-slider"
                max={50}
                min={1}
                onChange={(e) => setYears(Number(e.target.value))}
                style={{ '--slider-fill': sliderFill } as React.CSSProperties}
                type="range"
                value={years}
              />
              <span className="projection-years-display">{years} yr{years !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* Starting amount */}
          <div className="projection-field">
            <label className="projection-field-label">Starting amount</label>
            <div className="projection-input-wrapper">
              <span className="projection-input-prefix">$</span>
              <input
                className="projection-input"
                inputMode="numeric"
                onChange={handleInitialAmountChange}
                placeholder="1000"
                type="text"
                value={initialAmountStr}
              />
            </div>
          </div>

          {/* Monthly top-up */}
          <div className="projection-field">
            <label className="projection-field-label">Monthly top-up</label>
            <div className="projection-input-wrapper">
              <span className="projection-input-prefix">$</span>
              <input
                className="projection-input"
                inputMode="numeric"
                onChange={handleMonthlyContributionChange}
                placeholder="0"
                type="text"
                value={monthlyContributionStr}
              />
            </div>
          </div>

          {/* Inflation toggle */}
          <div className="projection-field projection-field--toggle">
            <span className="projection-field-label">Adjust for inflation</span>
            <div className="projection-toggle-group">
              <button
                aria-checked={inflationAdjust}
                className={`projection-toggle${inflationAdjust ? ' projection-toggle--on' : ''}`}
                onClick={() => setInflationAdjust((v) => !v)}
                role="switch"
                type="button"
              >
                <span className="projection-toggle-thumb" />
              </button>
              <span className="projection-toggle-label">
                {inflationAdjust ? 'On · 2.5% / yr' : 'Off'}
              </span>
            </div>
          </div>
        </div>
      </div>


      {/* ── Error ── */}
      {token && !isLoading && error && (
        <div className="forecast-error-card">
          <span className="forecast-error-icon">⚠️</span>
          <h2 className="forecast-error-title">Simulation unavailable</h2>
          <p className="forecast-error-sub">{error}</p>
        </div>
      )}

      {/* ── Loading skeleton (first load only — param updates keep showing the chart) ── */}
      {token && isFirstLoad && (
        <div className="projection-loading">
          <div className="forecast-skeleton" style={{ height: 96, borderRadius: 22 }} />
          <div className="forecast-skeleton" style={{ height: 380, borderRadius: 22 }} />
          <div className="forecast-skeleton" style={{ height: 180, borderRadius: 22 }} />
        </div>
      )}

      {/* ── Fan chart ── */}
      {hasResults && chartData.length > 0 && (
        <div className={`projection-chart-card${isUpdating ? ' projection-chart-card--updating' : ''}`}>
          <div className="projection-chart-header">
            <div className="projection-chart-header-top">
              <h2 className="projection-chart-title">
                Portfolio growth — {years}-year projection
              </h2>
              <div className="projection-legend">
                <span className="projection-legend-item">
                  <span
                    className="projection-legend-swatch projection-legend-swatch--solid"
                    style={{ background: '#1D9E75' }}
                  />
                  Most likely outcome
                </span>
                <span className="projection-legend-item">
                  <span className="projection-legend-swatch projection-legend-swatch--band" />
                  Likely range (80% of scenarios)
                </span>
                <span className="projection-legend-item">
                  <span
                    className="projection-legend-swatch projection-legend-swatch--dashed"
                    style={{ borderTopColor: '#1e293b' }}
                  />
                  Average growth
                </span>
                <span className="projection-legend-item">
                  <span
                    className="projection-legend-swatch projection-legend-swatch--solid"
                    style={{ background: '#9ca3af' }}
                  />
                  Invested
                </span>
              </div>
            </div>
            <p className="projection-chart-subtitle">
              {result!.monteCarloSummary.runs.toLocaleString()} computer-run scenarios
              {inflationAdjust
                ? ' · Adjusted for 2.5% inflation per year'
                : " · Today's dollars, not adjusted for inflation"}
            </p>
          </div>

          <div className="projection-chart-wrap">
            <ResponsiveContainer height="100%" width="100%">
              <ComposedChart
                key={simulationVersion}
                data={chartData}
                margin={{ top: 8, right: 24, bottom: 0, left: 0 }}
              >
                <defs>
                  {/* Nearly transparent at left → more opaque at right (growing uncertainty) */}
                  <linearGradient id="proj-band" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%"   stopColor="rgb(29,158,117)" stopOpacity={0.06} />
                    <stop offset="35%"  stopColor="rgb(29,158,117)" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="rgb(29,158,117)" stopOpacity={0.42} />
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
                  tick={{ fill: '#687487', fontSize: 11 }}
                  tickFormatter={(d: string) => String(new Date(d).getFullYear())}
                  tickLine={false}
                  ticks={xTicks}
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

                <Tooltip
                  animationDuration={150}
                  animationEasing="ease-out"
                  content={ProjectionTooltip}
                />

                {/* P90 upper band fill */}
                <Area
                  animationDuration={800}
                  animationEasing="ease-out"
                  baseValue={0}
                  connectNulls
                  dataKey="monteCarloP90"
                  dot={false}
                  fill="url(#proj-band)"
                  fillOpacity={1}
                  isAnimationActive
                  stroke="none"
                  type="monotone"
                />
                {/* P10 cutout — paints out the area below the lower bound */}
                <Area
                  animationDuration={800}
                  animationEasing="ease-out"
                  baseValue={0}
                  connectNulls
                  dataKey="monteCarloP10"
                  dot={false}
                  fill="#ffffff"
                  fillOpacity={1}
                  isAnimationActive
                  stroke="none"
                  type="monotone"
                />

                {/* Invested capital — medium gray, slightly heavier so it reads at a glance */}
                <Line
                  animationDuration={1000}
                  animationEasing="ease-out"
                  connectNulls
                  dataKey="investedCapital"
                  dot={false}
                  isAnimationActive
                  stroke="#9ca3af"
                  strokeWidth={1.5}
                  type="monotone"
                />

                {/* Average growth (baseline fixed rate) — dark navy dashed, clearly distinct from teal band */}
                <Line
                  animationDuration={1000}
                  animationEasing="ease-out"
                  connectNulls
                  dataKey="baselineValue"
                  dot={false}
                  isAnimationActive
                  stroke="#1e293b"
                  strokeDasharray="6 4"
                  strokeWidth={2.5}
                  type="monotone"
                />

                {/* Most likely outcome (median) — thick teal, dominant line on the chart */}
                <Line
                  animationDuration={1000}
                  animationEasing="ease-out"
                  connectNulls
                  dataKey="monteCarloP50"
                  dot={false}
                  isAnimationActive
                  stroke="#1D9E75"
                  strokeWidth={3.5}
                  type="monotone"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Bottom grid ── */}
      {hasResults && scenarios && assumptions && (
        <div className={`forecast-bottom-grid${isUpdating ? ' forecast-bottom-grid--updating' : ''}`}>

          {/* Fixed-rate estimates */}
          <div className="forecast-accuracy-card">
            <div className="forecast-card-heading">
              <p className="forecast-card-title">Fixed-rate estimates</p>
              <p className="forecast-card-subtitle">
                {isDeclineTrend
                  ? 'Fixed-rate scenarios based on this asset\'s historical trend.'
                  : "What you'd end up with if this stock grew at a slow, average, or strong fixed rate every year."}
              </p>
            </div>

            {(() => {
              const endVals = formatRowValues([
                scenarios.pessimistic.projectedEndValue,
                scenarios.baseline.projectedEndValue,
                scenarios.optimistic.projectedEndValue,
              ])
              return (
                <div className="projection-scenarios-grid">
                  <div className="projection-scenario-header">
                    <span />
                    <span>{isDeclineTrend ? 'Worse than average' : 'If growth is slow'}</span>
                    <span>
                      {isDeclineTrend ? 'Average outcome' : 'If growth is average'}
                    </span>
                    <span>{isDeclineTrend ? 'Better than average' : 'If growth is strong'}</span>
                  </div>

                  <div className="projection-scenario-row">
                    <span className="projection-scenario-key">Yearly return</span>
                    <span className={signClass(scenarios.pessimistic.annualReturnUsed)}>
                      {(scenarios.pessimistic.annualReturnUsed * 100).toFixed(1)}%
                    </span>
                    <span className={`projection-scenario-col--baseline ${signClass(scenarios.baseline.annualReturnUsed)}`}>
                      {(scenarios.baseline.annualReturnUsed * 100).toFixed(1)}%
                    </span>
                    <span className={signClass(scenarios.optimistic.annualReturnUsed)}>
                      {(scenarios.optimistic.annualReturnUsed * 100).toFixed(1)}%
                    </span>
                  </div>

                  <div className="projection-scenario-row">
                    <span className="projection-scenario-key">End value</span>
                    <span className={signClass(scenarios.pessimistic.projectedGrowthPct)}>{endVals[0]}</span>
                    <span className={`projection-scenario-col--baseline ${signClass(scenarios.baseline.projectedGrowthPct)}`}>{endVals[1]}</span>
                    <span className={signClass(scenarios.optimistic.projectedGrowthPct)}>{endVals[2]}</span>
                  </div>

                  <div className="projection-scenario-row">
                    <span className="projection-scenario-key">Total growth</span>
                    <span className={signClass(scenarios.pessimistic.projectedGrowthPct)}>
                      {scenarios.pessimistic.projectedGrowthPct > 0 ? '+' : ''}
                      {scenarios.pessimistic.projectedGrowthPct.toFixed(1)}%
                    </span>
                    <span className={`projection-scenario-col--baseline ${signClass(scenarios.baseline.projectedGrowthPct)}`}>
                      {scenarios.baseline.projectedGrowthPct > 0 ? '+' : ''}
                      {scenarios.baseline.projectedGrowthPct.toFixed(1)}%
                    </span>
                    <span className={signClass(scenarios.optimistic.projectedGrowthPct)}>
                      {scenarios.optimistic.projectedGrowthPct > 0 ? '+' : ''}
                      {scenarios.optimistic.projectedGrowthPct.toFixed(1)}%
                    </span>
                  </div>
                </div>
              )
            })()}

            {/* Only shown when volatility is high enough to warrant a warning */}
            {(assumptions.annualVolatility * 100) > 40 && (
              <p className="projection-vol-note">
                This stock's price swings a lot historically, so the range of outcomes is wider than average.
              </p>
            )}
          </div>

          {/* Model assumptions */}
          <div className="forecast-features-card">
            <div className="forecast-card-heading">
              <p className="forecast-card-title">Model assumptions</p>
              <p className="forecast-card-subtitle">
                Based on price data from {formatHistoryDateRange(assumptions.historyWindowYearsUsed)}
              </p>
            </div>

            <div className="projection-assumptions-list">
              <div className="projection-assumption-row">
                <span className="projection-assumption-key">Average yearly return (historical)</span>
                <span className="projection-assumption-val">
                  {(assumptions.expectedAnnualReturn * 100).toFixed(2)}%
                </span>
              </div>
              <div className="projection-assumption-row">
                <span className="projection-assumption-key">Annual volatility</span>
                <div className="proj-assumption-val-group">
                  <span className="projection-assumption-val">
                    {(assumptions.annualVolatility * 100).toFixed(2)}%
                  </span>
                  <VolatilityBadge value={assumptions.annualVolatility} />
                </div>
              </div>
              <div className="projection-assumption-row">
                <span className="projection-assumption-key">Data source</span>
                <span className="projection-assumption-val">
                  {resolveSourceLabel(assumptions.source)}
                </span>
              </div>
              {inflationAdjust && (
                <div className="projection-assumption-row">
                  <span className="projection-assumption-key">Inflation rate applied</span>
                  <span className="projection-assumption-val">
                    {(assumptions.inflationRate * 100).toFixed(1)}%
                  </span>
                </div>
              )}
              <div className="projection-assumption-row">
                <span className="projection-assumption-key">Scenarios simulated</span>
                <span className="projection-assumption-val">
                  {result!.monteCarloSummary.runs.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {hasResults && (
        <SimilarInstrumentsSection
          assetCategory={instrument?.assetCategory}
          instrumentName={instrument?.companyName ?? companyName}
          symbol={instrument?.symbol ?? symbol}
        />
      )}

      {/* ── Related tools ── */}
      {hasResults && (
        <div className="forecast-page-cta-group">
          <div className="forecast-page-cta-card forecast-page-cta-card--chart">
            <div className="forecast-page-cta-info">
              <h3 className="forecast-page-cta-heading">AI Price Forecast</h3>
              <p className="forecast-page-cta-sub">
                See where {companyName !== symbol ? companyName : symbol} could be heading — powered by a trained ML model.
              </p>
            </div>
            <Link
              className="primary-action primary-action--teal"
              to={`/forecast/${encodeURIComponent(symbol)}`}
            >
              Run forecast
            </Link>
          </div>
          <div className="forecast-page-cta-card">
            <div className="forecast-page-cta-info">
              <h3 className="forecast-page-cta-heading">Price chart</h3>
              <p className="forecast-page-cta-sub">
                See {symbol}'s recent price history, indicators, and market data.
              </p>
            </div>
            <Link
              className="primary-action primary-action--teal"
              to={`/instrument/${encodeURIComponent(symbol)}`}
            >
              View chart
            </Link>
          </div>
        </div>
      )}

      {/* ── Disclaimer ── */}
      {hasResults && (
        <div className="projection-disclaimer">
          <svg
            aria-hidden
            className="projection-disclaimer-icon"
            fill="none"
            height="16"
            viewBox="0 0 20 20"
            width="16"
          >
            <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
            <line stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" x1="10" x2="10" y1="6" y2="11" />
            <circle cx="10" cy="14" fill="currentColor" r="1" />
          </svg>
          <p>
            Investment simulations are hypothetical and based on historical price data. Past performance
            does not guarantee future results. These projections are for educational purposes only and
            do not constitute financial advice.
          </p>
        </div>
      )}
    </section>
  )
}
