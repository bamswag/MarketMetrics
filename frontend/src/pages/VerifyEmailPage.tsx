import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import '../styles/pages/AuthPages.css'

type VerifyEmailPageProps = {
  onVerify: (token: string) => Promise<string>
}

export function VerifyEmailPage({ onVerify }: VerifyEmailPageProps) {
  const { token: tokenParam } = useParams<{ token?: string }>()
  const [searchParams] = useSearchParams()
  const verificationToken = tokenParam ?? searchParams.get('token') ?? ''
  const [status, setStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

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
        const successMessage = await onVerify(verificationToken)
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
  }, [onVerify, verificationToken])

  return (
    <section className="auth-page page-section">
      <div className="auth-layout login-layout login-layout--single">
        <article className="auth-panel login-panel login-panel--full">
          <div className="login-auth-card login-auth-card--narrow">
            <div className="login-panel-top">
              <div className="panel-header-copy">
                <p className="section-label">Email verification</p>
                <h1 className="auth-panel-title">Confirming your new email address</h1>
              </div>
              <p className="auth-panel-intro">
                We&apos;re checking the verification link attached to your MarketMetrics account change.
              </p>
            </div>

            {status === 'verifying' ? (
              <p className="auth-helper-text">Verifying your email link...</p>
            ) : null}
            {status === 'success' ? <p className="success-text auth-message">{message}</p> : null}
            {status === 'error' ? <p className="error-text auth-message">{message}</p> : null}

            <div className="auth-page-actions">
              <Link className="ghost-action" to="/account">
                Back to account
              </Link>
              <Link className="search-button auth-secondary-action" to="/login">
                Go to login
              </Link>
            </div>
          </div>
        </article>
      </div>
    </section>
  )
}
