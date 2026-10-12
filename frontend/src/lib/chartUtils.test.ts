import { describe, expect, test } from 'vitest'

import {
  buildFiveTickScale,
  buildTimeTicks,
  formatAxisNumber,
  responsiveTimeTickCount,
  sampleChartSeries,
  sampleSeriesByValues,
  summarizeChartRange,
} from './chartUtils.ts'

describe('shared chart utilities', () => {
test('five-tick scale contains the complete range with equal nice intervals', () => {
  const scale = buildFiveTickScale([43.4, 50.65])
  expect(scale.ticks).toHaveLength(5)
  expect(scale.ticks[0]).toBeLessThanOrEqual(43.4)
  expect(scale.ticks[4]).toBeGreaterThanOrEqual(50.65)
  expect([1, 2.5, 5]).toContain(Number((scale.step / 10 ** Math.floor(Math.log10(scale.step))).toPrecision(4)))
  for (let index = 1; index < scale.ticks.length; index += 1) {
    expect(Math.abs((scale.ticks[index] - scale.ticks[index - 1]) - scale.step)).toBeLessThan(scale.step * 1e-8)
  }
})

test('lower tick ends in zero or five at the active precision', () => {
  for (const values of [[0.021, 0.116], [43.4, 50.65], [1_123, 1_984]]) {
    const scale = buildFiveTickScale(values)
    const precision = Math.max(0, -Math.floor(Math.log10(scale.step)) + 1)
    const finalDigit = Math.round(Math.abs(scale.ticks[0]) * 10 ** precision) % 10
    expect([0, 5]).toContain(finalDigit)
  }
})

test('flat, negative, empty, and tiny inputs remain finite and distinct', () => {
  for (const values of [[], [5, 5, 5], [-2, -1], [0.000021, 0.000024]]) {
    const scale = buildFiveTickScale(values)
    expect(scale.ticks).toHaveLength(5)
    expect(new Set(scale.ticks).size).toBe(5)
    expect(scale.ticks.every(Number.isFinite)).toBe(true)
    expect(new Set(scale.ticks.map((value) => formatAxisNumber(value, scale.step))).size).toBe(5)
  }
})

test('range summary reproduces the VZ close-price regression', () => {
  const summary = summarizeChartRange([
    { close: 43.4 },
    { close: 50.65 },
    { close: 41.65 },
  ])
  expect(summary?.high).toBe(50.65)
  expect(summary?.high).not.toBe(43.4)
  expect(summary?.low).toBe(41.65)
})

test('min/max bucket sampling preserves endpoints and global extrema', () => {
  const series = Array.from({ length: 100 }, (_, index) => ({
    date: `2026-01-${String(index + 1).padStart(3, '0')}`,
    close: index === 37 ? 500 : index === 71 ? -50 : 100 + index / 10,
  }))
  const sampled = sampleChartSeries(series, 20)
  expect(sampled.length).toBeLessThanOrEqual(20)
  expect(sampled[0]).toBe(series[0])
  expect(sampled.at(-1)).toBe(series.at(-1))
  expect(sampled.some((point) => point.close === 500)).toBe(true)
  expect(sampled.some((point) => point.close === -50)).toBe(true)
})

test('multi-series sampling preserves confidence-bound extrema', () => {
  const series = Array.from({ length: 300 }, (_, index) => ({
    date: `2026-${String(Math.floor(index / 28) + 1).padStart(2, '0')}-${String((index % 28) + 1).padStart(2, '0')}`,
    lower: index === 123 ? 1 : 50 + index,
    median: 100 + index,
    upper: index === 211 ? 10_000 : 150 + index,
  }))
  const sampled = sampleSeriesByValues(series, 40, (point) => [point.lower, point.median, point.upper])
  expect(sampled.some((point) => point.lower === 1)).toBe(true)
  expect(sampled.some((point) => point.upper === 10_000)).toBe(true)
  expect(sampled.length).toBeLessThanOrEqual(40)
})

test('time ticks are responsive and evenly distributed over elapsed time', () => {
  const series = [
    { date: '2026-01-01' },
    { date: '2026-01-03' },
    { date: '2026-01-12' },
    { date: '2026-02-20' },
    { date: '2026-03-01' },
    { date: '2026-04-15' },
    { date: '2026-05-01' },
  ]
  const mobile = buildTimeTicks(series, 390)
  const desktop = buildTimeTicks(series, 1440)
  expect(responsiveTimeTickCount(320)).toBe(3)
  expect(responsiveTimeTickCount(768)).toBeGreaterThanOrEqual(4)
  expect(responsiveTimeTickCount(1024)).toBeGreaterThanOrEqual(4)
  expect(responsiveTimeTickCount(1024)).toBeLessThanOrEqual(6)
  expect(mobile).toHaveLength(responsiveTimeTickCount(390))
  expect(desktop).toHaveLength(responsiveTimeTickCount(1440))
  expect(mobile[0]).toBe(Date.parse('2026-01-01T00:00:00Z'))
  expect(mobile.at(-1)).toBe(Date.parse('2026-05-01T00:00:00Z'))
})
})
