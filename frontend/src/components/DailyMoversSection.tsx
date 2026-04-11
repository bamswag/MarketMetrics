import type { MoversResponse } from '../lib/api'
import { MoverSparklineCard } from './MoverSparklineCard'

type DailyMoversSectionProps = {
  error?: string
  isLoading: boolean
  movers: MoversResponse | null
  variant: 'dashboard' | 'landing'
}

type MoverGroupProps = {
  items: MoversResponse['gainers']
  subtitle: string
  title: string
  tone: 'positive' | 'negative'
}

function MoverGroup({ items, subtitle, title, tone }: MoverGroupProps) {
  return (
    <div className={`mover-group mover-group--${tone}`}>
      <div className="panel-header-copy">
        <p className="section-label">{subtitle}</p>
        <h3 className="subsection-title">{title}</h3>
      </div>

      <div className="mover-card-list">
        {items.length > 0 ? (
          items.map((item) => <MoverSparklineCard item={item} key={item.symbol} tone={tone} />)
        ) : (
          <p className="empty-state">No symbols are available in this group right now.</p>
        )}
      </div>
    </div>
  )
}

export function DailyMoversSection({
  error = '',
  isLoading,
  movers,
  variant,
}: DailyMoversSectionProps) {
  const gainers = movers?.gainers.slice(0, 3) ?? []
  const losers = movers?.losers.slice(0, 3) ?? []
  const sectionClassName =
    variant === 'landing'
      ? 'daily-movers-section page-section'
      : 'panel daily-movers-panel'

  return (
    <section className={sectionClassName}>
      <div className="panel-header">
        <div className="panel-header-copy">
          <p className="section-label">
            {variant === 'landing' ? 'Live daily movers' : 'Daily movers'}
          </p>
          <h2 className="panel-title">
            {variant === 'landing'
              ? "Today's highest and lowest moves in one live market snapshot"
              : "Today's strongest and weakest movers at a glance"}
          </h2>
        </div>

        <span className="panel-tag">Top 3 / Bottom 3</span>
      </div>

      <p className="panel-note">
        Ranked from the latest daily move percentage so you can spot the names leading and lagging
        the market at a glance.
      </p>

      {error ? <p className="error-text">{error}</p> : null}
      {isLoading && !movers ? (
        <p className="empty-state">
          Loading today&apos;s strongest gainers and weakest decliners...
        </p>
      ) : null}

      {!error && !isLoading && !movers ? (
        <p className="empty-state">Daily movers will appear here once live market data is ready.</p>
      ) : null}

      {movers ? (
        <div className="daily-movers-columns">
          <MoverGroup
            items={gainers}
            subtitle="Top 3 gainers"
            title="Leading today"
            tone="positive"
          />
          <MoverGroup
            items={losers}
            subtitle="Bottom 3 losers"
            title="Lagging today"
            tone="negative"
          />
        </div>
      ) : null}
    </section>
  )
}
