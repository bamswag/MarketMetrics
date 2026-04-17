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
  fallbackItems: Mover[]
  itemLimit?: number
  subtitle: string
  title: string
  tone: 'positive' | 'negative'
  visibleCategories: ReadonlyArray<VisibleMoverCategory>
}

export function DailyMoverCard({
  action,
  categoryItems,
  className = '',
  countTarget,
  fallbackItems,
  itemLimit = 3,
  subtitle,
  title,
  tone,
  visibleCategories,
}: DailyMoverCardProps) {
  const maxCount = countTarget ?? itemLimit
  const itemsByCategory: MoversByCategory = {
    stocks: categoryItems?.stocks.slice(0, itemLimit) ?? fallbackItems.slice(0, itemLimit),
    crypto: categoryItems?.crypto.slice(0, itemLimit) ?? [],
    etfs: categoryItems?.etfs.slice(0, itemLimit) ?? [],
  }

  return (
    <article className={`daily-mover-card mover-group mover-group--${tone} ${className}`.trim()}>
      <div className="panel-header daily-mover-card-header">
        <div className="panel-header-copy">
          <p className="section-label">{subtitle}</p>
          <h3 className="subsection-title">{title}</h3>
        </div>

        {action ? (
          <div className="daily-mover-card-actions">
            {action}
          </div>
        ) : null}
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
                <span className="mover-category-badge">
                  {label}
                  <span className="mover-category-count">{items.length}/{maxCount}</span>
                </span>
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
    </article>
  )
}
