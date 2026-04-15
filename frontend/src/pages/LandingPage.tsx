import { Link } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { DailyMoversSection } from '../components/DailyMoversSection'
import { MoverLogo } from '../components/MoverLogo'
import type { Mover, MoversResponse } from '../lib/api'
import { formatCurrency } from '../lib/formatters'
import '../styles/pages/LandingPage.css'

function getTopGainer(movers: MoversResponse | null): Mover | null {
  if (!movers) return null
  const all = [
    ...(movers.gainersByCategory?.stocks ?? movers.gainers ?? []),
    ...(movers.gainersByCategory?.crypto ?? []),
    ...(movers.gainersByCategory?.etfs ?? []),
  ]
  if (all.length === 0) return null
  return all.reduce<Mover>((best, m) => {
    const pct = parseFloat(m.change_percent ?? '0')
    const bestPct = parseFloat(best.change_percent ?? '0')
    return pct > bestPct ? m : best
  }, all[0])
}

function buildSparkline(price: number, changeAmount: number): { date: string; v: number }[] {
  const open = price - changeAmount
  const steps = [0, 0.15, 0.35, 0.55, 0.78, 1]
  const jitter = [0, 0.3, -0.2, 0.4, -0.1, 0]
  const today = new Date()
  return steps.map((t, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - (steps.length - 1 - i))
    return {
      date: d.toISOString().slice(0, 10),
      v: open + changeAmount * t + changeAmount * jitter[i] * 0.18,
    }
  })
}

function formatChangePercent(raw: string | null | undefined): string {
  if (!raw) return '--'
  const trimmed = raw.replace('%', '').trim()
  const num = parseFloat(trimmed)
  if (Number.isNaN(num)) return raw
  return `+${num.toFixed(2)}%`
}

type TopGainerCardProps = {
  topGainer: Mover
  topGainerSeries: { date: string; close: number }[]
}

function TopGainerCard({ topGainer, topGainerSeries }: TopGainerCardProps) {
  const chartData =
    topGainerSeries.length > 0
      ? topGainerSeries.map((p) => ({ date: p.date, v: p.close }))
      : topGainer.change_amount != null && topGainer.price != null
        ? buildSparkline(topGainer.price, topGainer.change_amount)
        : []

  // Compute an explicit Y domain to avoid Recharts 'auto' infinite re-render loop
  const yValues = chartData.map((d) => d.v).filter((v) => isFinite(v))
  const yMin = yValues.length > 0 ? Math.min(...yValues) : 0
  const yMax = yValues.length > 0 ? Math.max(...yValues) : 100
  const yPad = (yMax - yMin) * 0.08 || 1
  const yDomain: [number, number] = [yMin - yPad, yMax + yPad]

  return (
    <>
      {topGainer.price != null && chartData.length > 0 ? (
        <div className="hero-gainer-chart">
          <ResponsiveContainer height={180} width="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,118,110,0.1)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#6b7280' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(d: string) => {
                  if (!d) return ''
                  return new Date(d).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
                }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={yDomain}
                orientation="right"
                tick={{ fontSize: 10, fill: '#6b7280' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) =>
                  `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                }
                width={56}
              />
              <Tooltip
                contentStyle={{
                  fontSize: '0.78rem',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  background: '#fff',
                }}
                formatter={(v: any) => [formatCurrency(v as number), 'Price']}
                labelFormatter={(label: any) => {
                  const labelStr = String(label ?? '')
                  if (!labelStr) return ''
                  return new Date(labelStr).toLocaleDateString('en-GB', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })
                }}
              />
              <Area
                dataKey="v"
                fill="#0f766e"
                fillOpacity={0.15}
                isAnimationActive={false}
                stroke="#0f766e"
                strokeWidth={2}
                type="monotone"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      <div className="hero-gainer-body">
        <MoverLogo name={topGainer.name} symbol={topGainer.symbol} />
        <div className="hero-gainer-info">
          <strong className="hero-gainer-symbol">{topGainer.symbol}</strong>
          <p className="hero-gainer-name">{topGainer.name ?? topGainer.symbol}</p>
        </div>
        <span className="hero-gainer-change">{formatChangePercent(topGainer.change_percent)}</span>
      </div>

      {topGainer.price != null ? (
        <div className="hero-gainer-price-row">
          <span className="hero-gainer-price-label">Current price</span>
          <strong className="hero-gainer-price">{formatCurrency(topGainer.price)}</strong>
        </div>
      ) : null}

      <Link
        className="hero-gainer-link"
        to={`/instrument/${encodeURIComponent(topGainer.symbol)}`}
      >
        View instrument &rarr;
      </Link>
    </>
  )
}

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
  topGainerSeries?: { date: string; close: number }[]
}

export function LandingPage({ isLoadingMovers, movers, moversError, topGainerSeries = [] }: LandingPageProps) {
  const topGainer = getTopGainer(movers)

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
            <p className="section-label">Top gainer this week</p>

            {isLoadingMovers && !topGainer ? (
              <div className="hero-gainer-skeleton">
                <div className="skeleton-chart-placeholder" />
                <div className="hero-gainer-skeleton-body">
                  <div className="skeleton-logo" />
                  <div className="skeleton-lines">
                    <div className="skeleton-line skeleton-line--wide" />
                    <div className="skeleton-line skeleton-line--narrow" />
                  </div>
                </div>
              </div>
            ) : topGainer ? (
              <TopGainerCard topGainer={topGainer} topGainerSeries={topGainerSeries} />
            ) : (
              <p className="empty-state">Market data will appear here shortly.</p>
            )}
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
