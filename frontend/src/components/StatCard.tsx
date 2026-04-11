type StatCardProps = {
  label: string
  value: string | number
  description: string
  accent?: boolean
}

export function StatCard({ label, value, description, accent = false }: StatCardProps) {
  return (
    <article className={accent ? 'metric-card metric-card--accent' : 'metric-card'}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <p>{description}</p>
    </article>
  )
}
