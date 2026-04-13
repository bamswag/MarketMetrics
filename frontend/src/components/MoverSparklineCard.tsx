import { Link } from 'react-router-dom'

import type { Mover } from '../lib/api'
import { MoverLogo } from './MoverLogo'

type MoverSparklineCardProps = {
  item: Mover
  tone: 'positive' | 'negative'
}

export function MoverSparklineCard({ item, tone }: MoverSparklineCardProps) {
  const pillClassName = tone === 'positive' ? 'positive-pill' : 'negative-pill'

  return (
    <Link
      className={`mover-card mover-card--${tone}`}
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

        <span className={pillClassName}>{item.change_percent ?? '--'}</span>
      </div>
    </Link>
  )
}
