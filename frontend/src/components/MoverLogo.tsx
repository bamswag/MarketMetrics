import { useState } from 'react'

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
  SPY: { label: 'SP', background: 'linear-gradient(135deg, #0f766e, #2dd4bf)', color: '#f0fdfa' },
  QQQ: { label: 'QQ', background: 'linear-gradient(135deg, #1d4ed8, #7c3aed)', color: '#eef2ff' },
  DIA: { label: 'DI', background: 'linear-gradient(135deg, #0f172a, #475569)', color: '#f8fafc' },
  IWM: { label: 'IW', background: 'linear-gradient(135deg, #2563eb, #0ea5e9)', color: '#eff6ff' },
  VOO: { label: 'VO', background: 'linear-gradient(135deg, #b91c1c, #f97316)', color: '#fff7ed' },
  VTI: { label: 'VT', background: 'linear-gradient(135deg, #991b1b, #ef4444)', color: '#fff5f5' },
  XLK: { label: 'XK', background: 'linear-gradient(135deg, #0f766e, #14b8a6)', color: '#f0fdfa' },
  XLF: { label: 'XF', background: 'linear-gradient(135deg, #1d4ed8, #38bdf8)', color: '#eff6ff' },
  XLV: { label: 'XV', background: 'linear-gradient(135deg, #16a34a, #4ade80)', color: '#f0fdf4' },
  XLE: { label: 'XE', background: 'linear-gradient(135deg, #b45309, #f59e0b)', color: '#fff7ed' },
  SMH: { label: 'SM', background: 'linear-gradient(135deg, #4338ca, #8b5cf6)', color: '#f5f3ff' },
  ARKK: { label: 'AK', background: 'linear-gradient(135deg, #0f172a, #6366f1)', color: '#eef2ff' },
  TLT: { label: 'TL', background: 'linear-gradient(135deg, #334155, #64748b)', color: '#f8fafc' },
  GLD: { label: 'GD', background: 'linear-gradient(135deg, #ca8a04, #facc15)', color: '#422006' },
  'BTC/USD': { label: 'BT', background: 'linear-gradient(135deg, #f59e0b, #f97316)', color: '#fff7ed' },
  'ETH/USD': { label: 'ET', background: 'linear-gradient(135deg, #334155, #6366f1)', color: '#eef2ff' },
  'SOL/USD': { label: 'SO', background: 'linear-gradient(135deg, #7c3aed, #14b8a6)', color: '#f5f3ff' },
  'DOGE/USD': { label: 'DG', background: 'linear-gradient(135deg, #ca8a04, #facc15)', color: '#422006' },
  'ADA/USD': { label: 'AD', background: 'linear-gradient(135deg, #2563eb, #38bdf8)', color: '#eff6ff' },
  'XRP/USD': { label: 'XR', background: 'linear-gradient(135deg, #111827, #6b7280)', color: '#f9fafb' },
  'AVAX/USD': { label: 'AV', background: 'linear-gradient(135deg, #b91c1c, #ef4444)', color: '#fff5f5' },
  'LINK/USD': { label: 'LI', background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#eff6ff' },
  'DOT/USD': { label: 'DT', background: 'linear-gradient(135deg, #be185d, #ec4899)', color: '#fdf2f8' },
}

