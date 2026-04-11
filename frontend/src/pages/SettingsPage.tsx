import type { UserOut } from '../lib/api'

type SettingsPageProps = {
  currentUser: UserOut | null
}

const SETTING_GROUPS = [
  {
    title: 'Appearance',
    description: 'Theme mode, density, chart defaults, and dashboard layout choices.',
  },
  {
    title: 'Notifications',
    description: 'How alerts should surface across the app once notification controls are added.',
  },
  {
    title: 'Market preferences',
    description: 'Preferred currency, default chart range, and instrument-view behavior.',
  },
]

export function SettingsPage({ currentUser }: SettingsPageProps) {
  return (
    <section className="profile-page page-section">
      <div className="profile-page-head">
        <div className="panel-header-copy">
          <p className="section-label">Settings</p>
          <h1 className="profile-page-title">
            Shape the workspace around how {currentUser?.displayName ?? 'you'} actually use it.
          </h1>
        </div>
        <p className="profile-page-copy">
          This page gives the user-menu dropdown a real destination now, and a clean foundation for
          future preferences later.
        </p>
      </div>

      <div className="profile-grid">
        <article className="panel panel-wide">
          <div className="panel-header">
            <div className="panel-header-copy">
              <p className="section-label">Preference groups</p>
              <h2 className="panel-title">Natural settings categories for the next build pass</h2>
            </div>
            <span className="panel-tag">Prepared for expansion</span>
          </div>

          <div className="settings-card-grid">
            {SETTING_GROUPS.map((group) => (
              <article className="feature-card settings-card" key={group.title}>
                <h3 className="feature-card-heading">{group.title}</h3>
                <p className="feature-card-copy">{group.description}</p>
                <span className="neutral-pill">Coming soon</span>
              </article>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header-copy">
            <p className="section-label">Status</p>
            <h2 className="panel-title">Current account state</h2>
          </div>

          <div className="list-shell">
            <div className="list-row">
              <div className="list-row-meta">
                <strong>Signed in as</strong>
                <p>{currentUser?.email ?? 'Unknown user'}</p>
              </div>
              <span className="positive-pill">Active</span>
            </div>
            <div className="list-row">
              <div className="list-row-meta">
                <strong>Google login</strong>
                <p>Available from the authentication flow when configured.</p>
              </div>
              <span className="neutral-pill">Enabled</span>
            </div>
          </div>
        </article>
      </div>
    </section>
  )
}
