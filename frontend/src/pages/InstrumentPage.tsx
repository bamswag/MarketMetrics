import { useEffect, useEffectEvent, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'

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
  WatchlistItemDetailedOut,
} from '../lib/api'
import { formatCurrency } from '../lib/formatters'
import '../styles/pages/InstrumentPage.css'

type InstrumentPageProps = {
  onCreateAlert?: (payload: PriceAlertCreatePayload) => Promise<unknown>
  onDeleteAlert?: (alertId: string) => Promise<void>
  onUpdateAlert?: (alertId: string, payload: PriceAlertUpdatePayload) => Promise<void>
  isLoadingTrackedSymbols?: boolean
  onTrackSymbol?: (symbol: string) => Promise<void>
  onUntrackSymbol?: (symbol: string) => Promise<void>
  onUnauthorized?: (message: string) => void
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
  const [alertCondition, setAlertCondition] = useState<AlertCondition>('above')
  const [alertTargetPrice, setAlertTargetPrice] = useState('')
  const [alertError, setAlertError] = useState('')
  const [alertSuccess, setAlertSuccess] = useState('')
  const [isCreatingAlert, setIsCreatingAlert] = useState(false)
  const [isAlertFormOpen, setIsAlertFormOpen] = useState(false)

  // Existing alerts for this symbol
  const [symbolAlerts, setSymbolAlerts] = useState<PriceAlert[]>([])
  const [isLoadingSymbolAlerts, setIsLoadingSymbolAlerts] = useState(false)
  const [symbolAlertActionId, setSymbolAlertActionId] = useState('')

  // Inline edit state
  const [editState, setEditState] = useState<{
    alertId: string
    condition: AlertCondition
    targetPrice: string
  } | null>(null)
  const [editError, setEditError] = useState('')

  const isTracked = trackedSymbols.some((item) => item.symbol === symbol)

  const loadSymbolAlerts = useEffectEvent(async () => {
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
  })

  useEffect(() => {
    setSelectedRange('6M')
  }, [symbol])

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
  }, [symbol, token, loadSymbolAlerts])

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

  async function handleCreateAlertSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!token || !onCreateAlert) {
      return
    }

    const parsedTargetPrice = Number.parseFloat(alertTargetPrice)
    if (!Number.isFinite(parsedTargetPrice) || parsedTargetPrice <= 0) {
      setAlertError('Enter a valid target price greater than zero.')
      setAlertSuccess('')
      return
    }

    setAlertError('')
    setAlertSuccess('')
    setIsCreatingAlert(true)

    try {
      await onCreateAlert({
        symbol,
        condition: alertCondition,
        targetPrice: parsedTargetPrice,
      })
      setAlertSuccess(
        `${symbol} will now notify you when price moves ${alertCondition} ${formatCurrency(parsedTargetPrice)}.`,
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

  function formatAlertCondition(condition: string) {
    return condition === 'above' ? 'Above' : 'Below'
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
      {alertError ? <p className="error-text">{alertError}</p> : null}
      {alertSuccess ? <p className="success-text">{alertSuccess}</p> : null}
      {editError ? <p className="error-text">{editError}</p> : null}
      {isLoadingInstrument && !instrumentDetail ? (
        <div className="instrument-loading">
          <div className="instrument-loading-spinner" />
          <p>Loading chart data for {symbol}...</p>
        </div>
      ) : null}

      <section className="instrument-alert-card">
        <div className="panel-header">
          <div className="panel-header-copy">
            <p className="section-label">Price alert</p>
            <h2 className="panel-title">Arm a live threshold for {symbol}</h2>
          </div>
          <span className="panel-tag">Realtime monitor</span>
        </div>

        {token ? (
          isAlertFormOpen ? (
            <form className="instrument-alert-form" onSubmit={(event) => void handleCreateAlertSubmit(event)}>
              <label className="instrument-alert-field">
                <span className="instrument-alert-label">Condition</span>
                <select
                  className="instrument-alert-select"
                  onChange={(event) => setAlertCondition(event.target.value as AlertCondition)}
                  value={alertCondition}
                >
                  <option value="above">Above target</option>
                  <option value="below">Below target</option>
                </select>
              </label>

              <label className="instrument-alert-field">
                <span className="instrument-alert-label">Target price</span>
                <input
                  className="search-input instrument-alert-input"
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => setAlertTargetPrice(event.target.value)}
                  placeholder="Enter target price"
                  step="0.01"
                  type="number"
                  value={alertTargetPrice}
                />
              </label>

              <div className="instrument-alert-submit">
                <button
                  className="primary-action"
                  disabled={isCreatingAlert}
                  type="submit"
                >
                  {isCreatingAlert ? 'Creating alert...' : 'Create alert'}
                </button>
                <button
                  className="instrument-alert-cancel"
                  onClick={() => setIsAlertFormOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
              <p className="panel-note">
                Alerts stay armed while you are signed in and using the app.
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
                Get notified when {symbol} reaches a target price.
              </p>
            </div>
          )
        ) : (
          <div className="instrument-alert-guest">
            <p className="panel-note">
              Sign in to create alerts and get notified when {symbol} reaches a target price.
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
                        <span className="alert-edit-label">Condition</span>
                        <select
                          className="alert-edit-select"
                          onChange={(e) =>
                            setEditState({ ...editState, condition: e.target.value as AlertCondition })
                          }
                          value={editState.condition}
                        >
                          <option value="above">Above target</option>
                          <option value="below">Below target</option>
                        </select>
                      </label>

                      <label className="alert-edit-field">
                        <span className="alert-edit-label">Target price</span>
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
                    <strong>{formatAlertCondition(alert.condition)} {formatCurrency(alert.targetPrice)}</strong>
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
                            targetPrice: alert.targetPrice.toString(),
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
                        {isActionPending ? 'Removing...' : 'Delete'}
                      </button>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        ) : token && isLoadingSymbolAlerts ? (
          <p className="panel-note">Loading existing alerts...</p>
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
