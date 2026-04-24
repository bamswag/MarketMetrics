import { Link } from 'react-router-dom'

import '../styles/pages/GuidesPage.css'

const CATEGORY_CARDS = [
  {
    href: '#investing-basics',
    label: '01',
    title: 'Investing basics',
    description: 'Learn the language behind stocks, ETFs, crypto, prices, liquidity, and volatility.',
  },
  {
    href: '#strategies-risk',
    label: '02',
    title: 'Strategies and risk',
    description: 'Understand watchlists, time horizons, diversification, and why risk tolerance matters.',
  },
  {
    href: '#performance-metrics',
    label: '03',
    title: 'Performance metrics',
    description: 'Read percent change, returns, MAE, volatility, drawdown, and expected ranges with more confidence.',
  },
  {
    href: '#marketmetrics-features',
    label: '04',
    title: 'MarketMetrics features',
    description: 'See how search, charts, movers, tracked symbols, alerts, and similar instruments fit together.',
  },
  {
    href: '#forecasts-projections',
    label: '05',
    title: 'Forecasts and projections',
    description: 'Separate short-term forecasts from long-term scenarios and Monte Carlo ranges.',
  },
  {
    href: '#responsible-use',
    label: '06',
    title: 'Responsible use',
    description: 'Learn how to treat app outputs as research context, not buy or sell instructions.',
  },
]

const GUIDE_SECTIONS = [
  {
    id: 'investing-basics',
    label: '01',
    kicker: 'Investing basics',
    title: 'The market terms you see every day',
    lead:
      'MarketMetrics works with stocks, ETFs, and crypto. A stock is ownership in one company, an ETF is a basket of investments, and crypto is a digital asset that often trades around the clock.',
    body:
      'Price movement shows what buyers and sellers are willing to accept over time. Liquidity describes how easy it is to trade without moving the price too much. Volatility describes how wide or sudden those moves can be.',
    chips: ['Stocks', 'ETFs', 'Crypto', 'Volatility', 'Liquidity'],
    callout:
      'Beginner tip: a bigger move is not automatically a better opportunity. Always ask what changed, how liquid the instrument is, and whether the move fits your time horizon.',
  },
  {
    id: 'strategies-risk',
    label: '02',
    kicker: 'Strategies and risk',
    title: 'Build a view before you chase a move',
    lead:
      'A strategy is simply a repeatable way to decide what you will watch, when you will act, and how much uncertainty you can accept. It does not have to be complicated to be useful.',
    body:
      'Watchlists help you focus on a smaller set of instruments. Diversification spreads risk across different names or asset types. Time horizon matters because a short-term chart signal can mean something very different from a long-term investment idea.',
    chips: ['Watchlists', 'Diversification', 'Time horizon', 'Risk tolerance'],
    callout:
      'MarketMetrics can organize signals, but it cannot know your savings needs, personal obligations, or emotional comfort with losses.',
  },
  {
    id: 'performance-metrics',
    label: '03',
    kicker: 'Performance metrics',
    title: 'Read results without getting lost in numbers',
    lead:
      'Percent change tells you how much a price moved relative to where it started. Returns describe gain or loss over a period. Drawdown shows how far an instrument fell from a previous high.',
    body:
      'MAE, or Mean Absolute Error, tells you the average size of a forecast miss in price terms. Volatility helps explain how uneven the path may be, while expected ranges show where outcomes may cluster instead of pretending there is only one possible result.',
    chips: ['Percent change', 'Returns', 'MAE', 'Volatility', 'Drawdown'],
    callout:
      'A good metric should make a result easier to question. If a number looks impressive, compare it with the risk, timeframe, and assumptions behind it.',
  },
  {
    id: 'marketmetrics-features',
    label: '04',
    kicker: 'MarketMetrics features',
    title: 'How the workspace turns data into context',
    lead:
      'Search takes you from a symbol or company name into an instrument page. Charts show recent history, movers highlight large daily changes, and tracked symbols keep your shortlist close.',
    body:
      'Alerts watch for price or percentage conditions and surface triggered events. Similar instruments help you compare related names. Together, these features keep the same symbol moving through research, tracking, and follow-up without making you restart the workflow.',
    chips: ['Search', 'Charts', 'Movers', 'Alerts', 'Similar instruments'],
    callout:
      'Feature output depends on market-data availability, market hours, supported asset type, and the freshness of provider data.',
  },
  {
    id: 'forecasts-projections',
    label: '05',
    kicker: 'Forecasts and projections',
    title: 'Short-term forecasts and long-term scenarios are different tools',
    lead:
      'Forecasts focus on the next few trading days. MarketMetrics uses a trained Random Forest model to compare historical price features and produce a short-term estimate with accuracy context.',
    body:
      'Long-term projection is a scenario tool. Fixed-rate projections show what could happen under steady growth assumptions, while Monte Carlo simulations create many possible paths to show a range of outcomes.',
    chips: ['Random Forest', 'MAE', 'Forecast horizon', 'Monte Carlo', 'Scenario range'],
    callout:
      'Forecasts and projections answer different questions. Do not compare them as if they came from the same method or promised the same level of certainty.',
  },
  {
    id: 'responsible-use',
    label: '06',
    kicker: 'Responsible use',
    title: 'Use the app as research context, not instruction',
    lead:
      'MarketMetrics is built to help you inspect market behavior, organize symbols, test scenarios, and understand model output. It is not a financial adviser and does not tell you what to buy or sell.',
    body:
      'The healthiest way to use the app is to compare multiple signals: price action, market context, your own research, risk tolerance, and time horizon. A forecast or alert can start a question, but it should not end the decision.',
    chips: ['Educational context', 'Not financial advice', 'Research workflow', 'Risk awareness'],
    callout:
      'When an output feels surprising, slow down and inspect the assumptions, the timeframe, and the data behind it before acting.',
  },
]

