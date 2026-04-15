import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'

import { useMarketPreferences } from '../app/MarketPreferencesContext'
import { InstrumentChartCard } from '../components/InstrumentChartCard'
import { MoverLogo } from '../components/MoverLogo'
import { ApiError, fetchAlertsForSymbol, fetchInstrumentDetail } from '../lib/api'
import type {
  AlertCondition,
  InstrumentDetailResponse,
  InstrumentRange,
  PriceAlert,
  PriceAlertCreatePayload,
  PriceAlertUpdatePayload,
  RiskProfile,
  WatchlistItemDetailedOut,
} from '../lib/api'
import '../styles/components/RiskProfileQuiz.css'
import {
  formatCurrencyWithPreferences,
  formatPriceChangeWithPreferences,
} from '../lib/marketDisplay'
import { formatCurrency } from '../lib/formatters'
import '../styles/pages/InstrumentPage.css'

type AdvisoryMessage = {
  variant: 'caution' | 'info' | 'default'
  icon: string
  title: string
  text: string
} | null

function getRiskAdvisory(
  profile: RiskProfile | null,
  isCrypto: boolean,
  assetCategory: string,
): AdvisoryMessage {
  if (!profile) return null

  if (isCrypto) {
    if (profile === 'conservative') {
      return {
        variant: 'caution',
        icon: '⚠️',
        title: 'High volatility asset',
        text: 'Cryptocurrency is among the most volatile asset classes. As a conservative investor, consider whether the risk level aligns with your goals before setting alerts or tracking this instrument.',
      }
    }
    if (profile === 'moderate') {
      return {
        variant: 'default',
        icon: '💡',
        title: 'Volatility heads-up',
        text: 'Cryptocurrency can deliver strong returns but also sharp drawdowns. Keep position sizes proportional to your overall portfolio.',
      }
    }
    // aggressive — affirm
    return {
      variant: 'info',
      icon: '📈',
      title: 'High-volatility opportunity',
      text: 'Crypto aligns with your appetite for higher-risk, higher-reward assets. Stay informed on market sentiment and liquidity.',
    }
  }

  // ETF — affirm conservative/moderate, nudge aggressive
  if (assetCategory === 'etf' || assetCategory === 'etfs') {
    if (profile === 'aggressive') {
      return {
        variant: 'default',
        icon: '💡',
        title: 'Diversified instrument',
        text: 'ETFs offer broad diversification and tend to smooth out single-stock risk. They may limit upside compared to concentrated positions — keep that in mind alongside your higher-growth goals.',
      }
    }
    return {
      variant: 'info',
      icon: '✅',
      title: 'Matches your profile',
      text: 'ETFs typically offer diversified, lower-volatility exposure — a good fit for your investor profile.',
    }
  }

  return null
}

type InstrumentPageProps = {
  onCreateAlert?: (payload: PriceAlertCreatePayload) => Promise<unknown>
  onDeleteAlert?: (alertId: string) => Promise<void>
  onUpdateAlert?: (alertId: string, payload: PriceAlertUpdatePayload) => Promise<void>
  isLoadingTrackedSymbols?: boolean
  onTrackSymbol?: (symbol: string) => Promise<void>
  onUntrackSymbol?: (symbol: string) => Promise<void>
  onUnauthorized?: (message: string) => void
  riskProfile?: RiskProfile | null
  token?: string
  trackedSymbols?: WatchlistItemDetailedOut[]
}

