import { useMarketPreferences } from '../app/MarketPreferencesContext'
import type { MoversByCategory, MoversResponse } from '../lib/api'
import { assetCategoryLabel, isAssetCategoryEnabled } from '../lib/marketPreferences'
import { MoverSparklineCard } from './MoverSparklineCard'

type DailyMoversSectionProps = {
  error?: string
  isLoading: boolean
  movers: MoversResponse | null
  variant: 'dashboard' | 'landing'
}

type MoverGroupProps = {
  categoryItems?: MoversByCategory
  fallbackItems: MoversResponse['gainers']
  visibleCategories: typeof CATEGORY_ORDER
  subtitle: string
  title: string
  tone: 'positive' | 'negative'
}

const CATEGORY_ORDER = [
  { key: 'stocks', label: 'Stocks' },
  { key: 'crypto', label: 'Crypto' },
  { key: 'etfs', label: 'ETFs' },
] satisfies Array<{
  key: keyof MoversByCategory
  label: string
}>

function MoverGroup({
  categoryItems,
  fallbackItems,
  visibleCategories,
  subtitle,
  title,
  tone,
}: MoverGroupProps) {
  const itemsByCategory: MoversByCategory = {
    stocks: categoryItems?.stocks.slice(0, 3) ?? fallbackItems,
    crypto: categoryItems?.crypto.slice(0, 3) ?? [],
    etfs: categoryItems?.etfs.slice(0, 3) ?? [],
  }

  return (
    <div className={`mover-group mover-group--${tone}`}>
      <div className="panel-header-copy">
        <p className="section-label">{subtitle}</p>
        <h3 className="subsection-title">{title}</h3>
      </div>

      <div
        className="mover-category-columns"
        style={{ gridTemplateColumns: `repeat(${visibleCategories.length}, minmax(0, 1fr))` }}
      >
        {visibleCategories.map(({ key, label }) => {
          const items = itemsByCategory[key]

          return (
            <div className="mover-category-column" key={key}>
              <div className="mover-category-header">
                <p className="mover-category-label">{label}</p>
                <span className="mover-category-count">{items.length}/3</span>
              </div>

              <div className="mover-card-list">
                {items.length > 0 ? (
                  items.map((item) => (
                    <MoverSparklineCard item={item} key={item.symbol} tone={tone} />
                  ))
                ) : (
                  <p className="mover-category-empty">No movers are available right now.</p>
                )}
              </div>
            </div>
          )
        })}
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
  const { preferences } = useMarketPreferences()
  const gainers = movers?.gainers.slice(0, 3) ?? []
  const losers = movers?.losers.slice(0, 3) ?? []
  const gainersByCategory = movers?.gainersByCategory
  const losersByCategory = movers?.losersByCategory
  const visibleCategories = CATEGORY_ORDER.filter(({ key }) =>
    isAssetCategoryEnabled(key, preferences.preferredAssetClasses),
  )
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
        <div className="daily-movers-columns">
          <MoverGroup
            categoryItems={gainersByCategory}
            fallbackItems={gainers}
            visibleCategories={visibleCategories}
            subtitle="Top 3 gainers"
            title="Leading today"
            tone="positive"
          />
          <MoverGroup
            categoryItems={losersByCategory}
            fallbackItems={losers}
            visibleCategories={visibleCategories}
            subtitle="Bottom 3 losers"
            title="Lagging today"
            tone="negative"
          />
        </div>
      ) : null}
    </section>
  )
}
