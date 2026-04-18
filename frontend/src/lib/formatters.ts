function resolveLocale() {
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language
  }

  return 'en-US'
}

function buildCurrencyFormatter() {
  return new Intl.NumberFormat(resolveLocale(), {
    style: 'currency',
    currency: 'USD',
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
