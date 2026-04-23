import type { ReactNode } from 'react'

import type { Mover, MoversByCategory } from '../lib/api'
import { MoverSparklineCard } from './MoverSparklineCard'

export type VisibleMoverCategory = {
  key: keyof MoversByCategory
  label: string
}

export const DEFAULT_MOVER_CATEGORIES = [
  { key: 'stocks', label: 'Stocks' },
  { key: 'crypto', label: 'Crypto' },
  { key: 'etfs', label: 'ETFs' },
] satisfies ReadonlyArray<VisibleMoverCategory>

type DailyMoverCardProps = {
  action?: ReactNode
  categoryItems?: MoversByCategory
  className?: string
  countTarget?: number
  description?: string
  eyebrow?: string
  fallbackItems: Mover[]
  itemLimit?: number
  tagLabel?: string
  title?: string
  tone: 'positive' | 'negative'
  visibleCategories: ReadonlyArray<VisibleMoverCategory>
}

export function DailyMoverCard({
  action,
  categoryItems,
  className = '',
  countTarget,
  description,
  eyebrow,
  fallbackItems,
  itemLimit = 3,
  tagLabel,
  title,
  tone,
  visibleCategories,
}: DailyMoverCardProps) {
  const maxCount = countTarget ?? itemLimit
  const hasCardHeader = Boolean(eyebrow || title || description || action || tagLabel)
  const isDetailedHeader = Boolean(eyebrow || description || tagLabel)
  const itemsByCategory: MoversByCategory = {
    stocks: categoryItems?.stocks.slice(0, itemLimit) ?? fallbackItems.slice(0, itemLimit),
    crypto: categoryItems?.crypto.slice(0, itemLimit) ?? [],
    etfs: categoryItems?.etfs.slice(0, itemLimit) ?? [],
  }

  const activeCategories = visibleCategories.filter(({ key }) => itemsByCategory[key].length > 0)

  return (
    <article className={`daily-mover-card mover-group mover-group--${tone} ${className}`.trim()}>
      {hasCardHeader ? (
        <div
          className={`panel-header daily-mover-card-header${
            isDetailedHeader ? ' daily-mover-card-header--detailed' : ''
          }`}
        >
          <div className="panel-header-copy">
            {eyebrow ? <p className="section-label">{eyebrow}</p> : null}
            {title ? <h3 className="subsection-title">{title}</h3> : null}
            {description ? <p className="daily-mover-card-description">{description}</p> : null}
          </div>

          {action || tagLabel ? (
            <div className="daily-mover-card-actions">
              {tagLabel ? <span className="panel-tag daily-mover-card-tag">{tagLabel}</span> : null}
              {action}
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className="mover-category-columns"
        style={{ gridTemplateColumns: `repeat(${activeCategories.length}, minmax(0, 1fr))` }}
      >
        {activeCategories.map(({ key, label }) => {
          const items = itemsByCategory[key]

          return (
            <div className="mover-category-column" key={key}>
              <div className="mover-category-header">
                <span className="mover-category-badge">
                  {label}
                  <span className="mover-category-count">{items.length}/{maxCount}</span>
                </span>
              </div>

              <div className="mover-card-list">
                {items.map((item) => (
                  <MoverSparklineCard item={item} key={item.symbol} tone={tone} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {activeCategories.length === 0 ? (
        <p className="mover-category-empty">No movers are available right now.</p>
      ) : null}
    </article>
  )
}
