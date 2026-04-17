import type { InstrumentRange } from './api'

export type MarketAssetCategory = 'stocks' | 'etfs' | 'crypto'
export type TrackedSymbolsSort = 'newest' | 'biggest_gain' | 'biggest_loss' | 'alphabetical'
export type PriceDisplayMode = 'percent' | 'change' | 'both'
export type MarketTimeDisplay = 'local' | 'exchange' | 'utc'
export type CurrencyPreference = 'USD' | 'GBP'
export type NumberFormatPreference = 'locale' | 'compact'

export type MarketPreferences = {
  preferredAssetClasses: MarketAssetCategory[]
  defaultChartRange: InstrumentRange
  trackedSymbolsSort: TrackedSymbolsSort
  priceDisplayMode: PriceDisplayMode
  marketTimeDisplay: MarketTimeDisplay
  currency: CurrencyPreference
  numberFormat: NumberFormatPreference
}

export const MARKET_ASSET_CATEGORY_ORDER: MarketAssetCategory[] = ['stocks', 'etfs', 'crypto']

export const DEFAULT_MARKET_PREFERENCES: MarketPreferences = {
  preferredAssetClasses: [...MARKET_ASSET_CATEGORY_ORDER],
  defaultChartRange: '6M',
  trackedSymbolsSort: 'newest',
  priceDisplayMode: 'both',
  marketTimeDisplay: 'local',
  currency: 'USD',
  numberFormat: 'locale',
}

export const MARKET_PREFERENCES_STORAGE_KEY = 'marketmetrics.marketPreferences'

function isInstrumentRange(value: unknown): value is InstrumentRange {
  return (
    value === '1M'
    || value === '3M'
    || value === '6M'
    || value === '1Y'
    || value === '5Y'
    || value === 'MAX'
  )
}

function isTrackedSymbolsSort(value: unknown): value is TrackedSymbolsSort {
  return (
    value === 'newest'
    || value === 'biggest_gain'
    || value === 'biggest_loss'
    || value === 'alphabetical'
  )
}

function isPriceDisplayMode(value: unknown): value is PriceDisplayMode {
  return value === 'percent' || value === 'change' || value === 'both'
}

function isMarketTimeDisplay(value: unknown): value is MarketTimeDisplay {
  return value === 'local' || value === 'exchange' || value === 'utc'
}

function normalizePreferredAssetClasses(value: unknown): MarketAssetCategory[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_MARKET_PREFERENCES.preferredAssetClasses]
  }

  const seen = new Set<MarketAssetCategory>()
  for (const entry of value) {
    if (
      (entry === 'stocks' || entry === 'etfs' || entry === 'crypto')
      && !seen.has(entry)
    ) {
      seen.add(entry)
    }
  }

  if (seen.size === 0) {
    return [...DEFAULT_MARKET_PREFERENCES.preferredAssetClasses]
  }

  return MARKET_ASSET_CATEGORY_ORDER.filter((category) => seen.has(category))
}

export function normalizeMarketPreferences(value: unknown): MarketPreferences {
  const rawValue =
    value && typeof value === 'object'
      ? (value as Partial<MarketPreferences>)
      : {}

  return {
    preferredAssetClasses: normalizePreferredAssetClasses(rawValue.preferredAssetClasses),
    defaultChartRange: isInstrumentRange(rawValue.defaultChartRange)
      ? rawValue.defaultChartRange
      : DEFAULT_MARKET_PREFERENCES.defaultChartRange,
    trackedSymbolsSort: isTrackedSymbolsSort(rawValue.trackedSymbolsSort)
      ? rawValue.trackedSymbolsSort
      : DEFAULT_MARKET_PREFERENCES.trackedSymbolsSort,
    priceDisplayMode: isPriceDisplayMode(rawValue.priceDisplayMode)
      ? rawValue.priceDisplayMode
      : DEFAULT_MARKET_PREFERENCES.priceDisplayMode,
    marketTimeDisplay: isMarketTimeDisplay(rawValue.marketTimeDisplay)
      ? rawValue.marketTimeDisplay
      : DEFAULT_MARKET_PREFERENCES.marketTimeDisplay,
    currency:
      rawValue.currency === 'USD' || rawValue.currency === 'GBP'
        ? rawValue.currency
        : DEFAULT_MARKET_PREFERENCES.currency,
    numberFormat:
      rawValue.numberFormat === 'locale' || rawValue.numberFormat === 'compact'
        ? rawValue.numberFormat
        : DEFAULT_MARKET_PREFERENCES.numberFormat,
  }
}

export function readStoredMarketPreferences(): MarketPreferences {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_MARKET_PREFERENCES }
  }

  try {
    const rawValue = window.localStorage.getItem(MARKET_PREFERENCES_STORAGE_KEY)
    if (!rawValue) {
      return { ...DEFAULT_MARKET_PREFERENCES }
    }

    return normalizeMarketPreferences(JSON.parse(rawValue))
  } catch {
    return { ...DEFAULT_MARKET_PREFERENCES }
  }
}

export function saveStoredMarketPreferences(preferences: MarketPreferences) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(
    MARKET_PREFERENCES_STORAGE_KEY,
    JSON.stringify(normalizeMarketPreferences(preferences)),
  )
}

export function isAssetCategoryEnabled(
  assetCategory: string | null | undefined,
  preferredAssetClasses: MarketAssetCategory[],
) {
  if (!assetCategory) {
    return true
  }

  return preferredAssetClasses.includes(assetCategory as MarketAssetCategory)
}

export function assetCategoryLabel(assetCategory: MarketAssetCategory) {
  switch (assetCategory) {
    case 'stocks':
      return 'Stocks'
    case 'etfs':
      return 'ETFs'
    case 'crypto':
      return 'Crypto'
  }
}

export function trackedSymbolsSortLabel(sort: TrackedSymbolsSort) {
  switch (sort) {
    case 'newest':
      return 'Newest'
    case 'biggest_gain':
      return 'Biggest gain'
    case 'biggest_loss':
      return 'Biggest loss'
    case 'alphabetical':
      return 'Alphabetical'
  }
}

export function priceDisplayModeLabel(mode: PriceDisplayMode) {
  switch (mode) {
    case 'percent':
      return '% move'
    case 'change':
      return 'Price change'
    case 'both':
      return 'Both'
  }
}

export function marketTimeDisplayLabel(mode: MarketTimeDisplay) {
  switch (mode) {
    case 'local':
      return 'Local time'
    case 'exchange':
      return 'Exchange time'
    case 'utc':
      return 'UTC'
  }
}
