import type { InstrumentDetailResponse, InstrumentRange } from './api'

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

  if (selectedRange === '1D') {
    return 200  // 15-min bars over a session — no sampling needed
  }

  return 180
}

export function sampleChartSeries(
  series: InstrumentDetailResponse['historicalSeries'],
  maxPoints: number,
) {
  if (series.length <= maxPoints) {
    return series
  }

  const sampled: InstrumentDetailResponse['historicalSeries'] = []
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
