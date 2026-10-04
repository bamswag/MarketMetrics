import { useEffect, useState } from 'react'

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
  NVDA: { label: 'NV', background: 'linear-gradient(135deg, var(--green-status), var(--green-status-bright))', color: 'var(--green-pale)' },
  AMZN: { label: 'AZ', background: 'linear-gradient(135deg, var(--red-amber), var(--red-bright))', color: 'var(--red-pale)' },
  GOOGL: { label: 'GO', background: 'linear-gradient(135deg, #2563eb, var(--red-red))', color: '#ffffff' },
  META: { label: 'ME', background: 'linear-gradient(135deg, #2563eb, #7c3aed)', color: '#eef2ff' },
  TSLA: { label: 'TS', background: 'linear-gradient(135deg, var(--red-red-deep), var(--red-red-bright))', color: 'var(--red-red-bg)' },
  AMD: { label: 'AM', background: 'linear-gradient(135deg, var(--green-deep), var(--green-status-bright))', color: 'var(--green-pale)' },
  NFLX: { label: 'NF', background: 'linear-gradient(135deg, var(--red-red-deepest), var(--red-red))', color: 'var(--red-red-bg)' },
  INTC: { label: 'IN', background: 'linear-gradient(135deg, #1d4ed8, #38bdf8)', color: '#eff6ff' },
  JPM: { label: 'JP', background: 'linear-gradient(135deg, #1e293b, #475569)', color: '#f8fafc' },
  BAC: { label: 'BA', background: 'linear-gradient(135deg, #1d4ed8, var(--red-red-bright))', color: '#ffffff' },
  V: { label: 'V', background: 'linear-gradient(135deg, #1d4ed8, #2563eb)', color: '#eff6ff' },
  MA: { label: 'MA', background: 'linear-gradient(135deg, var(--red-bright), var(--red-red-bright))', color: 'var(--red-pale)' },
  WMT: { label: 'WM', background: 'linear-gradient(135deg, #2563eb, var(--red-gold-light))', color: '#eff6ff' },
  DIS: { label: 'DI', background: 'linear-gradient(135deg, #2563eb, #0f172a)', color: '#eff6ff' },
  KO: { label: 'KO', background: 'linear-gradient(135deg, var(--red-red-dark), var(--red-red-bright))', color: 'var(--red-red-bg)' },
  PEP: { label: 'PP', background: 'linear-gradient(135deg, #1d4ed8, var(--red-red-bright))', color: '#ffffff' },
  XOM: { label: 'XO', background: 'linear-gradient(135deg, var(--red-red-dark), var(--red-bright))', color: 'var(--red-pale)' },
  CVX: { label: 'CV', background: 'linear-gradient(135deg, #1d4ed8, var(--green-cyan-bright))', color: '#ecfeff' },
  SPY: { label: 'SP', background: 'linear-gradient(135deg, var(--brand-green), var(--green-cyan))', color: 'var(--green-teal-pale)' },
  QQQ: { label: 'QQ', background: 'linear-gradient(135deg, #1d4ed8, #7c3aed)', color: '#eef2ff' },
  DIA: { label: 'DI', background: 'linear-gradient(135deg, #0f172a, #475569)', color: '#f8fafc' },
  IWM: { label: 'IW', background: 'linear-gradient(135deg, #2563eb, #0ea5e9)', color: '#eff6ff' },
  VOO: { label: 'VO', background: 'linear-gradient(135deg, var(--red-red-dark), var(--red-bright))', color: 'var(--red-pale)' },
  VTI: { label: 'VT', background: 'linear-gradient(135deg, var(--red-red-deep), var(--red-red-bright))', color: 'var(--red-red-bg)' },
  XLK: { label: 'XK', background: 'linear-gradient(135deg, var(--brand-green), var(--green-teal))', color: 'var(--green-teal-pale)' },
  XLF: { label: 'XF', background: 'linear-gradient(135deg, #1d4ed8, #38bdf8)', color: '#eff6ff' },
  XLV: { label: 'XV', background: 'linear-gradient(135deg, var(--green-status), var(--green-status-light))', color: 'var(--green-pale)' },
  XLE: { label: 'XE', background: 'linear-gradient(135deg, var(--red-dark), var(--red-amber))', color: 'var(--red-pale)' },
  SMH: { label: 'SM', background: 'linear-gradient(135deg, #4338ca, #8b5cf6)', color: '#f5f3ff' },
  ARKK: { label: 'AK', background: 'linear-gradient(135deg, #0f172a, #6366f1)', color: '#eef2ff' },
  TLT: { label: 'TL', background: 'linear-gradient(135deg, #334155, #64748b)', color: '#f8fafc' },
  GLD: { label: 'GD', background: 'linear-gradient(135deg, var(--red-gold), var(--red-gold-light))', color: 'var(--red-brown)' },
  'BTC/USD': { label: 'BT', background: 'linear-gradient(135deg, var(--red-amber), var(--red-bright))', color: 'var(--red-pale)' },
  'ETH/USD': { label: 'ET', background: 'linear-gradient(135deg, #334155, #6366f1)', color: '#eef2ff' },
  'SOL/USD': { label: 'SO', background: 'linear-gradient(135deg, #7c3aed, var(--green-teal))', color: '#f5f3ff' },
  'DOGE/USD': { label: 'DG', background: 'linear-gradient(135deg, var(--red-gold), var(--red-gold-light))', color: 'var(--red-brown)' },
  'ADA/USD': { label: 'AD', background: 'linear-gradient(135deg, #2563eb, #38bdf8)', color: '#eff6ff' },
  'XRP/USD': { label: 'XR', background: 'linear-gradient(135deg, #111827, #6b7280)', color: '#f9fafb' },
  'AVAX/USD': { label: 'AV', background: 'linear-gradient(135deg, var(--red-red-dark), var(--red-red-bright))', color: 'var(--red-red-bg)' },
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

