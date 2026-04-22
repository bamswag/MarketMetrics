import type { MarketPreferences } from './marketPreferences'

type PriceChangePayload = {
  change?: number | null
  changePercent?: string | null
}

type MarketHoursPayload = {
  marketClose?: string | null
  marketOpen?: string | null
  timezone?: string | null
}

function resolveLocale() {
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language
  }

  return 'en-US'
}

/**
 * Custom compact formatter that prefers smaller units (k over M, M over B, etc.)
 * instead of browser localization rules that produce 0.2M for 200k
 */
function formatCompactNumber(value: number, currency: string): string {
  const absValue = Math.abs(value)

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
  const currencySymbol = currency === 'USD' ? '$' : '£'

  // Format with 1 decimal place, then remove trailing zeros
  const formatted = scaledValue.toLocaleString(resolveLocale(), {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })

  return `${value < 0 ? '-' : ''}${currencySymbol}${formatted}${suffix}`
}

function buildCurrencyFormatter(preferences: MarketPreferences) {
  const compact = preferences.numberFormat === 'compact'

  // For compact mode, return a custom formatter function
  if (compact) {
    return {
      format: (value: number) => formatCompactNumber(value, preferences.currency),
    }
  }

  // For standard mode, use Intl.NumberFormat
  return new Intl.NumberFormat(resolveLocale(), {
    style: 'currency',
    currency: preferences.currency,
    notation: 'standard',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })
}

function buildTimeFormatter(timeZone?: string) {
  return new Intl.DateTimeFormat(resolveLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  })
}

function getTimeZoneParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const partMap = new Map(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )

  return {
    year: Number(partMap.get('year') ?? '1970'),
    month: Number(partMap.get('month') ?? '1'),
    day: Number(partMap.get('day') ?? '1'),
    hour: Number(partMap.get('hour') ?? '0'),
    minute: Number(partMap.get('minute') ?? '0'),
    second: Number(partMap.get('second') ?? '0'),
  }
}

function getTimeZoneOffset(date: Date, timeZone: string) {
  const parts = getTimeZoneParts(date, timeZone)
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )

  return asUtc - date.getTime()
}

function zonedTimeToDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0))
  const timeZoneOffset = getTimeZoneOffset(utcGuess, timeZone)
  return new Date(utcGuess.getTime() - timeZoneOffset)
}

function formatSignedCurrency(value: number, preferences: MarketPreferences) {
  const formatter = buildCurrencyFormatter(preferences)
  const absoluteValue = formatter.format(Math.abs(value))
  return `${value >= 0 ? '+' : '-'}${absoluteValue}`
}

function formatMarketClockTime(
  timeValue: string,
  exchangeTimeZone: string,
  preferences: MarketPreferences,
) {
  const [rawHour, rawMinute] = timeValue.split(':')
  const hour = Number(rawHour)
  const minute = Number(rawMinute)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return timeValue
  }

  const currentDateParts = getTimeZoneParts(new Date(), exchangeTimeZone)
  const sourceDate = zonedTimeToDate(
    currentDateParts.year,
    currentDateParts.month,
    currentDateParts.day,
    hour,
    minute,
    exchangeTimeZone,
  )

  switch (preferences.marketTimeDisplay) {
    case 'exchange':
      return buildTimeFormatter(exchangeTimeZone).format(sourceDate)
    case 'utc':
      return buildTimeFormatter('UTC').format(sourceDate)
    default:
      return buildTimeFormatter().format(sourceDate)
  }
}

export function formatCurrencyWithPreferences(
  value: number | null | undefined,
  preferences: MarketPreferences,
) {
  if (value === null || value === undefined) {
    return '--'
  }

  return buildCurrencyFormatter(preferences).format(value)
}

export function formatPriceChangeWithPreferences(
  payload: PriceChangePayload,
  preferences: MarketPreferences,
) {
  const { change, changePercent } = payload
  const hasChange = change !== null && change !== undefined
  const hasChangePercent = Boolean(changePercent && changePercent !== '--')

  switch (preferences.priceDisplayMode) {
    case 'percent':
      return hasChangePercent ? changePercent : '--'
    case 'change':
      return hasChange ? formatSignedCurrency(change, preferences) : '--'
    case 'both':
      if (hasChange && hasChangePercent) {
        return `${formatSignedCurrency(change, preferences)} · ${changePercent}`
      }
      if (hasChange) {
        return formatSignedCurrency(change, preferences)
      }
      if (hasChangePercent) {
        return changePercent
      }
      return '--'
  }
}

export function formatMarketHoursWithPreferences(
  payload: MarketHoursPayload,
  preferences: MarketPreferences,
) {
  if (!payload.marketOpen || !payload.marketClose) {
    return null
  }

  const exchangeTimeZone = payload.timezone || 'UTC'
  const openTime = formatMarketClockTime(payload.marketOpen, exchangeTimeZone, preferences)
  const closeTime = formatMarketClockTime(payload.marketClose, exchangeTimeZone, preferences)
  const label =
    preferences.marketTimeDisplay === 'local'
      ? 'Local'
      : preferences.marketTimeDisplay === 'exchange'
        ? 'Exchange'
        : 'UTC'

  return `${openTime}-${closeTime} ${label}`
}
