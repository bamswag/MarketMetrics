import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { DailyMoversSection } from '../components/DailyMoversSection'
import type { MoversResponse } from '../lib/api'
import { formatCurrency } from '../lib/formatters'

const PREVIEW_SERIES = {
  '1W': [
    { date: 'Mon', close: 182.4 },
    { date: 'Tue', close: 184.2 },
    { date: 'Wed', close: 183.8 },
    { date: 'Thu', close: 186.5 },
    { date: 'Fri', close: 188.3 },
  ],
  '1M': [
    { date: 'W1', close: 176.8 },
    { date: 'W2', close: 178.1 },
    { date: 'W3', close: 180.7 },
    { date: 'W4', close: 183.2 },
    { date: 'W5', close: 188.3 },
  ],
  '3M': [
    { date: 'Jan', close: 162.5 },
    { date: 'Feb', close: 168.1 },
    { date: 'Mar', close: 171.9 },
    { date: 'Apr', close: 176.2 },
    { date: 'May', close: 180.3 },
    { date: 'Jun', close: 188.3 },
  ],
} satisfies Record<string, { date: string; close: number }[]>

const FEATURE_CARDS = [
  {
    title: 'Search chartable instruments',
    description:
      'Move from ticker search to instrument views built for simulator-style analysis.',
  },
  {
    title: 'Build a tighter watchlist',
    description:
      'Track the symbols you care about with fast context for price moves and alert coverage.',
  },
  {
    title: 'React to real alerts',
    description:
      'Monitor active rules and triggered events inside one market system instead of scattered screens.',
  },
  {
    title: 'Read the market visually',
    description:
      'Use clean chart views and focused data cards to understand price action faster.',
  },
]

const PROCESS_STEPS = [
  'Create your account and enter the simulator dashboard.',
  'Search supported instruments and open the chart view you need.',
  'Track symbols, monitor alerts, and move between price snapshots and chart context without breaking flow.',
]

type PreviewRange = keyof typeof PREVIEW_SERIES

type LandingPageProps = {
  isLoadingMovers: boolean
  movers: MoversResponse | null
  moversError: string
}

export function LandingPage({ isLoadingMovers, movers, moversError }: LandingPageProps) {
  const [selectedRange, setSelectedRange] = useState<PreviewRange>('1M')
  const currentSeries = PREVIEW_SERIES[selectedRange]
  const latestPoint = currentSeries[currentSeries.length - 1]
  const startingPoint = currentSeries[0]
  const delta = latestPoint.close - startingPoint.close
  const deltaPercent = ((delta / startingPoint.close) * 100).toFixed(2)

  return (
    <div className="landing-shell">
      <section className="landing-hero page-section">
        <div className="landing-copy">
          <p className="landing-kicker">Market simulator system • Chart-driven trading workflow</p>
          <h1>Simulate the market with clearer signals and faster decisions.</h1>
          <p className="landing-text">
            MarketMetrics combines instrument search, watchlists, alerts, and chart-led analysis
            inside one focused simulator interface for practice, tracking, and market exploration.
          </p>

          <div className="landing-actions">
            <Link className="primary-action" to="/signup">
              Create account
            </Link>
            <Link className="ghost-action" to="/login">
              Log in
            </Link>
          </div>

          <div className="landing-pill-row">
            <span className="landing-pill">Instrument search</span>
            <span className="landing-pill">Simulator watchlists</span>
            <span className="landing-pill">Alerts and chart views</span>
          </div>
        </div>

        <div className="landing-display">
          <article className="display-card">
            <div className="display-card-top">
              <div className="panel-header-copy">
                <p className="section-label">Simulator preview</p>
                <h2 className="panel-title">Market pulse snapshot</h2>
              </div>

              <div className="range-selector landing-range-selector">
                {(Object.keys(PREVIEW_SERIES) as PreviewRange[]).map((rangeOption) => (
                  <button
                    className={
                      selectedRange === rangeOption ? 'range-pill is-active' : 'range-pill'
                    }
                    key={rangeOption}
                    onClick={() => setSelectedRange(rangeOption)}
                    type="button"
                  >
                    {rangeOption}
                  </button>
                ))}
              </div>
            </div>

            <div className="landing-chart-frame">
              <ResponsiveContainer height={280} width="100%">
                <LineChart data={currentSeries}>
                  <CartesianGrid stroke="rgba(25, 40, 62, 0.08)" vertical={false} />
                  <XAxis axisLine={false} dataKey="date" tickLine={false} />
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
                    }}
                    formatter={(value) => [formatCurrency(Number(value ?? 0)), 'Preview close']}
                  />
                  <Line
                    dataKey="close"
                    dot={false}
                    isAnimationActive={false}
                    stroke="url(#previewLine)"
                    strokeWidth={3}
                    type="monotone"
                  />
                  <defs>
                    <linearGradient id="previewLine" x1="0" x2="1" y1="0" y2="0">
                      <stop offset="0%" stopColor="#0f766e" />
                      <stop offset="100%" stopColor="#cf6c41" />
                    </linearGradient>
                  </defs>
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="display-grid">
              <article className="preview-tile">
                <span className="preview-tile-label">Preview close</span>
                <strong className="preview-tile-value">{formatCurrency(latestPoint.close)}</strong>
              </article>
              <article className="preview-tile">
                <span className="preview-tile-label">Move</span>
                <strong className="preview-tile-value">
                  {delta >= 0 ? '+' : ''}
                  {delta.toFixed(2)} USD
                </strong>
              </article>
              <article className="preview-tile">
                <span className="preview-tile-label">Change</span>
                <strong className="preview-tile-value">
                  {delta >= 0 ? '+' : ''}
                  {deltaPercent}%
                </strong>
              </article>
            </div>
          </article>
        </div>
      </section>

      <DailyMoversSection
        error={moversError}
        isLoading={isLoadingMovers}
        movers={movers}
        variant="landing"
      />

      <section className="landing-feature-section page-section">
        <div className="panel-header-copy">
          <p className="section-label">What the system gives you</p>
          <h2 className="panel-title">A market simulator built around speed, structure, and chart-first analysis</h2>
        </div>

        <div className="feature-grid">
          {FEATURE_CARDS.map((feature) => (
            <article className="feature-card" key={feature.title}>
              <h3 className="feature-card-heading">{feature.title}</h3>
              <p className="feature-card-copy">{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-process page-section">
        <div className="panel-header-copy">
          <p className="section-label">How it works</p>
          <h2 className="panel-title">The flow is built to feel like a real market system</h2>
        </div>

        <div className="process-grid">
          {PROCESS_STEPS.map((step, index) => (
            <article className="process-card" key={step}>
              <span className="process-number">{String(index + 1).padStart(2, '0')}</span>
              <p>{step}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="landing-footer page-section">
        <p>MarketMetrics is a market simulator system for exploring instruments, managing watchlists, and reading price action with clarity.</p>
      </footer>
    </div>
  )
}