const METRIC_STRIPS = [
  { label: 'MAE', value: 'Average forecast miss' },
  { label: 'Range', value: 'Possible outcome band' },
  { label: 'Alert', value: 'Rule-based signal' },
]

export function GuidesPage() {
  return (
    <main className="guides-page">
      <section className="guides-hero page-section">
        <div className="guides-hero-copy">
          <p className="section-label">MarketMetrics Guide</p>
          <h1>Learn the ideas behind every chart, forecast, and alert.</h1>
          <p>
            Guides gives you plain-language explanations for investment concepts, performance
            metrics, and the MarketMetrics tools you use to read market behavior.
          </p>
        </div>

        <aside className="guides-hero-panel" aria-label="Guide highlights">
          <div className="guides-hero-panel-head">
            <span>Beginner path</span>
            <strong>Read in order or jump around</strong>
          </div>
          <div className="guides-hero-metrics">
            {METRIC_STRIPS.map((item) => (
              <div className="guides-hero-metric" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
          <p>
            The goal is not to memorize formulas. The goal is to understand what each result is
            trying to tell you, and where its limits are.
          </p>
        </aside>
      </section>

      <section className="guides-categories page-section" aria-label="Guide categories">
        {CATEGORY_CARDS.map((category) => (
          <a className="guides-category-card" href={category.href} key={category.href}>
            <span>{category.label}</span>
            <h2>{category.title}</h2>
            <p>{category.description}</p>
          </a>
        ))}
      </section>

      <section className="guides-content page-section" aria-label="Guide articles">
        {GUIDE_SECTIONS.map((section, index) => (
          <article
            className={`guides-article${index % 2 === 1 ? ' guides-article--reverse' : ''}`}
            id={section.id}
            key={section.id}
          >
            <div className="guides-article-copy">
              <p className="section-label">{section.kicker}</p>
              <h2>{section.title}</h2>
              <p>{section.lead}</p>
              <p>{section.body}</p>
            </div>

            <div className="guides-article-notes">
              <span className="guides-section-number">{section.label}</span>
              <div className="guides-chip-row">
                {section.chips.map((chip) => (
                  <span className="guides-chip" key={chip}>
                    {chip}
                  </span>
                ))}
              </div>
              <p>{section.callout}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="guides-footer-cta page-section">
        <div>
          <p className="section-label">Keep exploring</p>
          <h2>Use guides beside the tools, not instead of them.</h2>
          <p>
            Open a chart, run a forecast, compare similar instruments, then come back to Guides
            whenever a metric or model output needs clearer context.
          </p>
        </div>
        <div className="guides-footer-actions">
          <Link className="primary-action" to="/movers/gainers">
            View movers
          </Link>
          <Link className="ghost-action" to="/">
            Back home
          </Link>
        </div>
      </section>
    </main>
  )
}