export function InstrumentPage({
  onCreateAlert,
  onDeleteAlert,
  onUpdateAlert,
  isLoadingTrackedSymbols = false,
  onTrackSymbol,
  onUnauthorized,
  onUntrackSymbol,
  riskProfile,
  token,
  trackedSymbols = [],
}: InstrumentPageProps) {
  const { preferences } = useMarketPreferences()
  const params = useParams()
  const symbol = params.symbol?.toUpperCase() ?? ''
  const onUnauthorizedRef = useRef(onUnauthorized)
  onUnauthorizedRef.current = onUnauthorized

  const [selectedRange, setSelectedRange] = useState<InstrumentRange>(
    () => preferences.defaultChartRange,
  )
  const [instrumentDetail, setInstrumentDetail] = useState<InstrumentDetailResponse | null>(null)
  const [instrumentError, setInstrumentError] = useState('')
  const [isLoadingInstrument, setIsLoadingInstrument] = useState(false)
  const [trackingError, setTrackingError] = useState('')
  const [trackingSuccess, setTrackingSuccess] = useState('')
  const [isUpdatingTrackedSymbol, setIsUpdatingTrackedSymbol] = useState(false)
  const [alertCondition, setAlertCondition] = useState<AlertCondition>('above')
  const [alertTargetPrice, setAlertTargetPrice] = useState('')
  const [alertError, setAlertError] = useState('')
  const [alertSuccess, setAlertSuccess] = useState('')
  const [isCreatingAlert, setIsCreatingAlert] = useState(false)
  const [isAlertFormOpen, setIsAlertFormOpen] = useState(false)

  // Existing alerts for this symbol
  const [symbolAlerts, setSymbolAlerts] = useState<PriceAlert[]>([])
  const [, setIsLoadingSymbolAlerts] = useState(false)
  const [symbolAlertActionId, setSymbolAlertActionId] = useState('')

  // Inline edit state
  const [editState, setEditState] = useState<{
    alertId: string
    condition: AlertCondition
    targetPrice: string
  } | null>(null)
  const [editError, setEditError] = useState('')

  const isTracked = trackedSymbols.some((item) => item.symbol === symbol)

  const loadSymbolAlerts = useCallback(async () => {
    if (!token || !symbol) {
      setSymbolAlerts([])
      return
    }

    setIsLoadingSymbolAlerts(true)
    try {
      const response = await fetchAlertsForSymbol(token, symbol)
      const allAlerts = [
        ...response.activeAlerts,
        ...response.pausedAlerts,
        ...response.triggeredAlerts,
      ]
      setSymbolAlerts(allAlerts)
    } catch {
      // Silently fail — alerts list is supplementary
    } finally {
      setIsLoadingSymbolAlerts(false)
    }
  }, [token, symbol])

  useEffect(() => {
    setSelectedRange(preferences.defaultChartRange)
  }, [preferences.defaultChartRange, symbol])

  useEffect(() => {
    setTrackingError('')
    setTrackingSuccess('')
    setIsUpdatingTrackedSymbol(false)
    setAlertCondition('above')
    setAlertTargetPrice('')
    setAlertError('')
    setAlertSuccess('')
    setIsCreatingAlert(false)
    setIsAlertFormOpen(false)
    setSymbolAlerts([])
    setEditState(null)
    setEditError('')
  }, [symbol])

  useEffect(() => {
    void loadSymbolAlerts()
  }, [loadSymbolAlerts])

  useEffect(() => {
    if (!instrumentDetail?.latestQuote.price || alertTargetPrice) {
      return
    }

    setAlertTargetPrice(instrumentDetail.latestQuote.price.toFixed(2))
  }, [alertTargetPrice, instrumentDetail?.latestQuote.price])

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
          onUnauthorizedRef.current?.('Your session expired. Log in again to view instrument charts.')
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

  async function handleCreateAlertSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!token || !onCreateAlert) {
      return
    }

    const parsedTargetPrice = Number.parseFloat(alertTargetPrice)
    if (!Number.isFinite(parsedTargetPrice) || parsedTargetPrice <= 0) {
      setAlertError('Please enter a price greater than zero.')
      setAlertSuccess('')
      return
    }

    const payload: PriceAlertCreatePayload = {
      symbol,
      condition: alertCondition,
      targetPrice: parsedTargetPrice,
    }

    setAlertError('')
    setAlertSuccess('')
    setIsCreatingAlert(true)

    try {
      await onCreateAlert(payload)
      setAlertSuccess(
        `Done! You'll be notified when ${symbol} goes ${alertCondition === 'above' ? 'above' : 'below'} ${formatCurrency(parsedTargetPrice)}.`,
      )
      setIsAlertFormOpen(false)
      void loadSymbolAlerts()
    } catch (error) {
      setAlertError(
        error instanceof Error ? error.message : 'Unable to create that alert right now.',
      )
    } finally {
      setIsCreatingAlert(false)
    }
  }

  async function handleDeleteSymbolAlert(alertId: string) {
    if (!onDeleteAlert) {
      return
    }

    setSymbolAlertActionId(alertId)
    try {
      await onDeleteAlert(alertId)
      void loadSymbolAlerts()
    } catch {
      // Error handled by parent
    } finally {
      setSymbolAlertActionId('')
    }
  }

  async function handleSaveEdit() {
    if (!editState || !onUpdateAlert) {
      return
    }

    const parsedPrice = Number.parseFloat(editState.targetPrice)
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setEditError('Enter a valid target price greater than zero.')
      return
    }

    setEditError('')
    setSymbolAlertActionId(editState.alertId)

    try {
      await onUpdateAlert(editState.alertId, {
        condition: editState.condition,
        targetPrice: parsedPrice,
      })
      setEditState(null)
      void loadSymbolAlerts()
    } catch (error) {
      setEditError(
        error instanceof Error ? error.message : 'Unable to update alert.',
      )
    } finally {
      setSymbolAlertActionId('')
    }
  }

  function formatAlertStatus(alert: PriceAlert) {
    if (alert.isActive) return 'Active'
    if (alert.triggeredAt) return 'Triggered'
    return 'Paused'
  }

  function alertStatusPill(alert: PriceAlert) {
    if (alert.isActive) return 'neutral-pill'
    if (alert.triggeredAt) return 'positive-pill'
    return 'warning-pill'
  }

  const quote = instrumentDetail?.latestQuote
  const priceChange = quote?.change ?? 0
  const isPositive = priceChange >= 0
  const priceChangeDisplay = formatPriceChangeWithPreferences(
    { change: quote?.change, changePercent: quote?.changePercent },
    preferences,
  )

  // Advisory logic
  const assetCategory = instrumentDetail?.assetCategory?.toLowerCase() ?? ''
  const isCrypto = assetCategory === 'crypto' || assetCategory === 'digital currency'
  const advisory = getRiskAdvisory(riskProfile ?? null, isCrypto, assetCategory)

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
              <span className="instrument-live-price">
                {formatCurrencyWithPreferences(quote.price, preferences)}
              </span>
              <span className={`instrument-price-change ${isPositive ? 'instrument-price-change--up' : 'instrument-price-change--down'}`}>
                {priceChangeDisplay}
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
      {alertError ? <p className="error-text">{alertError}</p> : null}
      {alertSuccess ? <p className="success-text">{alertSuccess}</p> : null}
      {editError ? <p className="error-text">{editError}</p> : null}
      {isLoadingInstrument && !instrumentDetail ? (
        <div className="instrument-loading">
          <div className="instrument-loading-spinner" />
          <p>Loading chart data for {symbol}...</p>
        </div>
      ) : null}

      {advisory ? (
        <div className={`instrument-advisory ${advisory.variant === 'caution' ? 'instrument-advisory--caution' : advisory.variant === 'info' ? 'instrument-advisory--info' : ''}`}>
          <span className="instrument-advisory-icon" aria-hidden="true">{advisory.icon}</span>
          <div className="instrument-advisory-body">
            <span className="instrument-advisory-title">{advisory.title}</span>
            <p className="instrument-advisory-text">{advisory.text}</p>
          </div>
        </div>
      ) : null}

      <section className="instrument-alert-card">
        <div className="panel-header">
          <div className="panel-header-copy">
            <p className="section-label">Price alert</p>
            <h2 className="panel-title">Get notified when {symbol} hits your price</h2>
          </div>
        </div>

        {token ? (
          isAlertFormOpen ? (
            <form className="instrument-alert-form instrument-alert-form--expanded" onSubmit={(event) => void handleCreateAlertSubmit(event)}>
              <label className="instrument-alert-field">
                <span className="instrument-alert-label">Notify me when price goes</span>
                <select
                  className="instrument-alert-select"
                  onChange={(event) => setAlertCondition(event.target.value as AlertCondition)}
                  value={alertCondition}
                >
                  <option value="above">Above this price</option>
                  <option value="below">Below this price</option>
                </select>
              </label>

              <label className="instrument-alert-field">
                <span className="instrument-alert-label">Price ($)</span>
                <input className="search-input instrument-alert-input" inputMode="decimal" min="0" onChange={(e) => setAlertTargetPrice(e.target.value)} placeholder="e.g. 200.00" step="0.01" type="number" value={alertTargetPrice} />
              </label>

              <div className="instrument-alert-submit">
                <button className="primary-action" disabled={isCreatingAlert} type="submit">
                  {isCreatingAlert ? 'Creating...' : 'Create alert'}
                </button>
                <button className="instrument-alert-cancel" onClick={() => setIsAlertFormOpen(false)} type="button">
                  Cancel
                </button>
              </div>
              <p className="panel-note">
                You'll get a notification when the price crosses your target while you're signed in.
              </p>
            </form>
          ) : (
            <div className="instrument-alert-prompt">
              <button
                className="primary-action"
                onClick={() => setIsAlertFormOpen(true)}
                type="button"
              >
                Create price alert
              </button>
              <p className="panel-note">
                Get notified when {symbol} reaches a price you choose.
              </p>
            </div>
          )
        ) : (
          <div className="instrument-alert-guest">
            <p className="panel-note">
              Sign in to set up alerts and get notified when {symbol} hits a price you choose.
            </p>
            <Link className="primary-action" to="/login">
              Log in to create alerts
            </Link>
          </div>
        )}

        {token && symbolAlerts.length > 0 ? (
          <div className="instrument-existing-alerts">
            <div className="panel-header-copy">
              <p className="section-label">Your alerts for {symbol}</p>
            </div>

            {symbolAlerts.map((alert) => {
              const isActionPending = symbolAlertActionId === alert.id
              const isEditing = editState?.alertId === alert.id

              if (isEditing && editState) {
                return (
                  <article className="instrument-alert-row instrument-alert-row--editing" key={alert.id}>
                    <div className="alert-edit-form">
                      <label className="alert-edit-field">
                        <span className="alert-edit-label">When price goes</span>
                        <select
                          className="alert-edit-select"
                          onChange={(e) =>
                            setEditState({ ...editState, condition: e.target.value as AlertCondition })
                          }
                          value={editState.condition}
                        >
                          <option value="above">Above this price</option>
                          <option value="below">Below this price</option>
                        </select>
                      </label>

                      <label className="alert-edit-field">
                        <span className="alert-edit-label">Price ($)</span>
                        <input
                          className="alert-edit-input"
                          inputMode="decimal"
                          min="0"
                          onChange={(e) =>
                            setEditState({ ...editState, targetPrice: e.target.value })
                          }
                          step="0.01"
                          type="number"
                          value={editState.targetPrice}
                        />
                      </label>
                    </div>

                    <div className="instrument-alert-row-actions">
                      <button
                        className="primary-action alert-inline-button"
                        disabled={isActionPending}
                        onClick={() => void handleSaveEdit()}
                        type="button"
                      >
                        {isActionPending ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        className="ghost-action alert-inline-button"
                        disabled={isActionPending}
                        onClick={() => { setEditState(null); setEditError('') }}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </article>
                )
              }

              return (
                <article className="instrument-alert-row" key={alert.id}>
                  <div className="instrument-alert-row-info">
                    <strong>{alert.condition === 'above' ? 'Above' : 'Below'} {alert.targetPrice != null ? formatCurrency(alert.targetPrice) : '--'}</strong>
                    <span className={alertStatusPill(alert)}>{formatAlertStatus(alert)}</span>
                  </div>
                  <div className="instrument-alert-row-actions">
                    {onUpdateAlert && alert.isActive ? (
                      <button
                        className="ghost-action alert-inline-button"
                        disabled={isActionPending}
                        onClick={() => {
                          setEditState({
                            alertId: alert.id,
                            condition: alert.condition,
                            targetPrice: (alert.targetPrice ?? 0).toString(),
                          })
                          setEditError('')
                        }}
                        type="button"
                      >
                        Edit
                      </button>
                    ) : null}
                    {onDeleteAlert ? (
                      <button
                        className="ghost-action alert-inline-button"
                        disabled={isActionPending}
                        onClick={() => void handleDeleteSymbolAlert(alert.id)}
                        type="button"
                      >
                        {isActionPending ? 'Removing...' : 'Remove'}
                      </button>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        ) : null}
      </section>

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
