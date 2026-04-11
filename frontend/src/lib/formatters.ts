const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
})

const longDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

export function formatCurrency(value?: number | null) {
  if (value === null || value === undefined) {
    return '--'
  }

  return currencyFormatter.format(value)
}

export function formatShortDate(value: string) {
  return shortDateFormatter.format(new Date(`${value}T00:00:00`))
}

export function formatLongDate(value: string) {
  return longDateFormatter.format(new Date(`${value}T00:00:00`))
}

export function formatDateTime(value?: string | null) {
  if (!value) {
    return 'Not triggered yet'
  }

  return new Date(value).toLocaleString()
}
