import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { GoogleLogoIcon } from './shared/GoogleLogoIcon'
import '../styles/pages/AuthPages.css'

type SignupPageProps = {
  authError?: string
  googleSignupUrl: string
  onClearAuthError: () => void
  onRegister: (payload: {
    displayName: string
    email: string
    password: string
    acceptedTerms: boolean
  }) => Promise<void>
}

export function SignupPage({
  authError,
  googleSignupUrl,
  onClearAuthError,
  onRegister,
}: SignupPageProps) {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [localError, setLocalError] = useState('')

  const normalizedDisplayName = displayName.trim()
  const normalizedEmail = email.trim()
  const emailHasContent = normalizedEmail.length > 0
  const isEmailValid = !emailHasContent || /\S+@\S+\.\S+/.test(normalizedEmail)
  const isPasswordValid = password.length === 0 || password.length >= 8

  const emailInputClassName =
    emailHasContent && !isEmailValid ? 'search-input is-invalid' : 'search-input'
  const passwordInputClassName =
    password.length > 0 && !isPasswordValid
      ? 'search-input search-input--with-action is-invalid'
      : 'search-input search-input--with-action'
  const combinedError = localError || authError || ''
  const resolvedGoogleSignupUrl = `${googleSignupUrl}${
    googleSignupUrl.includes('?') ? '&' : '?'
  }acceptedTerms=${acceptedTerms ? 'true' : 'false'}`

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLocalError('')
    onClearAuthError()

    if (!normalizedDisplayName || !normalizedEmail || !password) {
      setLocalError('Enter your display name, email address, and password to create an account.')
      return
    }

    if (!isEmailValid) {
      setLocalError('Enter a valid email address before continuing.')
      return
    }

    if (!isPasswordValid) {
      setLocalError('Choose a password with at least 8 characters.')
      return
    }

    if (!acceptedTerms) {
      setLocalError('Agree to the Terms and Privacy Policy before creating an account.')
      return
    }

    setIsSubmitting(true)

    try {
      await onRegister({
        displayName: normalizedDisplayName,
        email: normalizedEmail,
        password,
        acceptedTerms: true,
      })
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Unable to create your account right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="auth-page signup-page page-section">
      <div className="auth-layout login-layout login-layout--single">
        <article className="auth-panel login-panel login-panel--full">
          <div className="login-auth-card">
            <div className="login-auth-card-grid">
              <div className="login-card-copy">
                <p className="section-label">Create simulator access</p>
                <h1 className="login-card-title">Build your Market Metrics account.</h1>
                <p className="login-card-intro">
                  Create an account to unlock your simulator dashboard, saved symbols, alerts, and
                  chart-led instrument pages.
                </p>
                <p className="auth-caption login-panel-caption">
                  Already have a MarketMetrics account?{' '}
                  <Link className="auth-switch-link" to="/login">
                    Log in
                  </Link>
                </p>
              </div>

              <div className="login-card-entry">
                <div className="login-panel-top">
                  <div className="panel-header-copy">
                    <p className="section-label">Sign up</p>
                    <h2 className="auth-panel-title">Create your account</h2>
                  </div>
                  <p className="auth-panel-intro">
                    Set up your MarketMetrics account and go straight into the simulator dashboard.
                  </p>
                </div>

                <a
                  className="google-auth-button google-auth-button--wide"
                  href={resolvedGoogleSignupUrl}
                  onClick={(event) => {
                    if (!acceptedTerms) {
                      event.preventDefault()
                      setLocalError('Agree to the Terms and Privacy Policy before continuing with Google.')
                    }
                  }}
                >
                  <GoogleLogoIcon />
                  Continue with Google
                </a>

                <div className="auth-divider">
                  <span>or use email</span>
                </div>

                <form className="auth-form login-form" noValidate onSubmit={handleSubmit}>
                  <label className="field">
                    <span className="field-label">Display name</span>
                    <span className="field-hint">How should MarketMetrics address you?</span>
                    <input
                      autoComplete="name"
                      className="search-input"
                      onChange={(event) => {
                        setDisplayName(event.target.value)
                        setLocalError('')
                        onClearAuthError()
                      }}
                      placeholder="How should we address you?"
                      type="text"
                      value={displayName}
                    />
                  </label>

                  <label className="field">
                    <span className="field-label">Email address</span>
                    <span className="field-hint">This will become your sign-in email.</span>
                    <input
                      aria-invalid={emailHasContent && !isEmailValid}
                      autoComplete="email"
                      className={emailInputClassName}
                      inputMode="email"
                      onChange={(event) => {
                        setEmail(event.target.value)
                        setLocalError('')
                        onClearAuthError()
                      }}
                      placeholder="you@example.com"
                      spellCheck={false}
                      type="email"
                      value={email}
                    />
                  </label>

                  <label className="field">
                    <div className="field-row">
                      <span className="field-label">Password</span>
                      <span className="field-hint">Choose at least 8 characters.</span>
                    </div>
                    <div className="password-input-shell">
                      <input
                        autoComplete="new-password"
                        className={passwordInputClassName}
                        onChange={(event) => {
                          setPassword(event.target.value)
                          setLocalError('')
                          onClearAuthError()
                        }}
                        placeholder="Minimum 8 characters"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                      />
                      <button
                        className="field-action"
                        onClick={() => setShowPassword((currentValue) => !currentValue)}
                        type="button"
                      >
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </label>

                  <label className="checkbox-field">
                    <span className="checkbox-control">
                      <input
                        checked={acceptedTerms}
                        className="checkbox-input"
                        onChange={(event) => {
                          setAcceptedTerms(event.target.checked)
                          setLocalError('')
                          onClearAuthError()
                        }}
                        type="checkbox"
                      />
                      <span>
                        I agree to the <Link className="auth-inline-link" to="/terms">Terms</Link>{' '}
                        and <Link className="auth-inline-link" to="/privacy">Privacy Policy</Link>.
                      </span>
                    </span>
                  </label>

                  {combinedError ? <p className="error-text auth-message">{combinedError}</p> : null}
                  {!combinedError ? (
                    <p className="auth-helper-text">
                      After sign-up, you will be signed in automatically and sent to your simulator dashboard.
                    </p>
                  ) : null}

                  <button className="search-button auth-submit" disabled={isSubmitting} type="submit">
                    {isSubmitting ? 'Creating account...' : 'Create account'}
                  </button>
                </form>

                <div className="login-footnote">
                  <span className="neutral-pill">Simulator ready</span>
                  <p>Your watchlists, alerts, and search workflow will be ready as soon as your account is created.</p>
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>
  )
}
