import { Link } from 'react-router-dom'

import { useMarketPreferences } from '../app/MarketPreferencesContext'
import type { MoversResponse } from '../lib/api'
import { assetCategoryLabel, isAssetCategoryEnabled } from '../lib/marketPreferences'
import { DailyMoverCard, DEFAULT_MOVER_CATEGORIES } from './DailyMoverCard'

type DailyMoversSectionProps = {
  error?: string
  isLoading: boolean
  movers: MoversResponse | null
  variant: 'dashboard' | 'landing'
}

export function DailyMoversSection({
  error = '',
  isLoading,
  movers,
  variant,
}: DailyMoversSectionProps) {
  const { preferences } = useMarketPreferences()
  const gainers = movers?.gainers.slice(0, 3) ?? []
  const losers = movers?.losers.slice(0, 3) ?? []
  const gainersByCategory = movers?.gainersByCategory
  const losersByCategory = movers?.losersByCategory
  const visibleCategories = DEFAULT_MOVER_CATEGORIES.filter(({ key }) =>
    isAssetCategoryEnabled(key, preferences.preferredAssetClasses),
  )
  const sectionClassName =
    variant === 'landing'
      ? 'daily-movers-section daily-movers-section--landing page-section'
      : 'daily-movers-section daily-movers-section--dashboard'

  return (
    <section className={sectionClassName}>
      <div className="panel-header">
        <div className="panel-header-copy">
          <p className="section-label">
            {variant === 'landing' ? 'Live daily movers' : 'Daily movers'}
          </p>
          <h2 className="panel-title">
            {variant === 'landing'
              ? "Today's highest and lowest moves across stocks, crypto, and ETFs"
              : "Today's strongest and weakest movers across stocks, crypto, and ETFs"}
          </h2>
        </div>

        <span className="panel-tag">
          {visibleCategories.map(({ key }) => assetCategoryLabel(key)).join(' + ')}
        </span>
      </div>

      <p className="panel-note">
        Ranked from the latest daily move percentage so you can compare the top and bottom three
        stocks, crypto names, and ETFs side by side.
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
        <>
          <div className="daily-movers-columns">
            <DailyMoverCard
              action={(
                <Link className="ghost-action daily-mover-card-link" to="/movers/gainers">
                  View all gainers
                </Link>
              )}
              categoryItems={gainersByCategory}
              fallbackItems={gainers}
              visibleCategories={visibleCategories}
              subtitle="Top 3 gainers"
              title="Leading today"
              tone="positive"
            />
            <DailyMoverCard
              action={(
                <Link className="ghost-action daily-mover-card-link" to="/movers/losers">
                  View all losers
                </Link>
              )}
              categoryItems={losersByCategory}
              fallbackItems={losers}
              visibleCategories={visibleCategories}
              subtitle="Bottom 3 losers"
              title="Lagging today"
              tone="negative"
            />
          </div>
          {variant === 'landing' ? (
            <p className="movers-guest-cta">
              <Link className="movers-guest-cta-link" to="/signup">Create a free account</Link>
              {' '}to track these symbols and get notified when they hit a price you set.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
