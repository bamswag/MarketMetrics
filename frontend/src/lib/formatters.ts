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

export function formatCurrency(value?: number | null) {
  if (value === null || value === undefined) {
    return '--'
  }

  return buildCurrencyFormatter().format(value)
}

export function formatShortDate(value: string) {
  return buildShortDateFormatter().format(new Date(`${value}T00:00:00`))
}

export function formatLongDate(value: string) {
  return buildLongDateFormatter().format(new Date(`${value}T00:00:00`))
}

export function formatDateTime(value?: string | null) {
  if (!value) {
    return 'Not triggered yet'
  }

  return new Date(value).toLocaleString()
}
