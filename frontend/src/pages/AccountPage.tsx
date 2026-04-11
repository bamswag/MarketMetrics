import type { UserOut } from '../lib/api'
import { formatDateTime } from '../lib/formatters'

type AccountPageProps = {
  currentUser: UserOut | null
}

export function AccountPage({ currentUser }: AccountPageProps) {
  return (
    <section className="profile-page page-section">
      <div className="profile-page-head">
        <div className="panel-header-copy">
          <p className="section-label">Account</p>
          <h1 className="profile-page-title">
            Keep the personal side of MarketMetrics close, clear, and easy to manage.
          </h1>
        </div>
        <p className="profile-page-copy">
          This is the natural home for identity details, sign-in information, and future profile
          controls.
        </p>
      </div>

      <div className="profile-grid">
        <article className="panel panel-wide profile-summary-panel">
          <div className="panel-header">
            <div className="panel-header-copy">
              <p className="section-label">Profile summary</p>
              <h2 className="panel-title">{currentUser?.displayName ?? 'Your account'}</h2>
            </div>
            <span className="panel-tag">Live user profile</span>
          </div>

          <div className="profile-detail-grid">
            <article className="metric-card metric-card--accent">
              <span className="metric-label">Display name</span>
              <strong className="metric-value">{currentUser?.displayName ?? '--'}</strong>
              <p>This is the name shown across the workspace header and dashboard.</p>
            </article>
            <article className="metric-card">
              <span className="metric-label">Email address</span>
              <strong className="metric-value profile-detail-value">
                {currentUser?.email ?? '--'}
              </strong>
              <p>The primary sign-in address connected to your account.</p>
            </article>
            <article className="metric-card">
              <span className="metric-label">Member since</span>
              <strong className="metric-value">
                {currentUser?.createdAt ? formatDateTime(currentUser.createdAt) : '--'}
              </strong>
              <p>Your account creation timestamp from the backend profile record.</p>
            </article>
          </div>
        </article>

        <article className="panel profile-side-panel">
          <div className="panel-header-copy">
            <p className="section-label">Session details</p>
            <h2 className="panel-title">Authentication snapshot</h2>
          </div>

          <div className="list-shell">
            <div className="list-row">
              <div className="list-row-meta">
                <strong>Last login</strong>
                <p>
                  {currentUser?.lastLoginAt ? formatDateTime(currentUser.lastLoginAt) : 'Not recorded yet'}
                </p>
              </div>
            </div>
            <div className="list-row">
              <div className="list-row-meta">
                <strong>User ID</strong>
                <p className="profile-code">{currentUser?.userID ?? '--'}</p>
              </div>
            </div>
          </div>
        </article>

        <article className="panel profile-full-panel">
          <div className="panel-header">
            <div className="panel-header-copy">
              <p className="section-label">Next step</p>
              <h2 className="panel-title">Good place for editable profile controls later</h2>
            </div>
            <span className="neutral-pill">Scaffold ready</span>
          </div>

          <p className="panel-note">
            We can expand this page next with profile photo upload, preferred currency, timezone,
            experience level, and risk preferences without crowding the main dashboard.
          </p>
        </article>
      </div>
    </section>
  )
}
