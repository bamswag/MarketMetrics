import { Link } from 'react-router-dom'

import { useMarketPreferences } from '../app/MarketPreferencesContext'
import type { Mover } from '../lib/api'
import {
  formatCurrencyWithPreferences,
  formatPriceChangeWithPreferences,
} from '../lib/marketDisplay'

type MoversPanelProps = {
  title: string
  subtitle: string
  items: Mover[]
  tone: 'positive' | 'negative'
}

export function MoversPanel({ title, subtitle, items, tone }: MoversPanelProps) {
  const { preferences } = useMarketPreferences()
  return (
    <article className="panel">
      <div className="panel-header">
        <div className="panel-header-copy">
          <p className="section-label">{subtitle}</p>
          <h2 className="panel-title">{title}</h2>
        </div>
      </div>

      <div className="list-shell">
        {items.length > 0 ? (
          items.slice(0, 5).map((item) => {
            const pillClassName =
              tone === 'negative'
                ? 'negative-pill'
                : item.change_percent
                  ? 'positive-pill'
                  : 'neutral-pill'

            return (
              <div className="list-row" key={item.symbol}>
                <div className="list-row-meta">
                  <div className="list-row-heading">
                    <strong>{item.symbol}</strong>
                    <Link className="inline-link" to={`/instrument/${item.symbol}`}>
                      Open chart
                    </Link>
                  </div>
                  <p>{item.name ?? 'Company name unavailable'}</p>
                  <p>
                    {item.price !== null && item.price !== undefined
                      ? formatCurrencyWithPreferences(item.price, preferences)
                      : 'Price unavailable'}
                  </p>
                </div>

                <span className={pillClassName}>
                  {formatPriceChangeWithPreferences(
                    { change: item.change_amount, changePercent: item.change_percent },
                    preferences,
                  )}
                </span>
              </div>
            )
          })
        ) : (
          <p className="empty-state">Mover data will appear here once the dashboard loads.</p>
        )}
      </div>
    </article>
  )
}
