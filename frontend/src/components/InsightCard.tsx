import { Link } from 'react-router-dom'

import '../styles/components/InsightCard.css'

export type InsightCardId =
  | 'random-forest'
  | 'mae'
  | 'monte-carlo'
  | 'not-financial-advice'
  | 'forecast-vs-projection'
  | 'live-market-data'

type InsightCardContent = {
  body: string
  caveat: string
  ctaLabel: string
  ctaTo: string
  secondaryBody?: string
  title: string
  tone: 'teal' | 'blue' | 'amber' | 'rose' | 'indigo' | 'slate'
}

const INSIGHT_CARD_CONTENT: Record<InsightCardId, InsightCardContent> = {
  'random-forest': {
    title: 'How Random Forest shapes a forecast',
    body:
      'MarketMetrics uses a Random Forest model to compare many small decision trees trained on historical price features. The final forecast blends those trees so one noisy signal does not dominate the result.',
    caveat:
      'It can learn recurring patterns, but it cannot know tomorrow\'s news, earnings surprises, or sudden liquidity shocks.',
    ctaLabel: 'Run a sample forecast',
    ctaTo: '/forecast/AAPL',
    tone: 'amber',
  },
  mae: {
    title: 'What MAE means and why it matters',
    body:
      'MAE, or Mean Absolute Error, tells you the average size of the model\'s miss in price terms. It is useful because it turns model accuracy into something easier to compare than abstract scores.',
    caveat:
      'Lower MAE is better, but it is still a backward-looking measure and does not guarantee the next forecast will be right.',
    ctaLabel: 'View forecast metrics',
    ctaTo: '/forecast/AAPL',
    tone: 'blue',
  },
  'monte-carlo': {
    title: 'How Monte Carlo projection works',
    body:
      'The projection tool simulates many possible future paths using return and volatility assumptions. Instead of one neat answer, it shows a range of outcomes so upside, downside, and uncertainty are visible together.',
    caveat:
      'Those paths are scenarios, not promises. Changing assumptions can meaningfully change the result.',
    ctaLabel: 'Open projection tool',
    ctaTo: '/instrument/AAPL/project',
    tone: 'amber',
  },
  'not-financial-advice': {
    title: 'Why forecasts are not financial advice',
    body:
      'Forecasts and projections are designed to support market research, not to tell you what to buy or sell. They combine historical data, assumptions, and model output into context you can question.',
    caveat:
      'Always treat outputs as educational signals and compare them with your own research, risk tolerance, and goals.',
    ctaLabel: 'Read the terms',
    ctaTo: '/terms',
    tone: 'teal',
  },
  'forecast-vs-projection': {
    title: 'Forecasting vs long-term projection',
    body:
      'Forecasting focuses on the next few trading days and uses a trained model. Long-term projection looks across years and tests investment assumptions through deterministic and Monte Carlo scenarios.',
    caveat:
      'They answer different questions, so their outputs should not be compared as if they came from the same method.',
    ctaLabel: 'Compare the tools',
    ctaTo: '/instrument/AAPL/project',
    tone: 'indigo',
  },
  'live-market-data': {
    title: 'How live market data moves through the app',
    body:
      'Alpaca market data powers quotes, charts, movers, and alert checks. The frontend reads that data through focused API helpers so the same symbol can move from search to chart to watchlist without changing context.',
    caveat:
      'Freshness can still depend on market hours, provider availability, and the data feed used for a symbol.',
    ctaLabel: 'Explore movers',
    ctaTo: '/movers/gainers',
    tone: 'slate',
  },
}

type InsightCardProps = {
  id: InsightCardId
}

export function InsightCard({ id }: InsightCardProps) {
  const card = INSIGHT_CARD_CONTENT[id]

  return (
    <article className={`insight-card insight-card--${card.tone}`}>
      <div className="insight-card-copy">
        <h2 className="insight-card-title">{card.title}</h2>
        <p className="insight-card-body">{card.body}</p>
        {card.secondaryBody ? <p className="insight-card-body">{card.secondaryBody}</p> : null}
        <p className="insight-card-caveat">{card.caveat}</p>
      </div>
      <Link className="insight-card-link" to={card.ctaTo}>
        {card.ctaLabel}
      </Link>
    </article>
  )
}