// Map our symbol format (BTC/USD) to CoinGecko coin IDs
const COINGECKO_COIN_IDS: Record<string, string> = {
  'BTC/USD': 'bitcoin',
  'ETH/USD': 'ethereum',
  'SOL/USD': 'solana',
  'DOGE/USD': 'dogecoin',
  'ADA/USD': 'cardano',
  'XRP/USD': 'ripple',
  'AVAX/USD': 'avalanche-2',
  'LINK/USD': 'chainlink',
  'DOT/USD': 'polkadot',
}

// Cache for CoinGecko image URLs (symbol → image URL)
const cryptoImageCache = new Map<string, string | null>()

function getFaviconUrl(symbol: string): string | null {
  const domain = SYMBOL_DOMAINS[symbol]
  if (!domain) return null
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
}

async function fetchCoinGeckoImageUrl(symbol: string): Promise<string | null> {
  // Check cache first
  if (cryptoImageCache.has(symbol)) {
    return cryptoImageCache.get(symbol) ?? null
  }

  const coinId = COINGECKO_COIN_IDS[symbol]
  if (!coinId) {
    cryptoImageCache.set(symbol, null)
    return null
  }

  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false`
    )
    if (!response.ok) {
      cryptoImageCache.set(symbol, null)
      return null
    }

    const data = await response.json()
    const imageUrl = data.image?.large ?? null
    cryptoImageCache.set(symbol, imageUrl)
    return imageUrl
  } catch (error) {
    cryptoImageCache.set(symbol, null)
    return null
  }
}

function fallbackLabel(symbol: string) {
  return symbol.trim().toUpperCase().slice(0, 2) || 'MM'
}

export function MoverLogo({ name, symbol }: MoverLogoProps) {
  const normalizedSymbol = symbol.trim().toUpperCase()
  const mark = BRAND_MARKS[normalizedSymbol]
  const label = mark?.label ?? fallbackLabel(normalizedSymbol)

  // State for async CoinGecko fetch
  const [coinGeckoUrl, setCoinGeckoUrl] = useState<string | null>(
    cryptoImageCache.get(normalizedSymbol) ?? null
  )
  const faviconUrl = getFaviconUrl(normalizedSymbol)

  // Fetch CoinGecko image if symbol is a crypto pair
  useEffect(() => {
    // Skip if already cached (including null)
    if (cryptoImageCache.has(normalizedSymbol)) {
      return
    }

    let cancelled = false
    fetchCoinGeckoImageUrl(normalizedSymbol).then((url) => {
      if (!cancelled) {
        setCoinGeckoUrl(url)
      }
    })

    return () => {
      cancelled = true
    }
  }, [normalizedSymbol])

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
