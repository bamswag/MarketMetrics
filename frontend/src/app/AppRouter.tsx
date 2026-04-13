import { lazy, Suspense, useEffect, useEffectEvent, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'

import { AlertToastStack } from '../components/AlertToastStack'
import type { AlertToast } from '../components/AlertToastStack'
import { AppHeader } from '../components/AppHeader'
import { AuthActions } from '../components/AuthActions'
import { GlobalSearch } from '../components/GlobalSearch'
import { DashboardPage } from '../pages/DashboardPage'
import { LandingPage } from '../pages/LandingPage'
import { LoginPage } from '../pages/LoginPage'
import { SignupPage } from '../pages/SignupPage'
import { TrackedSymbolsPage } from '../pages/TrackedSymbolsPage'
import { UserMenu } from '../components/UserMenu'
import {
  ApiError,
  buildWebSocketUrl,
  createAlert,
  createWatchlistItem,
  deleteAlert,
  deleteWatchlistItem,
  fetchAlerts,
  fetchCurrentUser,
  fetchMovers,
  fetchWatchlist,
  getApiUrl,
  login,
  pauseAlert,
  register,
  resetAlert,
  resumeAlert,
  updateAlert,
} from '../lib/api'
import type {
  AlertWebSocketMessage,
  AlertListResponse,
  MoversResponse,
  PriceAlertCreatePayload,
  PriceAlertUpdatePayload,
  UserOut,
  WatchlistItemDetailedOut,
} from '../lib/api'
import { formatCurrency } from '../lib/formatters'
import { AccountPage } from '../pages/AccountPage'
import { SettingsPage } from '../pages/SettingsPage'

const InstrumentPage = lazy(() =>
  import('../pages/InstrumentPage').then((module) => ({ default: module.InstrumentPage })),
)

type DashboardData = {
  alerts: AlertListResponse | null
  movers: MoversResponse | null
  watchlist: WatchlistItemDetailedOut[]
}

type AuthRedirectPayload = {
  redirectedAuthError: string | null
  redirectedToken: string | null
}

type NotificationPermissionState = NotificationPermission | 'unsupported'

type PendingAlertAction = 'delete' | 'reset' | 'pause' | 'resume' | 'edit' | null

const initialDashboardData: DashboardData = {
  alerts: null,
  movers: null,
  watchlist: [],
}

const DASHBOARD_CACHE_TTL_MS = 30_000

type DashboardCacheEntry = {
  token: string
  expiresAt: number
  data: DashboardData
  user: UserOut
}

let dashboardCache: DashboardCacheEntry | null = null

function getInitialNotificationPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported'
  }

  return window.Notification.permission
}

function readAuthRedirectPayload(): AuthRedirectPayload {
  if (typeof window === 'undefined') {
    return {
      redirectedAuthError: null,
      redirectedToken: null,
    }
  }

  const rawHash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash

  if (!rawHash) {
    return {
      redirectedAuthError: null,
      redirectedToken: null,
    }
  }

  const hashParams = new URLSearchParams(rawHash)
  return {
    redirectedAuthError: hashParams.get('authError'),
    redirectedToken: hashParams.get('token'),
  }
}

function RouteLoadingState() {
  return <div className="empty-state page-loader">Loading interface...</div>
}

