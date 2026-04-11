type MoverLogoProps = {
  name?: string | null
  symbol: string
}

type BrandMark = {
  background: string
  color: string
  label: string
}

const BRAND_MARKS: Record<string, BrandMark> = {
  AAPL: { label: 'A', background: 'linear-gradient(135deg, #111827, #475569)', color: '#f8fafc' },
  MSFT: { label: 'MS', background: 'linear-gradient(135deg, #2563eb, #0ea5e9)', color: '#eff6ff' },
  NVDA: { label: 'NV', background: 'linear-gradient(135deg, #16a34a, #22c55e)', color: '#f0fdf4' },
  AMZN: { label: 'AZ', background: 'linear-gradient(135deg, #f59e0b, #f97316)', color: '#fff7ed' },
  GOOGL: { label: 'GO', background: 'linear-gradient(135deg, #2563eb, #dc2626)', color: '#ffffff' },
  META: { label: 'ME', background: 'linear-gradient(135deg, #2563eb, #7c3aed)', color: '#eef2ff' },
  TSLA: { label: 'TS', background: 'linear-gradient(135deg, #991b1b, #ef4444)', color: '#fff5f5' },
  AMD: { label: 'AM', background: 'linear-gradient(135deg, #14532d, #22c55e)', color: '#f0fdf4' },
  NFLX: { label: 'NF', background: 'linear-gradient(135deg, #7f1d1d, #dc2626)', color: '#fff5f5' },
  INTC: { label: 'IN', background: 'linear-gradient(135deg, #1d4ed8, #38bdf8)', color: '#eff6ff' },
  JPM: { label: 'JP', background: 'linear-gradient(135deg, #1e293b, #475569)', color: '#f8fafc' },
  BAC: { label: 'BA', background: 'linear-gradient(135deg, #1d4ed8, #ef4444)', color: '#ffffff' },
  V: { label: 'V', background: 'linear-gradient(135deg, #1d4ed8, #2563eb)', color: '#eff6ff' },
  MA: { label: 'MA', background: 'linear-gradient(135deg, #f97316, #ef4444)', color: '#fff7ed' },
  WMT: { label: 'WM', background: 'linear-gradient(135deg, #2563eb, #facc15)', color: '#eff6ff' },
  DIS: { label: 'DI', background: 'linear-gradient(135deg, #2563eb, #0f172a)', color: '#eff6ff' },
  KO: { label: 'KO', background: 'linear-gradient(135deg, #b91c1c, #ef4444)', color: '#fff5f5' },
  PEP: { label: 'PP', background: 'linear-gradient(135deg, #1d4ed8, #ef4444)', color: '#ffffff' },
  XOM: { label: 'XO', background: 'linear-gradient(135deg, #b91c1c, #f97316)', color: '#fff7ed' },
  CVX: { label: 'CV', background: 'linear-gradient(135deg, #1d4ed8, #06b6d4)', color: '#ecfeff' },
}

function fallbackLabel(symbol: string) {
  return symbol.trim().toUpperCase().slice(0, 2) || 'MM'
}

export function MoverLogo({ name, symbol }: MoverLogoProps) {
  const normalizedSymbol = symbol.trim().toUpperCase()
  const mark = BRAND_MARKS[normalizedSymbol]
  const label = mark?.label ?? fallbackLabel(normalizedSymbol)

  return (
    <span
      aria-hidden="true"
      className={mark ? 'mover-logo mover-logo--mapped' : 'mover-logo mover-logo--fallback'}
      style={
        mark
          ? {
              background: mark.background,
              color: mark.color,
            }
          : undefined
      }
      title={name ?? normalizedSymbol}
    >
      <span className="mover-logo-mark">{label}</span>
    </span>
  )
}
