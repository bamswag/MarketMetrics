import { Link } from 'react-router-dom'

import { DailyMoversSection } from '../components/DailyMoversSection'
import { FeaturedMoverCard } from '../components/FeaturedMoverCard'
import { InsightCard } from '../components/InsightCard'
import type { MoversResponse } from '../lib/api'
import '../styles/pages/LandingPage.css'


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

type LandingPageProps = {
  isLoadingMovers: boolean
  movers: MoversResponse | null
  moversError: string
}

export function LandingPage({ isLoadingMovers, movers, moversError }: LandingPageProps) {
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
            <FeaturedMoverCard />
          </article>
        </div>
      </section>

      <section className="landing-insight-mosaic page-section">
        <DailyMoversSection
          betweenPanels={(
            <>
              <InsightCard id="live-market-data" />
              <InsightCard id="forecast-vs-projection" />
            </>
          )}
          error={moversError}
          isLoading={isLoadingMovers}
          movers={movers}
          variant="landing"
        />

        <InsightCard id="not-financial-advice" />
      </section>

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
