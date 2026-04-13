import { Link } from 'react-router-dom'

import { useMarketPreferences } from '../app/MarketPreferencesContext'
import type { WatchlistItemDetailedOut } from '../lib/api'
import { isAssetCategoryEnabled } from '../lib/marketPreferences'
import { TrackedSymbolCard } from './TrackedSymbolCard'

type TrackedSymbolsPreviewProps = {
  isLoading: boolean
  trackedSymbols: WatchlistItemDetailedOut[]
  variant?: 'panel' | 'hero'
}

export function TrackedSymbolsPreview({
  isLoading,
  trackedSymbols,
  variant = 'panel',
}: TrackedSymbolsPreviewProps) {
  const { preferences } = useMarketPreferences()
  const visibleTrackedSymbols = trackedSymbols.filter((item) =>
    isAssetCategoryEnabled(item.assetCategory, preferences.preferredAssetClasses),
  )
  const previewSymbols = visibleTrackedSymbols.slice(0, 3)
  const hasTrackedSymbols = visibleTrackedSymbols.length > 0
  const hiddenTrackedCount = trackedSymbols.length - visibleTrackedSymbols.length
  const isEmpty = !isLoading && previewSymbols.length === 0

  return (
    <article
      className={`tracked-symbols-preview tracked-symbols-preview--${variant}${
        isEmpty ? ' tracked-symbols-preview--empty' : ''
      }`}
    >
      <div className="panel-header">
        <div className="panel-header-copy">
          <p className="section-label">Tracked symbols</p>
          <h2 className="panel-title">
            {hasTrackedSymbols ? 'Your live chart shortlist' : 'Tracked symbols'}
          </h2>
        </div>

        <div className="tracked-symbols-preview-actions">
          <span className="panel-tag">
            {hiddenTrackedCount > 0 ? `${visibleTrackedSymbols.length} shown` : `${visibleTrackedSymbols.length} tracked`}
          </span>
          {hasTrackedSymbols ? (
            <Link className="ghost-action tracked-symbols-preview-cta" to="/tracked-symbols">
              View all tracked symbols
            </Link>
          ) : (
            <span className="neutral-pill">Ready for your first pick</span>
          )}
        </div>
      </div>

      <p className="panel-note">
        Your newest tracked symbols stay here so you can jump straight back into their live chart
        pages.
      </p>

      {isLoading && trackedSymbols.length === 0 ? (
        <p className="empty-state">Loading your tracked symbols...</p>
      ) : null}

      {isEmpty ? (
        <div className="empty-state tracked-symbols-empty tracked-symbols-empty-hero">
          <div className="tracked-symbols-empty-badge">+</div>
          <div className="tracked-symbols-empty-copy">
            <strong>
              {hiddenTrackedCount > 0
                ? 'No tracked symbols match your market preferences.'
                : 'No tracked stocks.'}
            </strong>
            <p>
              {hiddenTrackedCount > 0
                ? 'Adjust your preferred asset classes in Settings to show more here.'
                : 'Track a symbol to pin it here.'}
            </p>
          </div>
        </div>
      ) : null}

      {previewSymbols.length > 0 ? (
        <div className="tracked-symbols-preview-list">
          {previewSymbols.map((item) => (
            <TrackedSymbolCard item={item} key={item.id} />
          ))}
        </div>
      ) : null}
    </article>
  )
}