const SYMBOL_DOMAINS: Record<string, string> = {
  AAPL: 'apple.com',
  MSFT: 'microsoft.com',
  NVDA: 'nvidia.com',
  AMZN: 'amazon.com',
  GOOGL: 'google.com',
  GOOG: 'google.com',
  META: 'meta.com',
  TSLA: 'tesla.com',
  AMD: 'amd.com',
  NFLX: 'netflix.com',
  INTC: 'intel.com',
  JPM: 'jpmorgan.com',
  BAC: 'bankofamerica.com',
  V: 'visa.com',
  MA: 'mastercard.com',
  WMT: 'walmart.com',
  DIS: 'thewaltdisneycompany.com',
  KO: 'coca-colacompany.com',
  PEP: 'pepsico.com',
  XOM: 'exxonmobil.com',
  CVX: 'chevron.com',
  SPY: 'ssga.com',
  DIA: 'ssga.com',
  QQQ: 'invesco.com',
  IWM: 'ishares.com',
  VOO: 'vanguard.com',
  VTI: 'vanguard.com',
  XLK: 'ssga.com',
  XLF: 'ssga.com',
  XLV: 'ssga.com',
  XLE: 'ssga.com',
  SMH: 'vaneck.com',
  ARKK: 'ark-funds.com',
  TLT: 'ishares.com',
  GLD: 'spdrgoldshares.com',
  CRM: 'salesforce.com',
  ORCL: 'oracle.com',
  CSCO: 'cisco.com',
  ADBE: 'adobe.com',
  AVGO: 'broadcom.com',
  QCOM: 'qualcomm.com',
  TXN: 'ti.com',
  IBM: 'ibm.com',
  PYPL: 'paypal.com',
  UBER: 'uber.com',
  SQ: 'squareup.com',
  SPOT: 'spotify.com',
  ABNB: 'airbnb.com',
  SNAP: 'snapchat.com',
  PINS: 'pinterest.com',
  ROKU: 'roku.com',
  ZM: 'zoom.us',
  SHOP: 'shopify.com',
  COIN: 'coinbase.com',
  HOOD: 'robinhood.com',
  PLTR: 'palantir.com',
  NET: 'cloudflare.com',
  DDOG: 'datadoghq.com',
  RBLX: 'roblox.com',
  EA: 'ea.com',
  NKE: 'nike.com',
  SBUX: 'starbucks.com',
  MCD: 'mcdonalds.com',
  HD: 'homedepot.com',
  LOW: 'lowes.com',
  TGT: 'target.com',
  COST: 'costco.com',
  PG: 'pg.com',
  JNJ: 'jnj.com',
  PFE: 'pfizer.com',
  ABBV: 'abbvie.com',
  MRK: 'merck.com',
  LLY: 'lilly.com',
  UNH: 'unitedhealthgroup.com',
  GS: 'goldmansachs.com',
  MS: 'morganstanley.com',
  C: 'citigroup.com',
  WFC: 'wellsfargo.com',
  T: 'att.com',
  VZ: 'verizon.com',
  TMUS: 't-mobile.com',
  BA: 'boeing.com',
  GE: 'ge.com',
  CAT: 'caterpillar.com',
  DE: 'deere.com',
  F: 'ford.com',
  GM: 'gm.com',
  DAL: 'delta.com',
  UAL: 'united.com',
  LUV: 'southwest.com',
}

// CoinGecko image URLs for crypto symbols (direct links to known good images)
const CRYPTO_IMAGE_URLS: Record<string, string> = {
  'BTC/USD': 'https://assets.coingecko.com/coins/images/1/large.png',
  'ETH/USD': 'https://assets.coingecko.com/coins/images/279/large.png',
  'SOL/USD': 'https://assets.coingecko.com/coins/images/4128/large.png',
  'DOGE/USD': 'https://assets.coingecko.com/coins/images/5/large.png',
  'ADA/USD': 'https://assets.coingecko.com/coins/images/975/large.png',
  'XRP/USD': 'https://assets.coingecko.com/coins/images/44/large.png',
  'AVAX/USD': 'https://assets.coingecko.com/coins/images/9072/large.png',
  'LINK/USD': 'https://assets.coingecko.com/coins/images/877/large.png',
  'DOT/USD': 'https://assets.coingecko.com/coins/images/12171/large.png',
}

function getFaviconUrl(symbol: string): string | null {
  const domain = SYMBOL_DOMAINS[symbol]
  if (!domain) return null
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
}

function getCoinGeckoUrl(symbol: string): string | null {
  return CRYPTO_IMAGE_URLS[symbol] ?? null
}

function fallbackLabel(symbol: string) {
  return symbol.trim().toUpperCase().slice(0, 2) || 'MM'
}

export function MoverLogo({ name, symbol }: MoverLogoProps) {
  const normalizedSymbol = symbol.trim().toUpperCase()
  const mark = BRAND_MARKS[normalizedSymbol]
  const label = mark?.label ?? fallbackLabel(normalizedSymbol)

  // Determine source priority: CoinGecko first for crypto, then Google favicons
  const coinGeckoUrl = getCoinGeckoUrl(normalizedSymbol)
  const faviconUrl = getFaviconUrl(normalizedSymbol)

  // Try sources in order: CoinGecko (crypto), Google favicon (all)
  const primaryUrl = coinGeckoUrl || faviconUrl
  const fallbackUrl = coinGeckoUrl && faviconUrl ? faviconUrl : null

  const [primaryFailed, setPrimaryFailed] = useState(false)
  const [fallbackFailed, setFallbackFailed] = useState(false)

  const showPrimary = primaryUrl && !primaryFailed
  const showFallback = fallbackUrl && !fallbackFailed && primaryFailed

  if (showPrimary) {
    return (
      <span
        className="mover-logo mover-logo--image"
        title={name ?? normalizedSymbol}
      >
        <img
          alt={name ?? normalizedSymbol}
          className="mover-logo-img"
          onError={() => setPrimaryFailed(true)}
          src={primaryUrl}
        />
      </span>
    )
  }

  if (showFallback) {
    return (
      <span
        className="mover-logo mover-logo--image"
        title={name ?? normalizedSymbol}
      >
        <img
          alt={name ?? normalizedSymbol}
          className="mover-logo-img"
          onError={() => setFallbackFailed(true)}
          src={fallbackUrl}
        />
      </span>
    )
  }

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
