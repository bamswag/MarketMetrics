import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { RiskProfileBadge, RiskProfileQuiz } from '../components/RiskProfileQuiz'
import type { RiskProfile, UserOut } from '../lib/api'
import { formatDateTime } from '../lib/formatters'
import '../styles/pages/ProfilePages.css'
import '../styles/pages/AccountPage.css'
import '../styles/components/RiskProfileQuiz.css'

type AccountPageProps = {
  currentUser: UserOut | null
  onChangePassword: (payload: { currentPassword?: string; newPassword: string }) => Promise<string>
  onLogoutAllSessions: () => Promise<void>
  onUpdateProfile: (payload: { displayName?: string; email?: string }) => Promise<UserOut>
  onUpdateRiskProfile?: (profile: RiskProfile) => Promise<void>
}

function authProviderLabel(provider?: string | null) {
  return provider === 'google' ? 'Google sign-in' : 'Email and password'
}

export function AccountPage({
  currentUser,
  onChangePassword,
  onLogoutAllSessions,
  onUpdateProfile,
  onUpdateRiskProfile,
}: AccountPageProps) {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [profileError, setProfileError] = useState('')
  const [profileSuccess, setProfileSuccess] = useState('')
  const [isSavingProfile, setIsSavingProfile] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  const [isLoggingOutAll, setIsLoggingOutAll] = useState(false)
  const [logoutAllError, setLogoutAllError] = useState('')
  const [showDeleteScaffold, setShowDeleteScaffold] = useState(false)
  const [isRetakingProfile, setIsRetakingProfile] = useState(false)
  const [isSavingProfile2, setIsSavingProfile2] = useState(false)

  const riskProfile = currentUser?.riskProfile as RiskProfile | null | undefined

  useEffect(() => {
    setDisplayName(currentUser?.displayName ?? '')
    setEmail(currentUser?.pendingEmail ?? currentUser?.email ?? '')
  }, [currentUser?.displayName, currentUser?.email, currentUser?.pendingEmail])

  async function handleProfileSubmit() {
    if (!currentUser || isSavingProfile) {
      return
    }

    setProfileError('')
    setProfileSuccess('')

    const normalizedDisplayName = displayName.trim()
    const normalizedEmail = email.trim()
    const nextPayload: { displayName?: string; email?: string } = {}

    if (!normalizedDisplayName) {
      setProfileError('Display name cannot be empty.')
      return
    }

    if (normalizedDisplayName !== currentUser.displayName) {
      nextPayload.displayName = normalizedDisplayName
    }

    const currentEditableEmail = currentUser.pendingEmail ?? currentUser.email
    if (normalizedEmail && normalizedEmail !== currentEditableEmail) {
      nextPayload.email = normalizedEmail
    }

    if (!nextPayload.displayName && !nextPayload.email) {
      setProfileError('There are no profile changes to save yet.')
      return
    }

    setIsSavingProfile(true)
    try {
      const updatedUser = await onUpdateProfile(nextPayload)
      setDisplayName(updatedUser.displayName)
      setEmail(updatedUser.pendingEmail ?? updatedUser.email)
      setProfileSuccess(
        updatedUser.pendingEmail
          ? `Profile updated. Verify ${updatedUser.pendingEmail} to finish switching your sign-in email.`
          : 'Profile details updated successfully.',
      )
    } catch (error) {
      setProfileError(
        error instanceof Error ? error.message : 'Unable to update your profile right now.',
      )
    } finally {
      setIsSavingProfile(false)
    }
  }

  async function handlePasswordSubmit() {
    if (!currentUser || isChangingPassword) {
      return
    }

    setPasswordError('')
    setPasswordSuccess('')

    if (currentUser.primaryAuthProvider === 'password' && !currentPassword) {
      setPasswordError('Enter your current password to continue.')
      return
    }

    if (newPassword.length < 8) {
      setPasswordError('Choose a password with at least 8 characters.')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Make sure the new password and confirmation match.')
      return
    }

    setIsChangingPassword(true)
    try {
      const responseMessage = await onChangePassword({
        currentPassword: currentPassword || undefined,
        newPassword,
      })
      setPasswordSuccess(responseMessage)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (error) {
      setPasswordError(
        error instanceof Error ? error.message : 'Unable to update your password right now.',
      )
    } finally {
      setIsChangingPassword(false)
    }
  }

  async function handleLogoutAllSessions() {
    if (isLoggingOutAll) {
      return
    }

    setLogoutAllError('')
    setIsLoggingOutAll(true)
    try {
      await onLogoutAllSessions()
    } catch (error) {
      setLogoutAllError(
        error instanceof Error ? error.message : 'Unable to sign out all sessions right now.',
      )
      setIsLoggingOutAll(false)
    }
  }

  if (!currentUser) {
    return (
      <section className="profile-page page-section">
        <div className="profile-page-head">
          <div className="panel-header-copy">
            <p className="section-label">Account</p>
            <h1 className="profile-page-title">Your account center is loading.</h1>
          </div>
          <p className="profile-page-copy">
            Identity details, sign-in security, and account status will appear here in a moment.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="profile-page page-section account-page">
      <div className="profile-page-head account-page-head">
        <div className="panel-header-copy">
          <p className="section-label">Account</p>
          <h1 className="profile-page-title">Manage identity, sign-in, and account security from one calm workspace.</h1>
        </div>
        <p className="profile-page-copy">
          Keep profile details current, review your authentication setup, and take decisive account
          actions without digging through the rest of the dashboard.
        </p>
      </div>

      <div className="account-grid">
        <article className="panel account-card account-card--accent">
          <div className="panel-header">
            <div className="panel-header-copy">
              <p className="section-label">Profile details</p>
              <h2 className="panel-title">Update the identity details tied to this workspace</h2>
            </div>
            <span className="panel-tag">
              {currentUser.emailVerifiedAt ? 'Verified email on file' : 'Verification pending'}
            </span>
          </div>

          <div className="account-form">
            <label className="field">
              <span className="field-label">Display name</span>
              <span className="field-hint">This is the name shown in the header and dashboard.</span>
              <input
                className="search-input"
                onChange={(event) => {
                  setDisplayName(event.target.value)
                  setProfileError('')
                  setProfileSuccess('')
                }}
                type="text"
                value={displayName}
              />
            </label>

            <label className="field">
              <div className="field-row">
                <span className="field-label">Email address</span>
                <span className={currentUser.emailVerifiedAt ? 'positive-pill' : 'warning-pill'}>
                  {currentUser.emailVerifiedAt ? 'Verified' : 'Needs verification'}
                </span>
              </div>
              <span className="field-hint">
                Changing this sends a verification link before your sign-in email switches over.
              </span>
              <input
                className="search-input"
                inputMode="email"
                onChange={(event) => {
                  setEmail(event.target.value)
                  setProfileError('')
                  setProfileSuccess('')
                }}
                type="email"
                value={email}
              />
            </label>

            <div className="account-inline-note">
              <strong>Current sign-in email</strong>
              <p>{currentUser.email}</p>
            </div>

            {currentUser.pendingEmail ? (
              <div className="account-inline-note account-inline-note--pending">
                <strong>Email change waiting on verification</strong>
                <p>
                  {currentUser.pendingEmail} will replace your current sign-in email once it is
                  verified.
                </p>
              </div>
            ) : null}

            {profileError ? <p className="error-text account-message">{profileError}</p> : null}
            {profileSuccess ? <p className="success-text account-message">{profileSuccess}</p> : null}

            <div className="account-actions">
              <button
                className="search-button account-action"
                disabled={isSavingProfile}
                onClick={() => void handleProfileSubmit()}
                type="button"
              >
                {isSavingProfile ? 'Saving profile...' : 'Save profile changes'}
              </button>
            </div>
          </div>
        </article>

        <article className="panel account-card account-card--side">
          <div className="panel-header-copy">
            <p className="section-label">Account status</p>
            <h2 className="panel-title">Read-only account snapshot</h2>
          </div>

          <div className="account-meta-grid">
            <div className="account-meta-item">
              <span className="metric-label">Member since</span>
              <strong>{formatDateTime(currentUser.createdAt)}</strong>
            </div>
            <div className="account-meta-item">
              <span className="metric-label">Last login</span>
              <strong>
                {currentUser.lastLoginAt ? formatDateTime(currentUser.lastLoginAt) : 'Not recorded yet'}
              </strong>
            </div>
            <div className="account-meta-item">
              <span className="metric-label">Account ID</span>
              <strong className="profile-code">{currentUser.userID}</strong>
            </div>
            <div className="account-meta-item">
              <span className="metric-label">Plan / status</span>
              <strong>{currentUser.planName ?? 'Free'} · {currentUser.accountStatus ?? 'Active'}</strong>
            </div>
          </div>
        </article>

        <article className="panel account-card account-card--full">
          <div className="panel-header">
            <div className="panel-header-copy">
              <p className="section-label">Authentication</p>
              <h2 className="panel-title">Review your provider and keep sign-in recovery ready</h2>
            </div>
            <span className="neutral-pill">{authProviderLabel(currentUser.primaryAuthProvider)}</span>
          </div>

          <div className="account-auth-layout">
            <div className="account-auth-summary">
              <div className="account-inline-note">
                <strong>Primary auth provider</strong>
                <p>{authProviderLabel(currentUser.primaryAuthProvider)}</p>
              </div>
              <div className="account-inline-note">
                <strong>Password access</strong>
                <p>
                  {currentUser.primaryAuthProvider === 'google'
                    ? 'Google stays primary, but you can set a password for account recovery and direct email sign-in later.'
                    : 'Password-based access is active. Updating it signs out every current session for safety.'}
                </p>
              </div>
            </div>

            <div className="account-form">
              {currentUser.primaryAuthProvider === 'password' ? (
                <label className="field">
                  <span className="field-label">Current password</span>
                  <div className="password-input-shell">
                    <input
                      autoComplete="current-password"
                      className="search-input search-input--with-action"
                      onChange={(event) => {
                        setCurrentPassword(event.target.value)
                        setPasswordError('')
                        setPasswordSuccess('')
                      }}
                      placeholder="Enter your current password"
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                    />
                    <button
                      className="field-action"
                      onClick={() => setShowCurrentPassword((currentValue) => !currentValue)}
                      type="button"
                    >
                      {showCurrentPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
              ) : null}

              <label className="field">
                <span className="field-label">
                  {currentUser.primaryAuthProvider === 'google' ? 'Set a password' : 'New password'}
                </span>
                <div className="password-input-shell">
                  <input
                    autoComplete="new-password"
                    className="search-input search-input--with-action"
                    onChange={(event) => {
                      setNewPassword(event.target.value)
                      setPasswordError('')
                      setPasswordSuccess('')
                    }}
                    placeholder="Use at least 8 characters"
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                  />
                  <button
                    className="field-action"
                    onClick={() => setShowNewPassword((currentValue) => !currentValue)}
                    type="button"
                  >
                    {showNewPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>

              <label className="field">
                <span className="field-label">Confirm new password</span>
                <input
                  autoComplete="new-password"
                  className="search-input"
                  onChange={(event) => {
                    setConfirmPassword(event.target.value)
                    setPasswordError('')
                    setPasswordSuccess('')
                  }}
                  placeholder="Repeat the new password"
                  type="password"
                  value={confirmPassword}
                />
              </label>

              {passwordError ? <p className="error-text account-message">{passwordError}</p> : null}
              {passwordSuccess ? <p className="success-text account-message">{passwordSuccess}</p> : null}

              <div className="account-actions">
                <button
                  className="search-button account-action"
                  disabled={isChangingPassword}
                  onClick={() => void handlePasswordSubmit()}
                  type="button"
                >
                  {isChangingPassword
                    ? 'Updating password...'
                    : currentUser.primaryAuthProvider === 'google'
                      ? 'Set password'
                      : 'Change password'}
                </button>
              </div>
            </div>
          </div>
        </article>

        <article className="panel account-card account-card--full">
          <div className="panel-header">
            <div className="panel-header-copy">
              <p className="section-label">Risk profile</p>
              <h2 className="panel-title">Your investor risk profile shapes advisory insights across the app</h2>
            </div>
            {riskProfile && !isRetakingProfile
              ? <span className="positive-pill">Set</span>
              : <span className="neutral-pill">Personalisation</span>
            }
          </div>

          {isRetakingProfile || !riskProfile ? (
            <RiskProfileQuiz
              isSaving={isSavingProfile2}
              onComplete={async (profile) => {
                if (!onUpdateRiskProfile) return
                setIsSavingProfile2(true)
                try {
                  await onUpdateRiskProfile(profile)
                  setIsRetakingProfile(false)
                } finally {
                  setIsSavingProfile2(false)
                }
              }}
              onDismiss={riskProfile ? () => setIsRetakingProfile(false) : undefined}
            />
          ) : (
            <RiskProfileBadge
              profile={riskProfile}
              onRetake={() => setIsRetakingProfile(true)}
            />
          )}
        </article>

        <article className="panel account-card account-card--full account-card--danger">
          <div className="panel-header">
            <div className="panel-header-copy">
              <p className="section-label">Danger zone</p>
              <h2 className="panel-title">High-impact account actions</h2>
            </div>
            <span className="warning-pill">Use with care</span>
          </div>

          <div className="account-danger-grid">
            <div className="account-danger-item">
              <strong>Log out all sessions</strong>
              <p>
                Invalidate access across every browser and device, including the current one, and
                force a fresh sign-in everywhere.
              </p>
              {logoutAllError ? <p className="error-text account-message">{logoutAllError}</p> : null}
              <button
                className="ghost-action account-danger-action"
                disabled={isLoggingOutAll}
                onClick={() => void handleLogoutAllSessions()}
                type="button"
              >
                {isLoggingOutAll ? 'Signing out sessions...' : 'Log out all sessions'}
              </button>
            </div>

            <div className="account-danger-item">
              <strong>Delete account</strong>
              <p>
                The confirmation flow is scaffolded now so the UI is ready, but destructive account
                deletion is intentionally held back until the backend policy is finalized.
              </p>
              <button
                className="ghost-action account-danger-action"
                onClick={() => setShowDeleteScaffold((currentValue) => !currentValue)}
                type="button"
              >
                {showDeleteScaffold ? 'Hide delete flow' : 'Review delete flow'}
              </button>

              {showDeleteScaffold ? (
                <div className="account-delete-scaffold">
                  <strong>Delete account flow coming soon</strong>
                  <p>
                    This version stops at confirmation copy so the dangerous action stays visible
                    without risking accidental data loss.
                  </p>
                  <button className="account-delete-placeholder" disabled type="button">
                    Delete account unavailable in this build
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <p className="panel-note">
            Need to review your policies first? Visit the <Link className="inline-link" to="/terms">Terms</Link>{' '}
            and <Link className="inline-link" to="/privacy">Privacy Policy</Link>.
          </p>
        </article>
      </div>
    </section>
  )
}
