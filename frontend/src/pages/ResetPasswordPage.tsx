import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import '../styles/pages/AuthPages.css'

type ResetPasswordPageProps = {
  onResetPassword: (token: string, newPassword: string) => Promise<string>
}

export function ResetPasswordPage({ onResetPassword }: ResetPasswordPageProps) {
  const [searchParams] = useSearchParams()
  const resetToken = searchParams.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!resetToken) {
      setError('This password reset link is missing its token.')
      return
    }

    if (password.length < 8) {
      setError('Choose a password with at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Make sure the new password and confirmation match.')
      return
    }

    setIsSubmitting(true)
    try {
      const message = await onResetPassword(resetToken, password)
      setSuccess(message)
      setPassword('')
      setConfirmPassword('')
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to reset your password right now.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="auth-page page-section">
      <div className="auth-layout login-layout login-layout--single">
        <article className="auth-panel login-panel login-panel--full">
          <div className="login-auth-card">
            <div className="login-auth-card-grid">
              <div className="login-card-copy">
                <p className="section-label">Reset password</p>
                <h1 className="login-card-title">Choose a fresh password and get back in.</h1>
                <p className="login-card-intro">
                  This link updates the password on your MarketMetrics account and invalidates older sessions.
                </p>
                <p className="auth-caption login-panel-caption">
                  Need a new link?{' '}
                  <Link className="auth-switch-link" to="/forgot-password">
                    Request another reset email
                  </Link>
                </p>
              </div>

              <div className="login-card-entry">
                <div className="login-panel-top">
                  <div className="panel-header-copy">
                    <p className="section-label">Password reset</p>
                    <h2 className="auth-panel-title">Set your new password</h2>
                  </div>
                  <p className="auth-panel-intro">
                    Use a strong password you have not used on this account before.
                  </p>
                </div>

                <form className="auth-form login-form" noValidate onSubmit={handleSubmit}>
                  <label className="field">
                    <span className="field-label">New password</span>
                    <div className="password-input-shell">
                      <input
                        autoComplete="new-password"
                        className="search-input search-input--with-action"
                        onChange={(event) => {
                          setPassword(event.target.value)
                          setError('')
                          setSuccess('')
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

                  <label className="field">
                    <span className="field-label">Confirm new password</span>
                    <div className="password-input-shell">
                      <input
                        autoComplete="new-password"
                        className="search-input search-input--with-action"
                        onChange={(event) => {
                          setConfirmPassword(event.target.value)
                          setError('')
                          setSuccess('')
                        }}
                        placeholder="Repeat the new password"
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                      />
                      <button
                        className="field-action"
                        onClick={() => setShowConfirmPassword((currentValue) => !currentValue)}
                        type="button"
                      >
                        {showConfirmPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </label>

                  {error ? <p className="error-text auth-message">{error}</p> : null}
                  {success ? <p className="success-text auth-message">{success}</p> : null}

                  <button className="search-button auth-submit" disabled={isSubmitting} type="submit">
                    {isSubmitting ? 'Resetting password...' : 'Reset password'}
                  </button>
                </form>

                <div className="login-footnote">
                  <span className="neutral-pill">Secure update</span>
                  <p>
                    After a successful reset, you can head straight back to <Link className="auth-inline-link" to="/login">login</Link>.
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
