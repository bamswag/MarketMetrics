import { RiskProfileBadge } from './RiskProfileQuiz'
import { FeaturedMoverCard } from './FeaturedMoverCard'
import type { RiskProfile } from '../lib/api'

type DashboardHeroProps = {
  displayName?: string
  riskProfile?: RiskProfile | null
  onStartRiskQuiz?: () => void
  onRetakeRiskQuiz?: () => void
}

export function DashboardHero({
  displayName,
  riskProfile,
  onStartRiskQuiz,
  onRetakeRiskQuiz,
}: DashboardHeroProps) {
  return (
    <section className="dashboard-hero page-section">
      <article className="dashboard-hero-card">
        <div className="dashboard-hero-copy">
          <h1 className="dashboard-heading">
            {displayName ? `Welcome back, ${displayName}.` : 'Your market overview'}
          </h1>
          <div className="dashboard-hero-intro-stack">
            <p className="dashboard-hero-intro">
              MarketMetrics brings forecasts, projections, alerts, movers, and live market context into one workspace so you can scan the market faster and make sharper decisions with less friction.
            </p>
            <p className="dashboard-hero-intro">
              You can move from search to charts, forecasts, projections, and alert setup without losing context, which makes it easier to compare short-term signals with longer-term scenarios in one place.
            </p>
            <p className="dashboard-hero-intro">
              Whether you are tracking a focused shortlist or watching for broader market momentum, MarketMetrics helps you stay organized with timely visibility, cleaner workflows, and decision support that stays readable.
            </p>
          </div>

          {riskProfile ? (
            <div className="dashboard-risk-strip">
              <RiskProfileBadge profile={riskProfile} onRetake={onRetakeRiskQuiz} />
            </div>
          ) : onStartRiskQuiz ? (
            <div className="dashboard-risk-prompt">
              <p className="dashboard-risk-prompt-text">
                <strong>Personalise your experience</strong> — take a 4-question quiz to set your investor risk profile and unlock tailored insights.
              </p>
              <button className="ghost-action dashboard-risk-quiz-btn" onClick={onStartRiskQuiz} type="button">
                Set my risk profile
              </button>
            </div>
          ) : null}
        </div>
      </article>

      <article className="display-card dashboard-hero-feature-card">
        <FeaturedMoverCard />
      </article>
    </section>
  )
}
