import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { GoogleLogoIcon } from './shared/GoogleLogoIcon'

type LoginPageProps = {
  authError?: string
  googleAuthUrl: string
  onClearAuthError: () => void
  onLogin: (email: string, password: string) => Promise<void>
}

export function LoginPage({
  authError,
  googleAuthUrl,
  onClearAuthError,
  onLogin,
}: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [localError, setLocalError] = useState('')

  const normalizedEmail = email.trim()
  const emailHasContent = normalizedEmail.length > 0
  const isEmailValid = !emailHasContent || /\S+@\S+\.\S+/.test(normalizedEmail)
  const emailInputClassName =
    emailHasContent && !isEmailValid ? 'search-input is-invalid' : 'search-input'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLocalError('')
    onClearAuthError()

    if (!normalizedEmail || !password) {
      setLocalError('Enter your email address and password to continue.')
      return
    }

    if (!isEmailValid) {
      setLocalError('Enter a valid email address before signing in.')
      return
    }

    setIsSubmitting(true)

    try {
      await onLogin(normalizedEmail, password)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Unable to sign you in right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const combinedError = localError || authError || ''

  return (
    <section className="auth-page login-page page-section">
      <div className="auth-layout login-layout login-layout--single">
        <article className="auth-panel login-panel login-panel--full">
          <div className="login-auth-card">
            <div className="login-auth-card-grid">
              <div className="login-card-copy">
                <p className="section-label">Simulator sign-in</p>
                <h1 className="login-card-title">Access your market simulator.</h1>
                <p className="login-card-intro">
                  Sign in to continue with your simulator dashboard, saved symbols, alerts, and chart views.
                </p>
                <p className="auth-caption login-panel-caption">
                  New to MarketMetrics?{' '}
                  <Link className="auth-switch-link" to="/signup">
                    Create account
                  </Link>
                </p>
              </div>

              <div className="login-card-entry">
                <div className="login-panel-top">
                  <div className="panel-header-copy">
                    <p className="section-label">Login</p>
                    <h2 className="auth-panel-title">Sign in to continue</h2>
                  </div>
                  <p className="auth-panel-intro">
                    Use your MarketMetrics account to enter the simulator dashboard.
                  </p>
                </div>

                <a className="google-auth-button google-auth-button--wide" href={googleAuthUrl}>
                  <GoogleLogoIcon />
                  Continue with Google
                </a>

                <div className="auth-divider">
                  <span>or use email</span>
                </div>

                <form className="auth-form login-form" noValidate onSubmit={handleSubmit}>
                  <label className="field">
                    <span className="field-label">Email address</span>
                    <span className="field-hint">Use the same email you registered with.</span>
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
                      <span className="field-hint">Enter the password for this account.</span>
                    </div>
                    <div className="password-input-shell">
                      <input
                        autoComplete="current-password"
                        className="search-input search-input--with-action"
                        onChange={(event) => {
                          setPassword(event.target.value)
                          setLocalError('')
                          onClearAuthError()
                        }}
                        placeholder="Enter your password"
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

                  {combinedError ? <p className="error-text auth-message">{combinedError}</p> : null}
                  {!combinedError ? (
                    <p className="auth-helper-text">
                      Secure token-based sign-in to your market simulator dashboard.
                    </p>
                  ) : null}

                  <button className="search-button auth-submit" disabled={isSubmitting} type="submit">
                    {isSubmitting ? 'Signing in...' : 'Log in'}
                  </button>
                </form>

                <div className="login-footnote">
                  <span className="neutral-pill">Simulator ready</span>
                  <p>
                    Your watchlists, alerts, and chart routes will be ready as soon as you sign in.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>
  )
}
