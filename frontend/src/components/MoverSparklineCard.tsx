import { Link } from 'react-router-dom'

import { useMarketPreferences } from '../app/MarketPreferencesContext'
import type { Mover } from '../lib/api'
import { formatPriceChangeWithPreferences } from '../lib/marketDisplay'
import { MoverLogo } from './MoverLogo'

type MoverSparklineCardProps = {
  item: Mover
  tone: 'positive' | 'negative'
}

export function MoverSparklineCard({ item, tone }: MoverSparklineCardProps) {
  const { preferences } = useMarketPreferences()
  const pillClassName = tone === 'positive' ? 'positive-pill' : 'negative-pill'
  const changeDisplay = formatPriceChangeWithPreferences(
    { change: item.change_amount, changePercent: item.change_percent },
    preferences,
  )

  return (
    <Link
      className={`mover-card instrument-surface instrument-surface--${tone}`}
      to={`/instrument/${encodeURIComponent(item.symbol)}`}
    >
      <div className="mover-card-head">
        <div className="mover-card-brand">
          <MoverLogo name={item.name} symbol={item.symbol} />
          <div className="mover-card-copy">
            <strong className="mover-card-symbol">{item.symbol}</strong>
            <p className="mover-card-name">{item.name ?? 'Instrument name unavailable'}</p>
          </div>
        </div>

        <span className={pillClassName}>{changeDisplay}</span>
      </div>
    </Link>
  )
}
