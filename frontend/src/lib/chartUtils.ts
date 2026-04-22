import type { InstrumentDetailResponse, InstrumentRange } from './api'

export type ChartSeriesPoint = InstrumentDetailResponse['historicalSeries'][number]

export type ChartPointWithMovingAverages<T extends ChartSeriesPoint = ChartSeriesPoint> = T & {
  ma30: number
  ma50: number
}

export function getMaxChartPoints(selectedRange: InstrumentRange): number {
  if (selectedRange === 'MAX') {
    return 320
  }

  if (selectedRange === '5Y') {
    return 260
  }

  if (selectedRange === '1Y') {
    return 220
  }

  if (selectedRange === '1W') {
    return 10
  }

  return 180
}

export function sampleChartSeries<T extends ChartSeriesPoint>(
  series: T[],
  maxPoints: number,
): T[] {
  if (series.length <= maxPoints) {
    return series
  }

  const sampled: T[] = []
  const step = (series.length - 1) / (maxPoints - 1)

  for (let index = 0; index < maxPoints; index += 1) {
    const sourceIndex = Math.round(index * step)
    const point = series[sourceIndex]
    if (point && sampled[sampled.length - 1]?.date !== point.date) {
      sampled.push(point)
    }
  }

  const lastPoint = series[series.length - 1]
  if (lastPoint && sampled[sampled.length - 1]?.date !== lastPoint.date) {
    sampled.push(lastPoint)
  }

  return sampled
}

export function simpleMovingAverage(
  series: Array<{ close: number }>,
  endIndex: number,
  windowSize: number,
): number {
  const windowStart = Math.max(0, endIndex + 1 - windowSize)
  const window = series.slice(windowStart, endIndex + 1)
  const total = window.reduce((sum, point) => sum + point.close, 0)
  return window.length > 0 ? total / window.length : 0
}

export function addSimpleMovingAverages<T extends ChartSeriesPoint>(
  series: T[],
): Array<ChartPointWithMovingAverages<T>> {
  return series.map((point, index) => ({
    ...point,
    ma30: simpleMovingAverage(series, index, 30),
    ma50: simpleMovingAverage(series, index, 50),
  }))
}