function AppContent() {
  const navigate = useNavigate()
  const apiUrl = getApiUrl()
  const googleAuthUrl = `${apiUrl}/auth/google/login?returnTo=/dashboard`
  const initialRedirectPayloadRef = useRef(readAuthRedirectPayload())
  const initialRedirectPayload = initialRedirectPayloadRef.current

  const [token, setToken] = useState(
    () => initialRedirectPayload.redirectedToken ?? localStorage.getItem('marketmetrics.token') ?? '',
  )
  const [currentUser, setCurrentUser] = useState<UserOut | null>(null)
  const [flashMessage, setFlashMessage] = useState(
    () => (initialRedirectPayload.redirectedToken ? 'Signed in successfully.' : ''),
  )
  const [authRedirectError, setAuthRedirectError] = useState(
    () => initialRedirectPayload.redirectedAuthError ?? '',
  )

  const [dashboardData, setDashboardData] = useState<DashboardData>(initialDashboardData)
  const [dashboardError, setDashboardError] = useState('')
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false)
  const [landingMovers, setLandingMovers] = useState<MoversResponse | null>(null)
  const [landingMoversError, setLandingMoversError] = useState('')
  const [isLoadingLandingMovers, setIsLoadingLandingMovers] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionState>(
    () => getInitialNotificationPermission(),
  )
  const [alertToasts, setAlertToasts] = useState<AlertToast[]>([])
  const [alertActionError, setAlertActionError] = useState('')
  const [pendingAlertActionId, setPendingAlertActionId] = useState('')
  const [pendingAlertAction, setPendingAlertAction] = useState<PendingAlertAction>(null)

  const alertSocketsRef = useRef<Map<string, WebSocket>>(new Map())
  const alertReconnectTimersRef = useRef<Map<string, number>>(new Map())
  const triggeredAlertIdsRef = useRef<Set<string>>(new Set())

  const handleSessionExpired = useEffectEvent((message: string) => {
    for (const timeoutId of alertReconnectTimersRef.current.values()) {
      window.clearTimeout(timeoutId)
    }
    alertReconnectTimersRef.current.clear()

    for (const socket of alertSocketsRef.current.values()) {
      socket.close()
    }
    alertSocketsRef.current.clear()

    triggeredAlertIdsRef.current.clear()
    localStorage.removeItem('marketmetrics.token')
    dashboardCache = null
    setToken('')
    setCurrentUser(null)
    setDashboardData(initialDashboardData)
    setDashboardError('')
    setAlertActionError('')
    setPendingAlertActionId('')
    setPendingAlertAction(null)
    setAlertToasts([])
    setFlashMessage('')
    setAuthRedirectError(message)
    navigate('/login')
  })

  useEffect(() => {
    if (
      !initialRedirectPayload.redirectedToken &&
      !initialRedirectPayload.redirectedAuthError
    ) {
      return
    }

    if (initialRedirectPayload.redirectedToken) {
      localStorage.setItem('marketmetrics.token', initialRedirectPayload.redirectedToken)
    }

    if (initialRedirectPayload.redirectedAuthError) {
      navigate('/login', { replace: true })
    }

    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }, [
    initialRedirectPayload.redirectedAuthError,
    initialRedirectPayload.redirectedToken,
    navigate,
  ])

  useEffect(() => {
    if (!flashMessage) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setFlashMessage('')
    }, 4200)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [flashMessage])

  useEffect(() => {
    if (token) {
      return
    }

    let cancelled = false

    async function loadLandingMovers() {
      setIsLoadingLandingMovers(true)
      setLandingMoversError('')

      try {
        const movers = await fetchMovers(undefined, 3)
        if (cancelled) {
          return
        }

        setLandingMovers(movers)
      } catch (error) {
        if (cancelled) {
          return
        }

        setLandingMovers(null)
        setLandingMoversError(
          error instanceof Error ? error.message : 'Unable to load today\'s movers.',
        )
      } finally {
        if (!cancelled) {
          setIsLoadingLandingMovers(false)
        }
      }
    }

    void loadLandingMovers()

    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (!token) {
      setDashboardData(initialDashboardData)
      setCurrentUser(null)
      dashboardCache = null
      return
    }

    const now = Date.now()
    if (
      dashboardCache &&
      dashboardCache.token === token &&
      dashboardCache.expiresAt > now
    ) {
      setCurrentUser(dashboardCache.user)
      setDashboardData(dashboardCache.data)
      setDashboardError('')
      setIsLoadingDashboard(false)
      return
    }

    const abortController = new AbortController()
    let cancelled = false

    async function loadDashboard() {
      setIsLoadingDashboard(true)
      setDashboardError('')

      try {
        const [userProfile, movers, watchlist, alerts] = await Promise.all([
          fetchCurrentUser(token, abortController.signal),
          fetchMovers(token, 3, abortController.signal),
          fetchWatchlist(token, abortController.signal),
          fetchAlerts(token, abortController.signal),
        ])

        if (cancelled) {
          return
        }

        const nextData: DashboardData = { movers, watchlist, alerts }
        dashboardCache = {
          token,
          expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
          data: nextData,
          user: userProfile,
        }
        setCurrentUser(userProfile)
        setDashboardData(nextData)
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === 'AbortError')) {
          return
        }

        if (error instanceof ApiError && error.status === 401) {
          dashboardCache = null
          handleSessionExpired('Your session expired. Log in again to reload the dashboard.')
          return
        }

        setDashboardError(
          error instanceof Error ? error.message : 'Unable to load dashboard data.',
        )
      } finally {
        if (!cancelled) {
          setIsLoadingDashboard(false)
        }
      }
    }

    void loadDashboard()

    return () => {
      cancelled = true
      abortController.abort()
    }
  }, [token])

  function updateDashboardDataCache(
    activeToken: string,
    buildNextData: (currentData: DashboardData) => DashboardData,
  ) {
    setDashboardData((currentData) => {
      const nextData = buildNextData(currentData)
      if (dashboardCache && dashboardCache.token === activeToken) {
        dashboardCache = { ...dashboardCache, data: nextData }
      }
      return nextData
    })
  }

  async function refreshWatchlist(activeToken: string) {
    const updatedWatchlist = await fetchWatchlist(activeToken)
    updateDashboardDataCache(activeToken, (currentData) => ({
      ...currentData,
      watchlist: updatedWatchlist,
    }))
  }

  async function refreshAlertWorkspaceData(activeToken: string) {
    const [updatedAlerts, updatedWatchlist] = await Promise.all([
      fetchAlerts(activeToken),
      fetchWatchlist(activeToken),
    ])

    updateDashboardDataCache(activeToken, (currentData) => ({
      ...currentData,
      alerts: updatedAlerts,
      watchlist: updatedWatchlist,
    }))
  }

  async function completeAuthentication(nextToken: string, successMessage: string) {
    localStorage.setItem('marketmetrics.token', nextToken)
    setToken(nextToken)
    setFlashMessage(successMessage)
    setAuthRedirectError('')
    setDashboardError('')
    navigate('/dashboard')
  }

  async function handleEmailLogin(email: string, password: string) {
    const response = await login(email, password)
    await completeAuthentication(response.access_token, 'Signed in successfully.')
  }

  async function handleEmailSignup(payload: {
    displayName: string
    email: string
    password: string
  }) {
    await register(payload)
    const response = await login(payload.email, payload.password)
    await completeAuthentication(response.access_token, 'Account created and signed in.')
  }

  function handleLogout() {
    for (const timeoutId of alertReconnectTimersRef.current.values()) {
      window.clearTimeout(timeoutId)
    }
    alertReconnectTimersRef.current.clear()

    for (const socket of alertSocketsRef.current.values()) {
      socket.close()
    }
    alertSocketsRef.current.clear()

    triggeredAlertIdsRef.current.clear()
    localStorage.removeItem('marketmetrics.token')
    dashboardCache = null
    setToken('')
    setCurrentUser(null)
    setDashboardData(initialDashboardData)
    setDashboardError('')
    setAlertActionError('')
    setPendingAlertActionId('')
    setPendingAlertAction(null)
    setAlertToasts([])
    setFlashMessage('')
    setAuthRedirectError('')
    navigate('/')
  }

  async function handleAddWatchlistSymbol(symbol: string) {
    if (!token) {
      throw new Error('Log in first to add symbols to your watchlist.')
    }

    try {
      await createWatchlistItem(token, symbol)
      await refreshWatchlist(token)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleSessionExpired('Your session expired. Log in again to manage your watchlist.')
      }

      throw error
    }
  }

  async function handleRemoveWatchlistSymbol(symbol: string) {
    if (!token) {
      throw new Error('Log in first to manage your watchlist.')
    }

    try {
      await deleteWatchlistItem(token, symbol)
      await refreshWatchlist(token)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleSessionExpired('Your session expired. Log in again to manage your watchlist.')
      }

      throw error
    }
  }

  const dismissAlertToast = useEffectEvent((toastId: string) => {
    setAlertToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== toastId))
  })

  useEffect(() => {
    if (alertToasts.length === 0) {
      return
    }

    const timeoutIds = alertToasts.map((toast) =>
      window.setTimeout(() => {
        dismissAlertToast(toast.id)
      }, 7000),
    )

    return () => {
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId))
    }
  }, [alertToasts, dismissAlertToast])

  const showTriggeredAlertNotification = useEffectEvent((toast: AlertToast) => {
    setAlertToasts((currentToasts) => {
      const nextToasts = currentToasts.filter((currentToast) => currentToast.id !== toast.id)
      return [toast, ...nextToasts].slice(0, 4)
    })

    if (
      notificationPermission === 'granted' &&
      typeof window !== 'undefined' &&
      'Notification' in window
    ) {
      try {
        void new window.Notification(`${toast.symbol} alert triggered`, {
          body: `${toast.symbol} moved ${toast.condition} ${formatCurrency(toast.targetPrice)}.`,
        })
      } catch {
        // Keep the in-app toast as the reliable fallback.
      }
    }
  })

  async function handleRequestNotificationPermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported')
      return
    }

    const permission = await window.Notification.requestPermission()
    setNotificationPermission(permission)
  }

  const closeAlertSocket = useEffectEvent((symbol: string) => {
    const reconnectTimer = alertReconnectTimersRef.current.get(symbol)
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer)
      alertReconnectTimersRef.current.delete(symbol)
    }

    const existingSocket = alertSocketsRef.current.get(symbol)
    if (existingSocket) {
      alertSocketsRef.current.delete(symbol)
      existingSocket.close()
    }
  })

  const closeAllAlertSockets = useEffectEvent(() => {
    for (const symbol of Array.from(alertSocketsRef.current.keys())) {
      closeAlertSocket(symbol)
    }
  })

  const scheduleAlertSocketReconnect = useEffectEvent((symbol: string, retryInMs = 4000) => {
    if (!token || alertReconnectTimersRef.current.has(symbol)) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      alertReconnectTimersRef.current.delete(symbol)

      const stillActive = (dashboardData.alerts?.activeAlerts ?? []).some(
        (alert) => alert.symbol === symbol,
      )
      if (!token || !stillActive || alertSocketsRef.current.has(symbol)) {
        return
      }

      connectAlertSocket(symbol)
    }, retryInMs)

    alertReconnectTimersRef.current.set(symbol, timeoutId)
  })

  const handleAlertSocketClose = useEffectEvent(
    (symbol: string, socket: WebSocket, event: CloseEvent) => {
      if (alertSocketsRef.current.get(symbol) !== socket) {
        return
      }

      alertSocketsRef.current.delete(symbol)

      if (!token) {
        return
      }

      if (event.code === 4401) {
        handleSessionExpired('Your session expired. Log in again to keep monitoring alerts.')
        return
      }

      if (event.code === 4404) {
        return
      }

      const stillActive = (dashboardData.alerts?.activeAlerts ?? []).some(
        (alert) => alert.symbol === symbol,
      )
      if (stillActive) {
        scheduleAlertSocketReconnect(symbol)
      }
    },
  )

  const handleAlertSocketMessage = useEffectEvent((rawPayload: string) => {
    let payload: AlertWebSocketMessage

    try {
      payload = JSON.parse(rawPayload) as AlertWebSocketMessage
    } catch {
      return
    }

    if (payload.type !== 'alert_triggered') {
      return
    }

    if (triggeredAlertIdsRef.current.has(payload.data.id)) {
      return
    }

    triggeredAlertIdsRef.current.add(payload.data.id)
    showTriggeredAlertNotification({
      id: payload.data.id,
      symbol: payload.data.symbol,
      condition: payload.data.condition,
      targetPrice: payload.data.targetPrice,
      triggeredAt: payload.data.triggeredAt,
    })

    if (!token) {
      return
    }

    void refreshAlertWorkspaceData(token).catch((error) => {
      if (error instanceof ApiError && error.status === 401) {
        handleSessionExpired('Your session expired. Log in again to keep monitoring alerts.')
      }
    })
  })

  const connectAlertSocket = useEffectEvent((symbol: string) => {
    if (!token || alertSocketsRef.current.has(symbol)) {
      return
    }

    const socket = new WebSocket(
      buildWebSocketUrl(`/ws/quotes/${encodeURIComponent(symbol)}`, token),
    )

    alertSocketsRef.current.set(symbol, socket)

    socket.onmessage = (event) => {
      handleAlertSocketMessage(event.data)
    }
    socket.onclose = (event) => {
      handleAlertSocketClose(symbol, socket, event)
    }
    socket.onerror = () => {
      // Allow the close handler to manage retries. Keeping this silent avoids noisy duplicate alerts.
    }
  })

  useEffect(() => {
    if (!token) {
      closeAllAlertSockets()
      return
    }

    const activeSymbols = Array.from(
      new Set((dashboardData.alerts?.activeAlerts ?? []).map((alert) => alert.symbol)),
    )
    const activeSymbolSet = new Set(activeSymbols)

    for (const symbol of Array.from(alertSocketsRef.current.keys())) {
      if (!activeSymbolSet.has(symbol)) {
        closeAlertSocket(symbol)
      }
    }

    for (const [symbol, timeoutId] of Array.from(alertReconnectTimersRef.current.entries())) {
      if (!activeSymbolSet.has(symbol)) {
        window.clearTimeout(timeoutId)
        alertReconnectTimersRef.current.delete(symbol)
      }
    }

    for (const symbol of activeSymbols) {
      if (!alertSocketsRef.current.has(symbol) && !alertReconnectTimersRef.current.has(symbol)) {
        connectAlertSocket(symbol)
      }
    }
  }, [closeAlertSocket, closeAllAlertSockets, connectAlertSocket, dashboardData.alerts, token])

  useEffect(() => {
    return () => {
      closeAllAlertSockets()
      for (const timeoutId of alertReconnectTimersRef.current.values()) {
        window.clearTimeout(timeoutId)
      }
      alertReconnectTimersRef.current.clear()
    }
  }, [closeAllAlertSockets])

  async function handleCreatePriceAlert(payload: PriceAlertCreatePayload) {
    if (!token) {
      throw new Error('Log in first to create price alerts.')
    }

    setAlertActionError('')

    try {
      const createdAlert = await createAlert(token, payload)
      triggeredAlertIdsRef.current.delete(createdAlert.id)
      await refreshAlertWorkspaceData(token)
      return createdAlert
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleSessionExpired('Your session expired. Log in again to manage alerts.')
      }

      throw error
    }
  }

  async function handleDeleteAlert(alertId: string) {
    if (!token) {
      return
    }

    setAlertActionError('')
    setPendingAlertActionId(alertId)
    setPendingAlertAction('delete')

    try {
      await deleteAlert(token, alertId)
      triggeredAlertIdsRef.current.delete(alertId)
      setAlertToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== alertId))
      await refreshAlertWorkspaceData(token)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleSessionExpired('Your session expired. Log in again to manage alerts.')
        return
      }

      setAlertActionError(
        error instanceof Error ? error.message : 'Unable to remove that alert right now.',
      )
    } finally {
      setPendingAlertActionId('')
      setPendingAlertAction(null)
    }
  }

  async function handleResetAlert(alertId: string) {
    if (!token) {
      return
    }

    setAlertActionError('')
    setPendingAlertActionId(alertId)
    setPendingAlertAction('reset')

    try {
      await resetAlert(token, alertId)
      triggeredAlertIdsRef.current.delete(alertId)
      setAlertToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== alertId))
      await refreshAlertWorkspaceData(token)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleSessionExpired('Your session expired. Log in again to manage alerts.')
        return
      }

      setAlertActionError(
        error instanceof Error ? error.message : 'Unable to reset that alert right now.',
      )
    } finally {
      setPendingAlertActionId('')
      setPendingAlertAction(null)
    }
  }

  async function handlePauseAlert(alertId: string) {
    if (!token) {
      return
    }

    setAlertActionError('')
    setPendingAlertActionId(alertId)
    setPendingAlertAction('pause')

    try {
      await pauseAlert(token, alertId)
      await refreshAlertWorkspaceData(token)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleSessionExpired('Your session expired. Log in again to manage alerts.')
        return
      }

      setAlertActionError(
        error instanceof Error ? error.message : 'Unable to pause that alert right now.',
      )
    } finally {
      setPendingAlertActionId('')
      setPendingAlertAction(null)
    }
  }

  async function handleResumeAlert(alertId: string) {
    if (!token) {
      return
    }

    setAlertActionError('')
    setPendingAlertActionId(alertId)
    setPendingAlertAction('resume')

    try {
      await resumeAlert(token, alertId)
      await refreshAlertWorkspaceData(token)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleSessionExpired('Your session expired. Log in again to manage alerts.')
        return
      }

      setAlertActionError(
        error instanceof Error ? error.message : 'Unable to resume that alert right now.',
      )
    } finally {
      setPendingAlertActionId('')
      setPendingAlertAction(null)
    }
  }

  async function handleUpdateAlert(alertId: string, payload: PriceAlertUpdatePayload) {
    if (!token) {
      return
    }

    setAlertActionError('')
    setPendingAlertActionId(alertId)
    setPendingAlertAction('edit')

    try {
      await updateAlert(token, alertId, payload)
      await refreshAlertWorkspaceData(token)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleSessionExpired('Your session expired. Log in again to manage alerts.')
        return
      }

      setAlertActionError(
        error instanceof Error ? error.message : 'Unable to update that alert right now.',
      )
    } finally {
      setPendingAlertActionId('')
      setPendingAlertAction(null)
    }
  }

  const guestHeader = (
    <AppHeader
      actions={<AuthActions />}
      center={<GlobalSearch token={token || undefined} />}
    />
  )

  const authenticatedHeader = (
    <AppHeader
      actions={
        <>
          <span className="connected-chip">Connected</span>
          <UserMenu />
          <button className="ghost-action" onClick={handleLogout} type="button">
            Log out
          </button>
        </>
      }
      bannerMessage={flashMessage}
      center={<GlobalSearch onUnauthorized={handleSessionExpired} token={token} />}
    />
  )

  return (
    <>
      {token ? (
        <AlertToastStack onDismiss={dismissAlertToast} toasts={alertToasts} />
      ) : null}

      <Routes>
        <Route
          element={
            token ? (
              <Navigate replace to="/dashboard" />
            ) : (
              <>
                {guestHeader}
                <LandingPage
                  isLoadingMovers={isLoadingLandingMovers}
                  movers={landingMovers}
                  moversError={landingMoversError}
                />
              </>
            )
          }
          path="/"
        />
        <Route
          element={
            token ? (
              <Navigate replace to="/dashboard" />
            ) : (
              <>
                {guestHeader}
                <LoginPage
                  authError={authRedirectError}
                  googleAuthUrl={googleAuthUrl}
                  onClearAuthError={() => setAuthRedirectError('')}
                  onLogin={handleEmailLogin}
                />
              </>
            )
          }
          path="/login"
        />
        <Route
          element={
            token ? (
              <Navigate replace to="/dashboard" />
            ) : (
              <>
                {guestHeader}
                <SignupPage googleAuthUrl={googleAuthUrl} onRegister={handleEmailSignup} />
              </>
            )
          }
          path="/signup"
        />
        <Route
          element={
            token ? (
              <>
                {authenticatedHeader}
                <DashboardPage
                  alerts={dashboardData.alerts}
                  alertActionError={alertActionError}
                  currentUser={currentUser}
                  dashboardError={dashboardError}
                  isLoadingDashboard={isLoadingDashboard}
                  movers={dashboardData.movers}
                  notificationPermission={notificationPermission}
                  onDeleteAlert={handleDeleteAlert}
                  onEnableNotifications={handleRequestNotificationPermission}
                  onPauseAlert={handlePauseAlert}
                  onResetAlert={handleResetAlert}
                  onResumeAlert={handleResumeAlert}
                  onUpdateAlert={handleUpdateAlert}
                  pendingAlertAction={pendingAlertAction}
                  pendingAlertActionId={pendingAlertActionId}
                  watchlist={dashboardData.watchlist}
                />
              </>
            ) : (
              <Navigate replace to="/login" />
            )
          }
          path="/dashboard"
        />
        <Route
          element={
            token ? (
              <>
                {authenticatedHeader}
                <TrackedSymbolsPage
                  isLoading={isLoadingDashboard}
                  onRemoveSymbol={handleRemoveWatchlistSymbol}
                  trackedSymbols={dashboardData.watchlist}
                />
              </>
            ) : (
              <Navigate replace to="/login" />
            )
          }
          path="/tracked-symbols"
        />
        <Route
          element={
            token ? (
              <>
                {authenticatedHeader}
                <AccountPage currentUser={currentUser} />
              </>
            ) : (
              <Navigate replace to="/login" />
            )
          }
          path="/account"
        />
        <Route
          element={
            token ? (
              <>
                {authenticatedHeader}
                <SettingsPage currentUser={currentUser} />
              </>
            ) : (
              <Navigate replace to="/login" />
            )
          }
          path="/settings"
        />
        <Route
          element={
            <>
              {token ? authenticatedHeader : guestHeader}
              <Suspense fallback={<RouteLoadingState />}>
                <InstrumentPage
                  isLoadingTrackedSymbols={Boolean(token) && isLoadingDashboard}
                  onCreateAlert={handleCreatePriceAlert}
                  onTrackSymbol={handleAddWatchlistSymbol}
                  onUnauthorized={handleSessionExpired}
                  onUntrackSymbol={handleRemoveWatchlistSymbol}
                  token={token || undefined}
                  trackedSymbols={dashboardData.watchlist}
                />
              </Suspense>
            </>
          }
          path="/instrument/:symbol"
        />
        <Route path="*" element={<Navigate replace to={token ? '/dashboard' : '/'} />} />
      </Routes>
    </>
  )
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}
