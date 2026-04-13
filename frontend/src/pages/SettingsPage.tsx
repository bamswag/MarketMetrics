import { useState } from 'react'

import { useMarketPreferences } from '../app/MarketPreferencesContext'
import type { UserOut } from '../lib/api'
import {
  assetCategoryLabel,
  marketTimeDisplayLabel,
  priceDisplayModeLabel,
  trackedSymbolsSortLabel,
  type CurrencyPreference,
  type MarketAssetCategory,
  type NumberFormatPreference,
} from '../lib/marketPreferences'
import '../styles/pages/ProfilePages.css'

type SettingsPageProps = {
  currentUser: UserOut | null
  onUpdateEmailNotifications?: (enabled: boolean) => Promise<void>
}

const ASSET_CATEGORY_OPTIONS: MarketAssetCategory[] = ['stocks', 'etfs', 'crypto']
const DEFAULT_CHART_RANGE_OPTIONS = ['1M', '3M', '6M', '1Y', '5Y'] as const
const TRACKED_SORT_OPTIONS = ['newest', 'biggest_gain', 'biggest_loss', 'alphabetical'] as const
const PRICE_DISPLAY_OPTIONS = ['percent', 'change', 'both'] as const
const MARKET_TIME_OPTIONS = ['local', 'exchange', 'utc'] as const

export function SettingsPage({ currentUser, onUpdateEmailNotifications }: SettingsPageProps) {
  const { preferences, togglePreferredAssetClass, updatePreferences } = useMarketPreferences()
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
    <section className="settings-page page-section">
      <div className="settings-page-header">
        <div>
          <p className="section-label">Settings</p>
          <h1 className="settings-page-title">Preferences</h1>
        </div>
        <p className="settings-page-subtitle">
          Manage notifications, market defaults, and display preferences.
        </p>
      </div>

      {/* Notifications */}
      <section className="settings-section">
        <div className="settings-section-header">
          <h2 className="settings-section-title">Notifications</h2>
          <span className={emailEnabled ? 'positive-pill' : 'neutral-pill'}>
            {emailEnabled ? 'Email on' : 'Email off'}
          </span>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <strong>Email notifications</strong>
            <p>
              Get an email when any of your price alerts trigger. Sent to{' '}
              {currentUser?.email ?? '...'}.
            </p>
            {emailToggleError ? <p className="error-text">{emailToggleError}</p> : null}
          </div>
          <button
            className={emailEnabled ? 'ghost-action settings-toggle-btn' : 'primary-action settings-toggle-btn'}
            disabled={isTogglingEmail}
            onClick={() => void handleToggleEmailNotifications()}
            type="button"
          >
            {isTogglingEmail ? 'Saving...' : emailEnabled ? 'Disable' : 'Enable'}
          </button>
        </div>
      </section>

      {/* Asset classes */}
      <section className="settings-section">
        <div className="settings-section-header">
          <h2 className="settings-section-title">Preferred asset classes</h2>
          <span className="neutral-pill">Saved locally</span>
        </div>
        <p className="settings-section-note">
          Search suggestions, daily movers, and dashboard widgets prioritize these asset types.
        </p>

        <div className="workspace-toggle-group">
          {ASSET_CATEGORY_OPTIONS.map((assetCategory) => {
            const isEnabled = preferences.preferredAssetClasses.includes(assetCategory)
            const isLocked = isEnabled && preferences.preferredAssetClasses.length === 1
            return (
              <button
                className={isEnabled ? 'workspace-toggle is-active' : 'workspace-toggle'}
                disabled={isLocked}
                key={assetCategory}
                onClick={() => togglePreferredAssetClass(assetCategory)}
                type="button"
              >
                {assetCategoryLabel(assetCategory)}
              </button>
            )
          })}
        </div>
      </section>

      {/* Market defaults */}
      <section className="settings-section">
        <div className="settings-section-header">
          <h2 className="settings-section-title">Market defaults</h2>
        </div>
        <p className="settings-section-note">
          These apply across the app on this device. You can still override per page.
        </p>

        <div className="settings-fields-grid">
          <label className="settings-field">
            <span className="settings-field-label">Default chart range</span>
            <select
              className="workspace-select"
              onChange={(event) =>
                updatePreferences({
                  defaultChartRange: event.target.value as '1M' | '3M' | '6M' | '1Y' | '5Y',
                })
              }
              value={preferences.defaultChartRange}
            >
              {DEFAULT_CHART_RANGE_OPTIONS.map((rangeOption) => (
                <option key={rangeOption} value={rangeOption}>{rangeOption}</option>
              ))}
            </select>
          </label>

          <label className="settings-field">
            <span className="settings-field-label">Tracked symbols sort</span>
            <select
              className="workspace-select"
              onChange={(event) =>
                updatePreferences({
                  trackedSymbolsSort: event.target.value as 'newest' | 'biggest_gain' | 'biggest_loss' | 'alphabetical',
                })
              }
              value={preferences.trackedSymbolsSort}
            >
              {TRACKED_SORT_OPTIONS.map((sortOption) => (
                <option key={sortOption} value={sortOption}>{trackedSymbolsSortLabel(sortOption)}</option>
              ))}
            </select>
          </label>

          <label className="settings-field">
            <span className="settings-field-label">Price display</span>
            <select
              className="workspace-select"
              onChange={(event) =>
                updatePreferences({
                  priceDisplayMode: event.target.value as 'percent' | 'change' | 'both',
                })
              }
              value={preferences.priceDisplayMode}
            >
              {PRICE_DISPLAY_OPTIONS.map((mode) => (
                <option key={mode} value={mode}>{priceDisplayModeLabel(mode)}</option>
              ))}
            </select>
          </label>

          <label className="settings-field">
            <span className="settings-field-label">Market times</span>
            <select
              className="workspace-select"
              onChange={(event) =>
                updatePreferences({
                  marketTimeDisplay: event.target.value as 'local' | 'exchange' | 'utc',
                })
              }
              value={preferences.marketTimeDisplay}
            >
              {MARKET_TIME_OPTIONS.map((mode) => (
                <option key={mode} value={mode}>{marketTimeDisplayLabel(mode)}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* Currency and formatting */}
      <section className="settings-section">
        <div className="settings-section-header">
          <h2 className="settings-section-title">Currency and formatting</h2>
        </div>
        <p className="settings-section-note">
          USD and locale-style formatting are active. More options coming soon.
        </p>

        <div className="settings-fields-grid">
          <label className="settings-field">
            <span className="settings-field-label">Currency</span>
            <select
              className="workspace-select"
              onChange={(event) =>
                updatePreferences({ currency: event.target.value as CurrencyPreference })
              }
              value={preferences.currency}
            >
              <option value="USD">USD</option>
            </select>
          </label>

          <label className="settings-field">
            <span className="settings-field-label">Number format</span>
            <select
              className="workspace-select"
              onChange={(event) =>
                updatePreferences({ numberFormat: event.target.value as NumberFormatPreference })
              }
              value={preferences.numberFormat}
            >
              <option value="locale">Locale style</option>
            </select>
          </label>
        </div>
      </section>

      {/* Account status */}
      <section className="settings-section">
        <div className="settings-section-header">
          <h2 className="settings-section-title">Account</h2>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <strong>Signed in as</strong>
            <p>{currentUser?.email ?? 'Unknown'}</p>
          </div>
          <span className="positive-pill">Active</span>
        </div>
      </section>
    </section>
  )
}
