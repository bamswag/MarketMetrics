import { useEffect, useEffectEvent, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'

import { InstrumentChartCard } from '../components/InstrumentChartCard'
import { ApiError, fetchInstrumentDetail } from '../lib/api'
import type {
  InstrumentDetailResponse,
  InstrumentRange,
  WatchlistItemDetailedOut,
} from '../lib/api'

type InstrumentPageProps = {
  isLoadingTrackedSymbols?: boolean
  onTrackSymbol?: (symbol: string) => Promise<void>
  onUntrackSymbol?: (symbol: string) => Promise<void>
  onUnauthorized?: (message: string) => void
  token?: string
  trackedSymbols?: WatchlistItemDetailedOut[]
}

export function InstrumentPage({
  isLoadingTrackedSymbols = false,
  onTrackSymbol,
  onUnauthorized,
  onUntrackSymbol,
  token,
  trackedSymbols = [],
}: InstrumentPageProps) {
  const params = useParams()
  const symbol = params.symbol?.toUpperCase() ?? ''
  const onUnauthorizedEvent = useEffectEvent((message: string) => {
    onUnauthorized?.(message)
  })

  const [selectedRange, setSelectedRange] = useState<InstrumentRange>('6M')
  const [instrumentDetail, setInstrumentDetail] = useState<InstrumentDetailResponse | null>(null)
  const [instrumentError, setInstrumentError] = useState('')
  const [isLoadingInstrument, setIsLoadingInstrument] = useState(false)
  const [trackingError, setTrackingError] = useState('')
  const [trackingSuccess, setTrackingSuccess] = useState('')
  const [isUpdatingTrackedSymbol, setIsUpdatingTrackedSymbol] = useState(false)

  const isTracked = trackedSymbols.some((item) => item.symbol === symbol)

  useEffect(() => {
    setSelectedRange('6M')
  }, [symbol])

  useEffect(() => {
    setTrackingError('')
    setTrackingSuccess('')
    setIsUpdatingTrackedSymbol(false)
  }, [symbol])

  useEffect(() => {
    if (!symbol) {
      setInstrumentDetail(null)
      setInstrumentError('')
      return
    }

    let cancelled = false

    async function loadInstrumentDetail() {
      setIsLoadingInstrument(true)
      setInstrumentError('')

      try {
        const response = await fetchInstrumentDetail(token, symbol, selectedRange)
        if (cancelled) {
          return
        }

        setInstrumentDetail(response)
      } catch (error) {
        if (cancelled) {
          return
        }

        if (error instanceof ApiError && error.status === 401) {
          onUnauthorizedEvent('Your session expired. Log in again to view instrument charts.')
          return
        }

        setInstrumentError(
          error instanceof Error ? error.message : 'Unable to load instrument details.',
        )
      } finally {
        if (!cancelled) {
          setIsLoadingInstrument(false)
        }
      }
    }

    void loadInstrumentDetail()

    return () => {
      cancelled = true
    }
  }, [onUnauthorizedEvent, selectedRange, symbol, token])

  if (!symbol) {
    return <Navigate replace to="/dashboard" />
  }

  async function handleToggleTrackedSymbol() {
    if (!token) {
      return
    }

    const nextAction = isTracked ? onUntrackSymbol : onTrackSymbol
    if (!nextAction) {
      return
    }

    setTrackingError('')
    setTrackingSuccess('')
    setIsUpdatingTrackedSymbol(true)

    try {
      await nextAction(symbol)
      setTrackingSuccess(
        isTracked
          ? `${symbol} was removed from your tracked symbols.`
          : `${symbol} was added to your tracked symbols.`,
      )
    } catch (error) {
      setTrackingError(
        error instanceof Error ? error.message : 'Unable to update tracked symbols right now.',
      )
    } finally {
      setIsUpdatingTrackedSymbol(false)
    }
  }

  return (
    <section className="instrument-page page-section">
      <div className="instrument-page-head">
        <div>
          <Link className="secondary-link" to={token ? '/dashboard' : '/'}>
            {token ? 'Back to dashboard' : 'Back to home'}
          </Link>
          <p className="section-label">Instrument detail</p>
          <h1 className="instrument-title">{instrumentDetail?.companyName ?? symbol}</h1>
          <p className="instrument-subtitle">
            {instrumentDetail
              ? `${instrumentDetail.symbol} · ${instrumentDetail.exchange ?? 'US market'}`
              : `Loading chart-ready data for ${symbol}`}
          </p>
        </div>

        <div className="instrument-page-actions">
          {token ? (
            <button
              className={isTracked ? 'ghost-action instrument-track-button' : 'search-button instrument-track-button'}
              disabled={isUpdatingTrackedSymbol || isLoadingTrackedSymbols}
              onClick={() => void handleToggleTrackedSymbol()}
              type="button"
            >
              {isLoadingTrackedSymbols
                ? 'Checking tracked state...'
                : isUpdatingTrackedSymbol
                  ? isTracked
                    ? 'Removing...'
                    : 'Tracking...'
                  : isTracked
                    ? 'Remove from tracked'
                    : 'Track symbol'}
            </button>
          ) : (
            <Link className="ghost-action instrument-track-button" to="/login">
              Log in to track
            </Link>
          )}
        </div>
      </div>

      {instrumentError ? <p className="error-text">{instrumentError}</p> : null}
      {trackingError ? <p className="error-text">{trackingError}</p> : null}
      {trackingSuccess ? <p className="success-text">{trackingSuccess}</p> : null}
      {isLoadingInstrument && !instrumentDetail ? (
        <p className="empty-state">Loading instrument details and price history...</p>
      ) : null}

      {instrumentDetail ? (
        <InstrumentChartCard
          instrumentDetail={instrumentDetail}
          onSelectRange={setSelectedRange}
          selectedRange={selectedRange}
        />
      ) : null}
    </section>
  )
}
