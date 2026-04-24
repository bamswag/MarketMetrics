import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'

import { useMarketPreferences } from '../app/MarketPreferencesContext'
import { InstrumentChartCard } from '../components/InstrumentChartCard'
import { MoverLogo } from '../components/MoverLogo'
import { SimilarInstrumentsSection } from '../components/SimilarInstrumentsSection'
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
import { formatCurrencyWithPreferences } from '../lib/marketDisplay'
import { formatCurrency } from '../lib/formatters'
import '../styles/pages/InstrumentPage.css'

type AdvisoryMessage = {
  variant: 'caution' | 'info' | 'default'
  icon: string
  title: string
  text: string
} | null

const DEFAULT_PERCENT_CHANGE_THRESHOLD = '5'

function formatPercentThreshold(value: number): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`
}

function isEditableAlertCondition(condition: AlertCondition): boolean {
  return condition === 'above' || condition === 'below' || condition === 'percent_change'
}

function formatInstrumentAlertTarget(alert: PriceAlert): string {
  if (alert.condition === 'percent_change' && alert.targetPrice != null) {
    const referenceText = alert.referencePrice != null
      ? ` from ${formatCurrency(alert.referencePrice)}`
      : ''
    return `Moves by ${formatPercentThreshold(alert.targetPrice)}${referenceText}`
  }

  if (alert.condition === 'range_exit' && alert.lowerBound != null && alert.upperBound != null) {
    return `Outside ${formatCurrency(alert.lowerBound)} - ${formatCurrency(alert.upperBound)}`
  }

  const target = alert.targetPrice != null ? formatCurrency(alert.targetPrice) : '--'
  return `${alert.condition === 'above' ? 'Above' : 'Below'} ${target}`
}

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
    if (alertTargetPrice) {
      return
    }

    if (alertCondition === 'percent_change') {
      setAlertTargetPrice(DEFAULT_PERCENT_CHANGE_THRESHOLD)
      return
    }

    const latestPrice = instrumentDetail?.latestQuote.price
    if (typeof latestPrice !== 'number' || !Number.isFinite(latestPrice) || latestPrice <= 0) {
      return
    }

    setAlertTargetPrice(latestPrice.toFixed(2))
  }, [alertCondition, alertTargetPrice, instrumentDetail?.latestQuote.price])

  useEffect(() => {
    if (!symbol) {
      setInstrumentDetail(null)
      setInstrumentError('')
      return
    }

    const abortController = new AbortController()
    let cancelled = false

    async function loadInstrumentDetail() {
      setIsLoadingInstrument(true)
      setInstrumentError('')

      try {
        const response = await fetchInstrumentDetail(
          token,
          symbol,
          selectedRange,
          abortController.signal,
        )
        if (cancelled) {
          return
        }

        if (response.range !== selectedRange) {
          setSelectedRange(response.range)
        }
        setInstrumentDetail(response)
      } catch (error) {
        if (cancelled) {
          return
        }

        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        if (error instanceof ApiError && error.status === 401) {
          onUnauthorizedRef.current?.('Your session expired. Log in again to view instrument charts.')
          return
        }

        setInstrumentError(
          error instanceof Error
            ? error.message
            : 'Unable to load instrument details.',
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
      abortController.abort()
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

  function handleAlertConditionChange(nextCondition: AlertCondition) {
    setAlertCondition(nextCondition)
    setAlertError('')
    setAlertSuccess('')

    if (nextCondition === 'percent_change') {
      setAlertTargetPrice(DEFAULT_PERCENT_CHANGE_THRESHOLD)
      return
    }

    const latestPrice = instrumentDetail?.latestQuote.price
    if (typeof latestPrice === 'number' && Number.isFinite(latestPrice) && latestPrice > 0) {
      setAlertTargetPrice(latestPrice.toFixed(2))
      return
    }

    setAlertTargetPrice('')
  }

  async function handleCreateAlertSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!token || !onCreateAlert) {
      return
    }

    const parsedTargetPrice = Number.parseFloat(alertTargetPrice)
    if (!Number.isFinite(parsedTargetPrice) || parsedTargetPrice <= 0) {
      setAlertError(
        alertCondition === 'percent_change'
          ? 'Please enter a percent greater than zero.'
          : 'Please enter a price greater than zero.',
      )
      setAlertSuccess('')
      return
    }

    const latestPrice = instrumentDetail?.latestQuote.price
    const referencePrice =
      typeof latestPrice === 'number' && Number.isFinite(latestPrice) && latestPrice > 0
        ? latestPrice
        : null

    if (alertCondition === 'percent_change' && referencePrice == null) {
      setAlertError('Live reference price is unavailable. Reload the quote before creating a percent-change alert.')
      setAlertSuccess('')
      return
    }

    const payload: PriceAlertCreatePayload = {
      symbol,
      condition: alertCondition,
      targetPrice: parsedTargetPrice,
    }

    if (alertCondition === 'percent_change' && referencePrice != null) {
      payload.referencePrice = referencePrice
    }

    setAlertError('')
    setAlertSuccess('')
    setIsCreatingAlert(true)

    try {
      await onCreateAlert(payload)
      setAlertSuccess(
        alertCondition === 'percent_change' && referencePrice != null
          ? `Done! You'll be notified when ${symbol} moves by ${formatPercentThreshold(parsedTargetPrice)} from ${formatCurrency(referencePrice)}.`
          : `Done! You'll be notified when ${symbol} goes ${alertCondition === 'above' ? 'above' : 'below'} ${formatCurrency(parsedTargetPrice)}.`,
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
      setEditError(
        editState.condition === 'percent_change'
          ? 'Enter a valid percent greater than zero.'
          : 'Enter a valid target price greater than zero.',
      )
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
  const liveReferencePrice =
    typeof quote?.price === 'number' && Number.isFinite(quote.price) && quote.price > 0
      ? quote.price
      : null
  const isPercentAlertDraft = alertCondition === 'percent_change'
  const priceChange = quote?.change ?? 0
  const isPositive = priceChange >= 0
  // Always show both dollar change + percent in the hero so the label is self-explanatory
  const heroDayChange = (() => {
    if (!quote) return null
    const sign = isPositive ? '+' : ''
    const dollar = quote.change != null ? `${sign}$${quote.change.toFixed(2)}` : null
    const pct = quote.changePercent ?? null
    if (dollar && pct) return `${dollar} (${pct})`
    return dollar ?? pct ?? null
  })()

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
              {heroDayChange && (
                <span className={`instrument-price-change ${isPositive ? 'instrument-price-change--up' : 'instrument-price-change--down'}`}>
                  {heroDayChange}
                </span>
              )}
              <span className="instrument-price-date">
                Today's change · Last traded {quote.latestTradingDay ?? '--'}
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
                <span className="instrument-alert-label">Notify me when price</span>
                <select
                  className="instrument-alert-select"
                  onChange={(event) => handleAlertConditionChange(event.target.value as AlertCondition)}
                  value={alertCondition}
                >
                  <option value="above">Goes above this price</option>
                  <option value="below">Goes below this price</option>
                  <option value="percent_change">Moves by this percent</option>
                </select>
              </label>

              <label className="instrument-alert-field">
                <span className="instrument-alert-label">
                  {isPercentAlertDraft ? 'Move threshold (%)' : 'Price ($)'}
                </span>
                <input
                  className="search-input instrument-alert-input"
                  inputMode="decimal"
                  min="0"
                  onChange={(e) => setAlertTargetPrice(e.target.value)}
                  placeholder={isPercentAlertDraft ? 'e.g. 5' : 'e.g. 200.00'}
                  step={isPercentAlertDraft ? '0.1' : '0.01'}
                  type="number"
                  value={alertTargetPrice}
                />
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
                {isPercentAlertDraft
                  ? liveReferencePrice != null
                    ? `Reference price locks to the current quote: ${formatCurrency(liveReferencePrice)}.`
                    : 'A live quote is needed before creating a percent-change alert.'
                  : "You'll get a notification when the price crosses your target while you're signed in."}
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
              const canEditAlert = alert.targetPrice != null && isEditableAlertCondition(alert.condition)

              if (isEditing && editState) {
                const isPercentEdit = editState.condition === 'percent_change'

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
                          {isPercentEdit ? (
                            <option value="percent_change">Moves by this percent</option>
                          ) : (
                            <>
                              <option value="above">Above this price</option>
                              <option value="below">Below this price</option>
                            </>
                          )}
                        </select>
                      </label>

                      <label className="alert-edit-field">
                        <span className="alert-edit-label">
                          {isPercentEdit ? 'Move threshold (%)' : 'Price ($)'}
                        </span>
                        <input
                          className="alert-edit-input"
                          inputMode="decimal"
                          min="0"
                          onChange={(e) =>
                            setEditState({ ...editState, targetPrice: e.target.value })
                          }
                          step={isPercentEdit ? '0.1' : '0.01'}
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
                    <strong>{formatInstrumentAlertTarget(alert)}</strong>
                    <span className={alertStatusPill(alert)}>{formatAlertStatus(alert)}</span>
                  </div>
                  <div className="instrument-alert-row-actions">
                    {onUpdateAlert && alert.isActive && canEditAlert ? (
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

      {instrumentDetail ? (
        <SimilarInstrumentsSection
          assetCategory={instrumentDetail.assetCategory}
          instrumentName={instrumentDetail.companyName}
          symbol={instrumentDetail.symbol}
        />
      ) : null}

      {instrumentDetail && !isLoadingInstrument ? (
        <div className="instrument-cta-group">
          <div className="instrument-forecast-cta">
            <div className="instrument-forecast-cta-info">
              <h3 className="instrument-forecast-cta-heading">AI Price Forecast</h3>
              <p className="instrument-forecast-cta-sub">
                See where {symbol} could be heading — powered by a trained ML model.
              </p>
            </div>
            {token ? (
              <Link
                className="primary-action primary-action--teal instrument-cta-action"
                to={`/forecast/${encodeURIComponent(symbol)}`}
              >
                <span>Run forecast</span>
              </Link>
            ) : (
              <span className="instrument-forecast-cta-lock">Sign in to run forecasts</span>
            )}
          </div>
          <div className="instrument-forecast-cta instrument-forecast-cta--simulator">
            <div className="instrument-forecast-cta-info">
              <h3 className="instrument-forecast-cta-heading">Investment Simulator</h3>
              <p className="instrument-forecast-cta-sub">
                Project long-term growth with Monte Carlo scenarios — up to 50 years out.
              </p>
            </div>
            {token ? (
              <Link
                className="primary-action primary-action--teal instrument-cta-action"
                to={`/instrument/${encodeURIComponent(symbol)}/project`}
              >
                <span>Simulate</span>
              </Link>
            ) : (
              <span className="instrument-forecast-cta-lock">Sign in to simulate</span>
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}
