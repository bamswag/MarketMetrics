import type { InstrumentDetailResponse, InstrumentRange } from './api'

export type ChartSeriesPoint = InstrumentDetailResponse['historicalSeries'][number]
export type ChartPointWithMovingAverages<T extends ChartSeriesPoint = ChartSeriesPoint> = T & { ma30: number; ma50: number }
export type FiveTickScale = { domain: [number, number]; ticks: [number, number, number, number, number]; step: number }
export type ChartRangeSummary = { first: number; latest: number; high: number; low: number; change: number; changePercent: number; pointCount: number }

const NICE_MULTIPLIERS = [1, 2.5, 5] as const

export function finiteNumbers(values: Array<number | null | undefined>): number[] {
  return values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
}

function decimalPlacesForStep(step: number): number {
  if (!Number.isFinite(step) || step === 0) return 0
  return Math.max(0, Math.min(10, -Math.floor(Math.log10(Math.abs(step))) + 1))
}

function cleanNumber(value: number, step: number): number {
  return Number(value.toFixed(decimalPlacesForStep(step) + 2))
}

function lowerTickEndsInZeroOrFive(value: number, step: number): boolean {
  const precision = decimalPlacesForStep(step)
  return Math.round(Math.abs(value) * 10 ** precision) % 5 === 0
}

/** Build a stable five-tick scale whose lower label ends in 0/5 at its active precision. */
export function buildFiveTickScale(rawValues: Array<number | null | undefined>): FiveTickScale {
  const values = finiteNumbers(rawValues)
  if (values.length === 0) return { domain: [0, 10], ticks: [0, 2.5, 5, 7.5, 10], step: 2.5 }

  let minimum = Math.min(...values)
  let maximum = Math.max(...values)
  if (minimum === maximum) {
    const padding = Math.max(Math.abs(minimum) * 0.04, 0.0001)
    minimum -= padding
    maximum += padding
  }

  const rawStep = (maximum - minimum) / 4
  const baseExponent = Math.floor(Math.log10(Math.max(rawStep, Number.MIN_VALUE))) - 1
  for (let exponent = baseExponent; exponent <= baseExponent + 8; exponent += 1) {
    const magnitude = 10 ** exponent
    let best: FiveTickScale | null = null
    let bestScore = Number.POSITIVE_INFINITY
    for (const multiplier of NICE_MULTIPLIERS) {
      const step = multiplier * magnitude
      if (step * 4 + step * 1e-9 < maximum - minimum) continue
      const lowestMultiple = Math.ceil((maximum - 4 * step) / step - 1e-10)
      const highestMultiple = Math.floor(minimum / step + 1e-10)
      for (let multiple = lowestMultiple; multiple <= highestMultiple; multiple += 1) {
        const lower = cleanNumber(multiple * step, step)
        if (!lowerTickEndsInZeroOrFive(lower, step)) continue
        const ticks = [0, 1, 2, 3, 4].map((index) => cleanNumber(lower + index * step, step)) as FiveTickScale['ticks']
        const upper = ticks[4]
        if (lower > minimum + step * 1e-8 || upper < maximum - step * 1e-8) continue
        const lowerSlack = minimum - lower
        const upperSlack = upper - maximum
        const score = lowerSlack + upperSlack + Math.abs(lowerSlack - upperSlack) * 1e-6
        if (score < bestScore) {
          bestScore = score
          best = { domain: [lower, upper], ticks, step }
        }
      }
    }
    if (best) return best
  }

  const step = Math.max(rawStep, 1)
  const lower = Math.floor(minimum / step) * step
  const ticks = [0, 1, 2, 3, 4].map((index) => cleanNumber(lower + index * step, step)) as FiveTickScale['ticks']
  return { domain: [ticks[0], ticks[4]], ticks, step }
}

export function formatAxisNumber(value: number, step: number, unit: 'currency' | 'percent' | 'number' = 'currency', currencySymbol = '$'): string {
  if (!Number.isFinite(value)) return '--'
  const absStep = Math.abs(step)
  const decimals = absStep >= 1 ? (absStep % 1 === 0 ? 0 : 1) : Math.min(8, Math.max(2, Math.ceil(-Math.log10(absStep)) + 1))
  const prefix = unit === 'currency' ? currencySymbol : ''
  const suffix = unit === 'percent' ? '%' : ''
  const absValue = Math.abs(value)
  if (unit !== 'percent' && absValue >= 1_000_000_000) return `${prefix}${(value / 1_000_000_000).toFixed(1)}B${suffix}`
  if (unit !== 'percent' && absValue >= 1_000_000) return `${prefix}${(value / 1_000_000).toFixed(1)}M${suffix}`
  if (unit !== 'percent' && absValue >= 10_000) return `${prefix}${(value / 1_000).toFixed(absStep >= 1_000 ? 0 : 1)}K${suffix}`
  return `${prefix}${value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`
}

