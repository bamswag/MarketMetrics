import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { DailyMoversSection } from '../components/DailyMoversSection'
import type { MoversResponse } from '../lib/api'
import { formatCurrency } from '../lib/formatters'
import '../styles/pages/LandingPage.css'

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
    icon: 'search',
    title: 'Instrument search',
    description:
      'Instantly find any stock by name or ticker and jump into a detailed chart view.',
  },
  {
    icon: 'chart',
    title: 'Interactive charts',
    description:
      'Explore price history with smooth area charts, range selectors, and live tooltips.',
  },
  {
    icon: 'track',
    title: 'Smart watchlists',
    description:
      'Track the symbols you care about and get fast context on price moves.',
  },
  {
    icon: 'alert',
    title: 'Price alerts',
    description:
      'Set rules on price thresholds and get notified when conditions are met.',
  },
]

const ICON_MAP: Record<string, string> = {
  search: '\u2315',
  chart: '\u2197',
  track: '\u2606',
  alert: '\u26A1',
}

const PROCESS_STEPS = [
  { step: 'Sign up', detail: 'Create your account in seconds and enter the simulator dashboard.' },
  { step: 'Explore', detail: 'Search instruments, open interactive chart views, and track your picks.' },
  { step: 'Monitor', detail: 'Set price alerts, review triggered events, and stay in the flow.' },
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

  const prices = currentSeries.map((p) => p.close)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const padding = (maxPrice - minPrice) * 0.1
  const domainMin = Math.max(0, minPrice - padding)
  const domainMax = maxPrice + padding

  return (
    <div className="landing-shell">
      <section className="landing-hero page-section">
        <div className="landing-copy">
          <div className="landing-badge-row">
            <span className="landing-badge">Market Simulator</span>
            <span className="landing-badge landing-badge--accent">Live Data</span>
          </div>
          <h1>Simulate the market with clarity and confidence.</h1>
          <p className="landing-text">
            Search instruments, build watchlists, set price alerts, and read chart-driven
            analysis — all inside one focused interface.
          </p>

          <div className="landing-actions">
            <Link className="primary-action" to="/signup">
              Get started free
            </Link>
            <Link className="ghost-action" to="/login">
              Log in
            </Link>
          </div>

          <div className="landing-stats-row">
            <div className="landing-stat">
              <strong className="landing-stat-value">500+</strong>
              <span className="landing-stat-label">Instruments</span>
            </div>
            <div className="landing-stat-divider" />
            <div className="landing-stat">
              <strong className="landing-stat-value">Real-time</strong>
              <span className="landing-stat-label">Market data</span>
            </div>
            <div className="landing-stat-divider" />
            <div className="landing-stat">
              <strong className="landing-stat-value">Free</strong>
              <span className="landing-stat-label">To use</span>
            </div>
          </div>
        </div>

        <div className="landing-display">
          <article className="display-card">
            <div className="display-card-top">
              <div className="panel-header-copy">
                <p className="section-label">Live preview</p>
                <h2 className="panel-title">Market pulse</h2>
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
              <ResponsiveContainer height={260} width="100%">
                <AreaChart data={currentSeries} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="previewLine" x1="0" x2="1" y1="0" y2="0">
                      <stop offset="0%" stopColor="#0f766e" />
                      <stop offset="100%" stopColor="#10b981" />
                    </linearGradient>
                    <linearGradient id="previewFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0f766e" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#0f766e" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(25, 40, 62, 0.06)" strokeDasharray="4 4" vertical={false} />
                  <XAxis
                    axisLine={false}
                    dataKey="date"
                    tick={{ fill: '#687487', fontSize: 12 }}
                    tickLine={false}
                  />
                  <YAxis
                    axisLine={false}
                    domain={[domainMin, domainMax]}
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
                        <div className="landing-tooltip">
                          <span className="landing-tooltip-label">{String(label)}</span>
                          <span className="landing-tooltip-value">{formatCurrency(value)}</span>
                        </div>
                      )
                    }}
                  />
                  <Area
                    dataKey="close"
                    fill="url(#previewFill)"
                    fillOpacity={1}
                    isAnimationActive={false}
                    stroke="url(#previewLine)"
                    strokeWidth={2.5}
                    type="monotone"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="display-grid">
              <article className="preview-tile">
                <span className="preview-tile-label">Close</span>
                <strong className="preview-tile-value">{formatCurrency(latestPoint.close)}</strong>
              </article>
              <article className="preview-tile">
                <span className="preview-tile-label">Move</span>
                <strong className="preview-tile-value preview-tile-value--positive">
                  +{delta.toFixed(2)}
                </strong>
              </article>
              <article className="preview-tile">
                <span className="preview-tile-label">Change</span>
                <strong className="preview-tile-value preview-tile-value--positive">
                  +{deltaPercent}%
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
        <div className="landing-feature-header">
          <p className="section-label">Platform features</p>
          <h2 className="landing-section-heading">Everything you need to read the market</h2>
          <p className="landing-section-subtext">
            Built for students and traders who want a clean, focused simulator experience.
          </p>
        </div>

        <div className="feature-grid">
          {FEATURE_CARDS.map((feature) => (
            <article className="feature-card" key={feature.title}>
              <span className="feature-icon">{ICON_MAP[feature.icon]}</span>
              <h3 className="feature-card-heading">{feature.title}</h3>
              <p className="feature-card-copy">{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-process page-section">
        <div className="landing-feature-header">
          <p className="section-label">How it works</p>
          <h2 className="landing-section-heading">Three steps to market clarity</h2>
        </div>

        <div className="process-grid">
          {PROCESS_STEPS.map((item, index) => (
            <article className="process-card" key={item.step}>
              <span className="process-number">{String(index + 1).padStart(2, '0')}</span>
              <h3 className="process-step-title">{item.step}</h3>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-cta page-section">
        <div className="landing-cta-inner">
          <h2 className="landing-cta-heading">Ready to start tracking?</h2>
          <p className="landing-cta-text">
            Create your free account and explore the market in under a minute.
          </p>
          <div className="landing-actions">
            <Link className="primary-action" to="/signup">
              Create free account
            </Link>
            <Link className="ghost-action" to="/login">
              Log in
            </Link>
          </div>
        </div>
      </section>

      <footer className="landing-footer page-section">
        <p>MarketMetrics — a market simulator for exploring instruments, managing watchlists, and reading price action with clarity.</p>
      </footer>
    </div>
  )
}
