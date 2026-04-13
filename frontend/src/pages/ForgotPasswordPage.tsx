import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import '../styles/pages/AuthPages.css'

type ForgotPasswordPageProps = {
  onRequestReset: (email: string) => Promise<string>
}

export function ForgotPasswordPage({ onRequestReset }: ForgotPasswordPageProps) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const normalizedEmail = email.trim()
  const emailHasContent = normalizedEmail.length > 0
  const isEmailValid = !emailHasContent || /\S+@\S+\.\S+/.test(normalizedEmail)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!normalizedEmail || !isEmailValid) {
      setError('Enter a valid email address to request a password reset.')
      return
    }

    setIsSubmitting(true)
    try {
      const message = await onRequestReset(normalizedEmail)
      setSuccess(message)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to start the password recovery flow right now.',
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
                <p className="section-label">Account recovery</p>
                <h1 className="login-card-title">Recover access without starting over.</h1>
                <p className="login-card-intro">
                  Enter the email tied to your MarketMetrics account and we&apos;ll send a reset
                  link if it exists.
                </p>
                <p className="auth-caption login-panel-caption">
                  Remembered it?{' '}
                  <Link className="auth-switch-link" to="/login">
                    Back to login
                  </Link>
                </p>
              </div>

              <div className="login-card-entry">
                <div className="login-panel-top">
                  <div className="panel-header-copy">
                    <p className="section-label">Forgot password</p>
                    <h2 className="auth-panel-title">Request a reset link</h2>
                  </div>
                  <p className="auth-panel-intro">
                    For security, the response stays the same whether the account exists or not.
                  </p>
                </div>

                <form className="auth-form login-form" noValidate onSubmit={handleSubmit}>
                  <label className="field">
                    <span className="field-label">Email address</span>
                    <span className="field-hint">Use the address you normally sign in with.</span>
                    <input
                      aria-invalid={emailHasContent && !isEmailValid}
                      className={
                        emailHasContent && !isEmailValid ? 'search-input is-invalid' : 'search-input'
                      }
                      inputMode="email"
                      onChange={(event) => {
                        setEmail(event.target.value)
                        setError('')
                        setSuccess('')
                      }}
                      placeholder="you@example.com"
                      type="email"
                      value={email}
                    />
                  </label>

                  {error ? <p className="error-text auth-message">{error}</p> : null}
                  {success ? <p className="success-text auth-message">{success}</p> : null}

                  <button className="search-button auth-submit" disabled={isSubmitting} type="submit">
                    {isSubmitting ? 'Sending link...' : 'Send password reset link'}
                  </button>
                </form>

                <div className="login-footnote">
                  <span className="neutral-pill">Recovery ready</span>
                  <p>Once the link arrives, you can choose a new password and get back into the dashboard.</p>
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>
  )
}
