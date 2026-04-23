import { Link } from 'react-router-dom'

import { useMarketPreferences } from '../app/MarketPreferencesContext'
import type { Mover, MoversByCategory, MoversResponse } from '../lib/api'
import { assetCategoryLabel, isAssetCategoryEnabled } from '../lib/marketPreferences'
import { DailyMoverCard, DEFAULT_MOVER_CATEGORIES } from './DailyMoverCard'

type DailyMoversSectionProps = {
  error?: string
  isLoading: boolean
  movers: MoversResponse | null
  variant: 'dashboard' | 'landing'
}

function parseMoverPercentValue(value: string | null | undefined) {
  if (!value) {
    return 0
  }

  const normalizedValue = Number.parseFloat(value.replace('%', '').trim())
  return Number.isFinite(normalizedValue) ? normalizedValue : 0
}

function moverPercentValue(mover: Mover) {
  return parseMoverPercentValue(mover.change_percent)
}

function moverChangeAmountValue(mover: Mover) {
  return typeof mover.change_amount === 'number' && Number.isFinite(mover.change_amount)
    ? mover.change_amount
    : 0
}

function sortMoversForDailyCard(
  items: Mover[],
  tone: 'positive' | 'negative',
  usePriceChangeRanking: boolean,
) {
  const sortedItems = [...items]

  sortedItems.sort((left, right) => {
    const leftValue = usePriceChangeRanking
      ? moverChangeAmountValue(left)
      : moverPercentValue(left)
    const rightValue = usePriceChangeRanking
      ? moverChangeAmountValue(right)
      : moverPercentValue(right)

    return tone === 'positive' ? rightValue - leftValue : leftValue - rightValue
  })

  return sortedItems
}

function sortMoversByCategory(
  itemsByCategory: MoversByCategory | undefined,
  tone: 'positive' | 'negative',
  usePriceChangeRanking: boolean,
) {
  if (!itemsByCategory) {
    return undefined
  }

  return {
    stocks: sortMoversForDailyCard(itemsByCategory.stocks, tone, usePriceChangeRanking),
    crypto: sortMoversForDailyCard(itemsByCategory.crypto, tone, usePriceChangeRanking),
    etfs: sortMoversForDailyCard(itemsByCategory.etfs, tone, usePriceChangeRanking),
  } satisfies MoversByCategory
}

export function DailyMoversSection({
  error = '',
  isLoading,
  movers,
  variant,
}: DailyMoversSectionProps) {
  const { preferences } = useMarketPreferences()
  const usePriceChangeRanking = preferences.priceDisplayMode === 'change'
  const gainers = sortMoversForDailyCard(
    movers?.gainers ?? [],
    'positive',
    usePriceChangeRanking,
  ).slice(0, 3)
  const losers = sortMoversForDailyCard(
    movers?.losers ?? [],
    'negative',
    usePriceChangeRanking,
  ).slice(0, 3)
  const gainersByCategory = sortMoversByCategory(
    movers?.gainersByCategory,
    'positive',
    usePriceChangeRanking,
  )
  const losersByCategory = sortMoversByCategory(
    movers?.losersByCategory,
    'negative',
    usePriceChangeRanking,
  )
  const visibleCategories = DEFAULT_MOVER_CATEGORIES.filter(({ key }) =>
    isAssetCategoryEnabled(key, preferences.preferredAssetClasses),
  )
  const categoryTag =
    visibleCategories.length > 0
      ? visibleCategories.map(({ key }) => assetCategoryLabel(key)).join(' + ')
      : undefined
  const sectionClassName =
    variant === 'landing'
      ? 'daily-movers-section daily-movers-section--landing page-section'
      : 'daily-movers-section daily-movers-section--dashboard'

  const gainersDescription = usePriceChangeRanking
    ? 'Ranked by the biggest raw daily price gains so you can compare the leaders across stocks, crypto names, and ETFs.'
    : 'Ranked by the strongest daily move percentage so you can compare the leaders across stocks, crypto names, and ETFs.'

  const losersDescription = usePriceChangeRanking
    ? 'Ranked by the steepest raw daily price declines so you can compare the weakest names across stocks, crypto, and ETFs.'
    : 'Ranked by the sharpest daily move percentage drops so you can compare the weakest names across stocks, crypto, and ETFs.'

  return (
    <section className={sectionClassName}>
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
            <section className="daily-mover-panel daily-mover-panel--positive">
              <div className="daily-mover-panel-header">
                <div className="daily-mover-panel-copy">
                  <p className="section-label">Top 3 gainers</p>
                  <p className="daily-mover-card-description">{gainersDescription}</p>
                </div>

                {categoryTag ? <span className="panel-tag daily-mover-card-tag">{categoryTag}</span> : null}
              </div>

              <DailyMoverCard
                action={(
                  <Link className="ghost-action daily-mover-card-link" to="/movers/gainers">
                    View all gainers
                  </Link>
                )}
                categoryItems={gainersByCategory}
                fallbackItems={gainers}
                visibleCategories={visibleCategories}
                title="Leading today"
                tone="positive"
              />
            </section>

            <section className="daily-mover-panel daily-mover-panel--negative">
              <div className="daily-mover-panel-header">
                <div className="daily-mover-panel-copy">
                  <p className="section-label">Bottom 3 losers</p>
                  <p className="daily-mover-card-description">{losersDescription}</p>
                </div>

                {categoryTag ? <span className="panel-tag daily-mover-card-tag">{categoryTag}</span> : null}
              </div>

              <DailyMoverCard
                action={(
                  <Link className="ghost-action daily-mover-card-link" to="/movers/losers">
                    View all losers
                  </Link>
                )}
                categoryItems={losersByCategory}
                fallbackItems={losers}
                visibleCategories={visibleCategories}
                title="Lagging today"
                tone="negative"
              />
            </section>
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
