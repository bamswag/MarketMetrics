import { readStoredMarketPreferences } from './marketPreferences'

function resolveLocale() {
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language
  }

  return 'en-US'
}

function currencySymbol(currency: string): string {
  return currency === 'GBP' ? '£' : '$'
}

/**
 * Custom compact formatter that prefers smaller units (k over M, M over B, etc.)
 * instead of browser localization rules that produce 0.2M for 200k
 */
function formatCompactCurrency(value: number, currency: string): string {
  const absValue = Math.abs(value)
  const sym = currencySymbol(currency)

  // Determine the appropriate scale
  let divisor = 1
  let suffix = ''

  if (absValue >= 1_000_000_000) {
    divisor = 1_000_000_000
    suffix = 'B'
  } else if (absValue >= 1_000_000) {
    divisor = 1_000_000
    suffix = 'M'
  } else if (absValue >= 1_000) {
    divisor = 1_000
    suffix = 'K'
  }

  const scaledValue = value / divisor

  // Format with 1 decimal place, then remove trailing zeros
  const formatted = scaledValue.toLocaleString(resolveLocale(), {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })

  return `${value < 0 ? '-' : ''}${sym}${formatted}${suffix}`
}

function buildCurrencyFormatter() {
  const preferences = readStoredMarketPreferences()
  const isCompact = preferences.numberFormat === 'compact'
  const currency = preferences.currency

  // For compact mode, use our custom formatter
  if (isCompact) {
    return {
      format: (value: number) => formatCompactCurrency(value, currency),
    }
  }

  // For standard mode, use Intl.NumberFormat with user's currency
  return new Intl.NumberFormat(resolveLocale(), {
    style: 'currency',
    currency: currency,
    maximumFractionDigits: 2,
  })
}

function buildShortDateFormatter() {
  return new Intl.DateTimeFormat(resolveLocale(), {
    month: 'short',
    day: 'numeric',
  })
}

function buildLongDateFormatter() {
  return new Intl.DateTimeFormat(resolveLocale(), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function buildTimeFormatter() {
  return new Intl.DateTimeFormat(resolveLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function parseFlexibleDate(value: string): Date {
  // Handles both "YYYY-MM-DD" and "YYYY-MM-DDTHH:MM:SS" (with or without timezone)
  return value.includes('T') ? new Date(value) : new Date(`${value}T00:00:00`)
}

export function formatCurrency(value?: number | null) {
  if (value === null || value === undefined) {
    return '--'
  }

  return buildCurrencyFormatter().format(value)
}

export function formatShortDate(value: string) {
  return buildShortDateFormatter().format(parseFlexibleDate(value))
}

export function formatLongDate(value: string) {
  return buildLongDateFormatter().format(parseFlexibleDate(value))
}

export function formatShortTime(value: string) {
  return buildTimeFormatter().format(parseFlexibleDate(value))
}

export function formatDateTime(value?: string | null) {
  if (!value) {
    return 'Not triggered yet'
  }

  return new Date(value).toLocaleString()
}
