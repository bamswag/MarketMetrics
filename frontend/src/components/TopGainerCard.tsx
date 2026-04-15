import { Link } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { MoverLogo } from './MoverLogo'
import type { Mover } from '../lib/api'
import { formatCurrency } from '../lib/formatters'

export function buildSparkline(price: number, changeAmount: number): { date: string; v: number }[] {
  const open = price - changeAmount
  const steps = [0, 0.15, 0.35, 0.55, 0.78, 1]
  const jitter = [0, 0.3, -0.2, 0.4, -0.1, 0]
  const today = new Date()
  return steps.map((t, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - (steps.length - 1 - i))
    return {
      date: d.toISOString().slice(0, 10),
      v: open + changeAmount * t + changeAmount * jitter[i] * 0.18,
    }
  })
}

export function formatChangePercent(raw: string | null | undefined): string {
  if (!raw) return '--'
  const trimmed = raw.replace('%', '').trim()
  const num = parseFloat(trimmed)
  if (Number.isNaN(num)) return raw
  return `+${num.toFixed(2)}%`
}

type TopGainerCardProps = {
  topGainer: Mover
  topGainerSeries: { date: string; close: number }[]
}

export function TopGainerCard({ topGainer, topGainerSeries }: TopGainerCardProps) {
  const chartData =
    topGainerSeries.length > 0
      ? topGainerSeries.map((p) => ({ date: p.date, v: p.close }))
      : topGainer.change_amount != null && topGainer.price != null
        ? buildSparkline(topGainer.price, topGainer.change_amount)
        : []

  const yValues = chartData.map((d) => d.v).filter((v) => isFinite(v))
  const yMin = yValues.length > 0 ? Math.min(...yValues) : 0
  const yMax = yValues.length > 0 ? Math.max(...yValues) : 100
  const yPad = (yMax - yMin) * 0.08 || 1
  const yDomain: [number, number] = [yMin - yPad, yMax + yPad]

  return (
    <>
      {topGainer.price != null && chartData.length > 0 ? (
        <div className="hero-gainer-chart">
          <ResponsiveContainer height={180} width="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,118,110,0.1)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#6b7280' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(d: string) => {
                  if (!d) return ''
                  return new Date(d).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
                }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={yDomain}
                orientation="right"
                tick={{ fontSize: 10, fill: '#6b7280' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) =>
                  `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                }
                width={56}
              />
              <Tooltip
                contentStyle={{
                  fontSize: '0.78rem',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  background: '#fff',
                }}
                formatter={(v: any) => [formatCurrency(v as number), 'Price']}
                labelFormatter={(label: any) => {
                  const labelStr = String(label ?? '')
                  if (!labelStr) return ''
                  return new Date(labelStr).toLocaleDateString('en-GB', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })
                }}
              />
              <Area
                dataKey="v"
                fill="#0f766e"
                fillOpacity={0.15}
                isAnimationActive={false}
                stroke="#0f766e"
                strokeWidth={2}
                type="monotone"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      <div className="hero-gainer-body">
        <MoverLogo name={topGainer.name} symbol={topGainer.symbol} />
        <div className="hero-gainer-info">
          <strong className="hero-gainer-symbol">{topGainer.symbol}</strong>
          <p className="hero-gainer-name">{topGainer.name ?? topGainer.symbol}</p>
        </div>
        <span className="hero-gainer-change">{formatChangePercent(topGainer.change_percent)}</span>
      </div>

      {topGainer.price != null ? (
        <div className="hero-gainer-price-row">
          <span className="hero-gainer-price-label">Current price</span>
          <strong className="hero-gainer-price">{formatCurrency(topGainer.price)}</strong>
        </div>
      ) : null}

      <Link
        className="hero-gainer-link"
        to={`/instrument/${encodeURIComponent(topGainer.symbol)}`}
      >
        View instrument &rarr;
      </Link>
    </>
  )
}
