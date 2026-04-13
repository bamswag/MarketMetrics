import { useState } from 'react'

import type { UserOut } from '../lib/api'
import '../styles/pages/ProfilePages.css'

type SettingsPageProps = {
  currentUser: UserOut | null
  onUpdateEmailNotifications?: (enabled: boolean) => Promise<void>
}

const SETTING_GROUPS = [
  {
    title: 'Appearance',
    description: 'Theme mode, density, chart defaults, and dashboard layout choices.',
  },
  {
    title: 'Market preferences',
    description: 'Preferred currency, default chart range, and instrument-view behavior.',
  },
]

export function SettingsPage({ currentUser, onUpdateEmailNotifications }: SettingsPageProps) {
  const [isTogglingEmail, setIsTogglingEmail] = useState(false)
  const [emailToggleError, setEmailToggleError] = useState('')

  const emailEnabled = currentUser?.emailNotificationsEnabled ?? false

  async function handleToggleEmailNotifications() {
    if (!onUpdateEmailNotifications || isTogglingEmail) return

    setIsTogglingEmail(true)
    setEmailToggleError('')

    try {
      await onUpdateEmailNotifications(!emailEnabled)
    } catch (error) {
      setEmailToggleError(
        error instanceof Error ? error.message : 'Unable to update email preference.',
      )
    } finally {
      setIsTogglingEmail(false)
    }
  }

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
          Manage notification delivery, appearance, and market preferences from one place.
        </p>
      </div>

      <div className="profile-grid">
        {/* Email notifications panel */}
        <article className="panel panel-wide">
          <div className="panel-header">
            <div className="panel-header-copy">
              <p className="section-label">Notifications</p>
              <h2 className="panel-title">Alert delivery channels</h2>
            </div>
            <span className="panel-tag">
              {emailEnabled ? 'Email on' : 'Email off'}
            </span>
          </div>

          <div className="settings-notification-row">
            <div className="settings-notification-info">
              <strong>Email notifications</strong>
              <p>
                Receive an email when any of your price alerts trigger. Uses the email address
                associated with your account ({currentUser?.email ?? '...'}).
              </p>
              {emailToggleError ? <p className="error-text">{emailToggleError}</p> : null}
            </div>

            <button
              className={emailEnabled ? 'ghost-action settings-toggle-btn' : 'primary-action settings-toggle-btn'}
              disabled={isTogglingEmail}
              onClick={() => void handleToggleEmailNotifications()}
              type="button"
            >
              {isTogglingEmail
                ? 'Saving...'
                : emailEnabled
                  ? 'Disable'
                  : 'Enable'}
            </button>
          </div>
        </article>

        {/* Future setting groups */}
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