export function parseChartTimestamp(value: string): number {
  const timestamp = Date.parse(value.includes('T') ? value : `${value}T00:00:00Z`)
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function responsiveTimeTickCount(width: number): number {
  if (width <= 480) return 3
  if (width <= 768) return 4
  if (width <= 1100) return 5
  return 7
}

export function buildTimeTicks<T extends { date: string }>(series: T[], width = 1440): number[] {
  const timestamps = [...new Set(series.map((point) => parseChartTimestamp(point.date)).filter((value) => value > 0))].sort((a, b) => a - b)
  if (timestamps.length <= 1) return timestamps
  const count = Math.min(responsiveTimeTickCount(width), timestamps.length)
  const start = timestamps[0]
  const end = timestamps[timestamps.length - 1]
  return Array.from({ length: count }, (_, index) => Math.round(start + ((end - start) * index) / Math.max(1, count - 1)))
}

export function summarizeChartRange<T extends { close: number }>(series: T[]): ChartRangeSummary | null {
  const closes = finiteNumbers(series.map((point) => point.close))
  if (closes.length === 0) return null
  const first = closes[0]
  const latest = closes[closes.length - 1]
  const change = latest - first
  return { first, latest, high: Math.max(...closes), low: Math.min(...closes), change, changePercent: first !== 0 ? (change / first) * 100 : 0, pointCount: closes.length }
}

export function getMaxChartPoints(selectedRange: InstrumentRange): number {
  if (selectedRange === 'MAX') return 320
  if (selectedRange === '5Y') return 260
  if (selectedRange === '1Y') return 220
  if (selectedRange === '1W') return 10
  return 180
}

/** Min/max bucket sampling keeps endpoints and important extrema in every bucket. */
export function sampleSeriesByValues<T extends { date: string }>(
  series: T[],
  maxPoints: number,
  valuesForPoint: (point: T) => Array<number | null | undefined>,
): T[] {
  if (series.length <= maxPoints) return series
  if (maxPoints < 4) return [series[0], series[series.length - 1]].slice(0, maxPoints)
  const output: T[] = [series[0]]
  const interior = series.slice(1, -1)
  const bucketCount = Math.max(1, Math.floor((maxPoints - 2) / 2))
  const bucketSize = interior.length / bucketCount
  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = Math.floor(bucket * bucketSize)
    const end = Math.min(interior.length, Math.max(start + 1, Math.floor((bucket + 1) * bucketSize)))
    const points = interior.slice(start, end)
    if (points.length === 0) continue
    let minimum = points[0]
    let maximum = points[0]
    let minimumValue = Math.min(...finiteNumbers(valuesForPoint(minimum)))
    let maximumValue = Math.max(...finiteNumbers(valuesForPoint(maximum)))
    for (const point of points.slice(1)) {
      const values = finiteNumbers(valuesForPoint(point))
      if (values.length === 0) continue
      const pointMinimum = Math.min(...values)
      const pointMaximum = Math.max(...values)
      if (pointMinimum < minimumValue) {
        minimum = point
        minimumValue = pointMinimum
      }
      if (pointMaximum > maximumValue) {
        maximum = point
        maximumValue = pointMaximum
      }
    }
    const ordered = minimum.date <= maximum.date ? [minimum, maximum] : [maximum, minimum]
    for (const point of ordered) {
      if (output.length < maxPoints - 1 && output[output.length - 1]?.date !== point.date) output.push(point)
    }
  }
  const last = series[series.length - 1]
  if (output[output.length - 1]?.date !== last.date) output.push(last)
  return output
}

export function sampleChartSeries<T extends ChartSeriesPoint>(series: T[], maxPoints: number): T[] {
  return sampleSeriesByValues(series, maxPoints, (point) => [point.close])
}

export function simpleMovingAverage(series: Array<{ close: number }>, endIndex: number, windowSize: number): number {
  const window = series.slice(Math.max(0, endIndex + 1 - windowSize), endIndex + 1)
  return window.length > 0 ? window.reduce((sum, point) => sum + point.close, 0) / window.length : 0
}

export function addSimpleMovingAverages<T extends ChartSeriesPoint>(series: T[]): Array<ChartPointWithMovingAverages<T>> {
  return series.map((point, index) => ({ ...point, ma30: simpleMovingAverage(series, index, 30), ma50: simpleMovingAverage(series, index, 50) }))
}
