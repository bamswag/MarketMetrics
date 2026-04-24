import { Link } from 'react-router-dom'
import { useState } from 'react'

import { RiskProfileBadge } from './RiskProfileQuiz'
import { FeaturedMoverCard } from './FeaturedMoverCard'
import type { FeaturedMoverDirection, RiskProfile } from '../lib/api'

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
  const [featuredMoverDirection, setFeaturedMoverDirection] =
    useState<FeaturedMoverDirection>('gainer')

  return (
    <section className="dashboard-hero page-section">
      <article className="dashboard-hero-card">
        <div className="dashboard-hero-copy">
          <h1 className="dashboard-heading">
            {displayName ? `Welcome back, ${displayName}.` : 'Your market overview'}
          </h1>

          <div className="dashboard-hero-briefing">
            <p className="dashboard-hero-intro">
              Your workspace is ready. Track your shortlist, compare live movers, review forecasts, and keep alerts close as the market changes.
            </p>
            <div className="dashboard-guides-strip">
              <div className="dashboard-guides-strip-copy">
                <span>Need context?</span>
                <p>Guides explain forecasts, projections, alerts, and market metrics in plain language.</p>
              </div>
              <Link className="dashboard-guides-strip-link" to="/guides">
                View Guides
              </Link>
            </div>
          </div>

          {riskProfile ? (
            <div className="dashboard-investor-lens">
              <p className="section-label">Investor lens</p>
              <RiskProfileBadge profile={riskProfile} onRetake={onRetakeRiskQuiz} />
            </div>
          ) : onStartRiskQuiz ? (
            <div className="dashboard-investor-lens dashboard-investor-lens--prompt">
              <p className="section-label">Investor lens</p>
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

      <article
        className={`display-card dashboard-hero-feature-card dashboard-hero-feature-card--${
          featuredMoverDirection === 'loser' ? 'negative' : 'positive'
        }`}
      >
        <FeaturedMoverCard onDirectionChange={setFeaturedMoverDirection} />
      </article>
    </section>
  )
}
