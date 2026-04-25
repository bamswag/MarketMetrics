import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import '../styles/pages/AuthPages.css'

type VerifyEmailPageProps = {
  isAuthenticated?: boolean
  onVerify: (token: string) => Promise<string>
}

export function VerifyEmailPage({ isAuthenticated = false, onVerify }: VerifyEmailPageProps) {
  const { token: tokenParam } = useParams<{ token?: string }>()
  const [searchParams] = useSearchParams()
  const verificationToken = tokenParam ?? searchParams.get('token') ?? ''
  const [status, setStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  // Keep a stable ref to onVerify so the effect only re-runs when the
  // verification token itself changes — not when the parent re-renders and
  // passes a new function reference (which would trigger a duplicate API call
  // that fails because the token is already consumed).
  const onVerifyRef = useRef(onVerify)
  onVerifyRef.current = onVerify

  useEffect(() => {
    if (!verificationToken) {
      setStatus('error')
      setMessage('This verification link is missing its token.')
      return
    }

    let cancelled = false

    async function runVerification() {
      setStatus('verifying')
      setMessage('')

      try {
        const successMessage = await onVerifyRef.current(verificationToken)
        if (cancelled) {
          return
        }
        setStatus('success')
        setMessage(successMessage)
      } catch (error) {
        if (cancelled) {
          return
        }
        setStatus('error')
        setMessage(
          error instanceof Error
            ? error.message
            : 'Unable to verify this email link right now.',
        )
      }
    }

    void runVerification()

    return () => {
      cancelled = true
    }
  // onVerify intentionally excluded: the ref above keeps it current without
  // causing re-runs. Verification should only fire once per unique token.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verificationToken])

  return (
    <section className="auth-page page-section">
      <div className="auth-layout login-layout login-layout--single">
        <article className="auth-panel login-panel login-panel--full">
          <div className="login-auth-card login-auth-card--narrow">
            <div className="login-panel-top">
              <div className="panel-header-copy">
                <p className="section-label">Account verification</p>
                <h1 className="auth-panel-title">Verifying your MarketMetrics email</h1>
              </div>
              <p className="auth-panel-intro">
                This secure link can confirm a new account or complete an email change for your
                MarketMetrics profile.
              </p>
            </div>

            {status === 'verifying' ? (
              <p className="auth-helper-text">Verifying your email link...</p>
            ) : null}
            {status === 'success' ? <p className="success-text auth-message">{message}</p> : null}
            {status === 'error' ? <p className="error-text auth-message">{message}</p> : null}

            <div className="auth-page-actions">
              <Link className="search-button auth-secondary-action" to="/login">
                Go to login
              </Link>
              {isAuthenticated ? (
                <Link className="ghost-action" to="/account">
                  Back to account
                </Link>
              ) : null}
            </div>
          </div>
        </article>
      </div>
    </section>
  )
}
