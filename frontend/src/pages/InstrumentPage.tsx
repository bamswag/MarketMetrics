import { useEffect, useEffectEvent, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'

import { InstrumentChartCard } from '../components/InstrumentChartCard'
import { MoverLogo } from '../components/MoverLogo'
import { ApiError, fetchInstrumentDetail } from '../lib/api'
import type {
  InstrumentDetailResponse,
  InstrumentRange,
  WatchlistItemDetailedOut,
} from '../lib/api'
import { formatCurrency } from '../lib/formatters'
import '../styles/pages/InstrumentPage.css'

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
  }, [selectedRange, symbol, token])

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

  const quote = instrumentDetail?.latestQuote
  const priceChange = quote?.change ?? 0
  const isPositive = priceChange >= 0

  return (
    <section className="instrument-page page-section">
      <div className="instrument-hero">
        <div className="instrument-hero-left">
          <Link className="instrument-back-link" to={token ? '/dashboard' : '/'}>
            <span className="instrument-back-arrow">&larr;</span>
            {token ? 'Dashboard' : 'Home'}
          </Link>

          <div className="instrument-identity">
            <div className="instrument-symbol-logo">
              <MoverLogo
                name={instrumentDetail?.companyName ?? symbol}
                symbol={instrumentDetail?.symbol ?? symbol}
              />
            </div>
            <div>
              <h1 className="instrument-name">
                {instrumentDetail?.companyName ?? symbol}
              </h1>
              <p className="instrument-exchange">
                {instrumentDetail
                  ? `${instrumentDetail.exchange ?? 'US market'}`
                  : `Loading...`}
              </p>
            </div>
          </div>
        </div>

        <div className="instrument-hero-right">
          {quote ? (
            <div className="instrument-price-block">
              <span className="instrument-live-price">{formatCurrency(quote.price)}</span>
              <span className={`instrument-price-change ${isPositive ? 'instrument-price-change--up' : 'instrument-price-change--down'}`}>
                {isPositive ? '+' : ''}{priceChange.toFixed(2)} USD ({quote.changePercent ?? '--'})
              </span>
              <span className="instrument-price-date">
                Last traded {quote.latestTradingDay ?? '--'}
              </span>
            </div>
          ) : null}

          <div className="instrument-hero-actions">
            {token ? (
              <button
                className={isTracked ? 'instrument-untrack-btn' : 'instrument-track-btn'}
                disabled={isUpdatingTrackedSymbol || isLoadingTrackedSymbols}
                onClick={() => void handleToggleTrackedSymbol()}
                type="button"
              >
                {isLoadingTrackedSymbols
                  ? 'Checking...'
                  : isUpdatingTrackedSymbol
                    ? isTracked ? 'Removing...' : 'Tracking...'
                    : isTracked ? 'Untrack' : 'Track symbol'}
              </button>
            ) : (
              <Link className="instrument-track-btn" to="/login">
                Log in to track
              </Link>
            )}
          </div>
        </div>
      </div>

      {instrumentError ? <p className="error-text">{instrumentError}</p> : null}
      {trackingError ? <p className="error-text">{trackingError}</p> : null}
      {trackingSuccess ? <p className="success-text">{trackingSuccess}</p> : null}
      {isLoadingInstrument && !instrumentDetail ? (
        <div className="instrument-loading">
          <div className="instrument-loading-spinner" />
          <p>Loading chart data for {symbol}...</p>
        </div>
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
