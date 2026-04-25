import { lazy, Suspense, useEffect, useEffectEvent, useRef, useState, type ChangeEvent } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { AlertToastStack } from '../components/AlertToastStack'
import type { AlertToast } from '../components/AlertToastStack'
import { AppHeader } from '../components/AppHeader'
import { ScrollToTop } from '../components/ScrollToTop'
import { SideNav } from '../components/SideNav'
import '../styles/components/SideNav.css'
import { AuthActions } from '../components/AuthActions'
import { GlobalSearch } from '../components/GlobalSearch'
import { DashboardPage } from '../pages/DashboardPage'
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage'
import { GuidesPage } from '../pages/GuidesPage'
import { LandingPage } from '../pages/LandingPage'
import { LegalPage } from '../pages/LegalPage'
import { LoginPage } from '../pages/LoginPage'
import { MoversDirectionPage } from '../pages/MoversDirectionPage'
import { ResetPasswordPage } from '../pages/ResetPasswordPage'
import { SignupPage } from '../pages/SignupPage'
import { TrackedSymbolsPage } from '../pages/TrackedSymbolsPage'
import { UserMenu } from '../components/UserMenu'
import { VerifyEmailPage } from '../pages/VerifyEmailPage'
import {
  ApiError,
  buildWebSocketProtocols,
  buildWebSocketUrl,
  changePassword,
  createAlert,
  createWatchlistItem,
  bulkAlertAction,
  deleteAlert,
  deleteWatchlistItem,
  fetchAlerts,
  fetchCurrentUser,
  fetchMovers,
  fetchWatchlist,
  getApiUrl,
  login,
  logoutAllSessions,
  pauseAlert,
  requestPasswordReset,
  register,
  resetAlert,
  resetPassword,
  resumeAlert,
  updateAccountProfile,
  updateAlert,
  updateUserPreferences,
  verifyEmail,
} from '../lib/api'
import type {
  AlertWebSocketMessage,
  AlertListResponse,
  BulkAlertActionPayload,
  MoversResponse,
  PriceAlertCreatePayload,
  PriceAlertUpdatePayload,
  RiskProfile,
  UserOut,
  WatchlistItemDetailedOut,
} from '../lib/api'
import { formatCurrency } from '../lib/formatters'
import { AccountPage } from '../pages/AccountPage'
import { SettingsPage } from '../pages/SettingsPage'
import { SimulationHistoryPage } from '../pages/SimulationHistoryPage'
import { RiskProfileQuiz } from '../components/RiskProfileQuiz'

const InstrumentPage = lazy(() =>
  import('../pages/InstrumentPage').then((module) => ({ default: module.InstrumentPage })),
)

const SearchResultsPage = lazy(() =>
  import('../pages/SearchResultsPage').then((module) => ({ default: module.SearchResultsPage })),
)

const ForecastPage = lazy(() =>
  import('../pages/ForecastPage').then((module) => ({ default: module.ForecastPage })),
)

const GrowthProjectionPage = lazy(() =>
  import('../pages/GrowthProjectionPage').then((module) => ({ default: module.GrowthProjectionPage })),
)

const AdminUsersPage = lazy(() =>
  import('../pages/AdminUsersPage').then((module) => ({ default: module.AdminUsersPage })),
)

const AdminAuditLogsPage = lazy(() =>
  import('../pages/AdminAuditLogsPage').then((module) => ({ default: module.AdminAuditLogsPage })),
)

type DashboardData = {
  alerts: AlertListResponse | null
  movers: MoversResponse | null
  watchlist: WatchlistItemDetailedOut[]
}

type AuthRedirectPayload = {
  redirectedAuthError: string | null
  redirectedSuccessMessage: string | null
  redirectedToken: string | null
}

function formatPercentThreshold(value: number): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`
}

function formatAlertToastBody(toast: AlertToast): string {
  if (toast.condition === 'percent_change') {
    return `${toast.symbol} moved by ${toast.targetPrice != null ? formatPercentThreshold(toast.targetPrice) : 'its percent threshold'}.`
  }

  if (toast.condition === 'range_exit') {
    return `${toast.symbol} moved outside its alert range.`
  }

  return `${toast.symbol} moved ${toast.condition} ${toast.targetPrice != null ? formatCurrency(toast.targetPrice) : 'its target price'}.`
}

type NotificationPermissionState = NotificationPermission | 'unsupported'

type PendingAlertAction = 'delete' | 'reset' | 'pause' | 'resume' | 'edit' | null

const initialDashboardData: DashboardData = {
  alerts: null,
  movers: null,
  watchlist: [],
}

const DASHBOARD_CACHE_TTL_MS = 30_000
const TRIGGERED_ALERT_DEDUPE_TTL_MS = 6 * 60 * 60 * 1000
const TRIGGERED_ALERT_DEDUPE_MAX_SIZE = 500
const ALERT_SOCKET_RECONNECT_BASE_MS = 4_000
const ALERT_SOCKET_RECONNECT_MAX_MS = 120_000

type DashboardCacheEntry = {
  token: string
  expiresAt: number
  data: DashboardData
  user: UserOut
}

let dashboardCache: DashboardCacheEntry | null = null

const termsSections = [
  {
    title: 'Using the platform responsibly',
    body: 'MarketMetrics is designed for market research, watchlists, alerts, and educational simulator workflows. Keep your account secure, provide accurate signup information, and avoid abusing the platform or automated access routes.',
  },
  {
    title: 'Account and access',
    body: 'You are responsible for activity under your account and for maintaining the confidentiality of your credentials. We may suspend access if the service is misused or if security controls need to be enforced.',
  },
  {
    title: 'Market data and decisions',
    body: 'Displayed data, movers, charts, and simulator features are provided for informational use and product experience only. They should not be treated as guaranteed, complete, or personalized financial advice.',
  },
]

const privacySections = [
  {
    title: 'What we store',
    body: 'We store the account details and product preferences needed to run your workspace, including identity data, tracked symbols, alerts, and locally saved market defaults where supported.',
  },
  {
    title: 'Why we use it',
    body: 'Your information is used to authenticate access, personalize the dashboard, deliver account emails such as password resets or verification links, and keep your watchlists and alerts available across sessions.',
  },
  {
    title: 'Security and control',
    body: 'We use authenticated access tokens and session invalidation controls to protect accounts. You can update editable profile details, reset your password, and review account metadata directly from the account center.',
  },
]

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
      redirectedSuccessMessage: null,
      redirectedToken: null,
    }
  }

  const rawHash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash

  if (!rawHash) {
    return {
      redirectedAuthError: null,
      redirectedSuccessMessage: null,
      redirectedToken: null,
    }
  }

  const hashParams = new URLSearchParams(rawHash)
  return {
    redirectedAuthError: hashParams.get('authError'),
    redirectedSuccessMessage: hashParams.get('authSuccess'),
    redirectedToken: hashParams.get('token'),
  }
}

function RouteLoadingState() {
  return <div className="empty-state page-loader">Loading interface...</div>
}

function SearchResultsHeaderInput() {
  const location = useLocation()
  const navigate = useNavigate()
  const match = location.pathname.match(/^\/search-results\/(.+)$/)
  const urlQuery = match ? decodeURIComponent(match[1]).toUpperCase() : ''
  const [value, setValue] = useState(urlQuery)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setValue(urlQuery)
  }, [urlQuery])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const v = e.target.value.toUpperCase()
    setValue(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (v.trim().length < 1) return
    debounceRef.current = setTimeout(() => {
      navigate(`/search-results/${encodeURIComponent(v.trim())}`, { replace: true })
    }, 400)
  }

  return (
    <div className="global-search">
      <div className="global-search-shell">
        <input
          aria-label="Search instruments"
          className="global-search-input"
          onChange={handleChange}
          placeholder="Search symbols or company names"
          type="text"
          value={value}
        />
      </div>
    </div>
  )
}

function AppContent() {
  const navigate = useNavigate()
  const location = useLocation()
  const isSearchResultsPage = location.pathname.startsWith('/search-results/')
  const apiUrl = getApiUrl()
  const frontendOrigin = typeof window === 'undefined' ? '' : window.location.origin
  const loginGoogleParams = new URLSearchParams({
    returnTo: '/dashboard',
    intent: 'login',
  })
  const signupGoogleParams = new URLSearchParams({
    returnTo: '/dashboard',
    intent: 'signup',
    acceptedTerms: 'true',
  })
  if (frontendOrigin) {
    loginGoogleParams.set('frontendOrigin', frontendOrigin)
    signupGoogleParams.set('frontendOrigin', frontendOrigin)
  }
  const googleLoginUrl = `${apiUrl}/auth/google/login?${loginGoogleParams.toString()}`
  const googleSignupUrl = `${apiUrl}/auth/google/login?${signupGoogleParams.toString()}`
  const initialRedirectPayloadRef = useRef(readAuthRedirectPayload())
  const initialRedirectPayload = initialRedirectPayloadRef.current

  const [token, setToken] = useState(
    () => initialRedirectPayload.redirectedToken ?? localStorage.getItem('marketmetrics.token') ?? '',
  )
  const [currentUser, setCurrentUser] = useState<UserOut | null>(null)
  const [flashMessage, setFlashMessage] = useState(
    () => (
      initialRedirectPayload.redirectedSuccessMessage
      ?? (initialRedirectPayload.redirectedToken ? 'Signed in successfully.' : '')
    ),
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
  const [showRiskQuiz, setShowRiskQuiz] = useState(false)

  const alertSocketsRef = useRef<Map<string, WebSocket>>(new Map())
  const alertReconnectTimersRef = useRef<Map<string, number>>(new Map())
  const alertReconnectAttemptsRef = useRef<Map<string, number>>(new Map())
  const alertRetryAfterMsRef = useRef<Map<string, number>>(new Map())
  const triggeredAlertIdsRef = useRef<Map<string, number>>(new Map())
  const alertWorkspaceRefreshPromiseRef = useRef<Promise<void> | null>(null)
  const alertWorkspaceRefreshQueuedRef = useRef(false)

  const pruneTriggeredAlertIds = useEffectEvent(() => {
    const now = Date.now()

    for (const [alertId, seenAt] of triggeredAlertIdsRef.current.entries()) {
      if (now - seenAt > TRIGGERED_ALERT_DEDUPE_TTL_MS) {
        triggeredAlertIdsRef.current.delete(alertId)
      }
    }

    if (triggeredAlertIdsRef.current.size <= TRIGGERED_ALERT_DEDUPE_MAX_SIZE) {
      return
    }

    const targetSize = Math.floor(TRIGGERED_ALERT_DEDUPE_MAX_SIZE / 2)
    for (const alertId of triggeredAlertIdsRef.current.keys()) {
      if (triggeredAlertIdsRef.current.size <= targetSize) {
        break
      }
      triggeredAlertIdsRef.current.delete(alertId)
    }
  })

  const handleSessionExpired = useEffectEvent((message: string) => {
    for (const timeoutId of alertReconnectTimersRef.current.values()) {
      window.clearTimeout(timeoutId)
    }
    alertReconnectTimersRef.current.clear()
    alertReconnectAttemptsRef.current.clear()
    alertRetryAfterMsRef.current.clear()

    for (const socket of alertSocketsRef.current.values()) {
      socket.close()
    }
    alertSocketsRef.current.clear()

    triggeredAlertIdsRef.current.clear()
    alertWorkspaceRefreshPromiseRef.current = null
    alertWorkspaceRefreshQueuedRef.current = false
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

  // Global 401 handler — fires whenever any API call (including those from
  // lazy-loaded pages with no local 401 handling) receives an Unauthorized
  // response.  The custom event is dispatched by parseResponse() in api.ts.
  useEffect(() => {
    function onSessionExpired() {
      handleSessionExpired('Your session expired. Please log in again.')
    }
    window.addEventListener('marketmetrics:session-expired', onSessionExpired)
    return () => window.removeEventListener('marketmetrics:session-expired', onSessionExpired)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // handleSessionExpired is a useEffectEvent — stable by design, excluded from deps

  useEffect(() => {
    if (
      !initialRedirectPayload.redirectedToken &&
      !initialRedirectPayload.redirectedAuthError &&
      !initialRedirectPayload.redirectedSuccessMessage
    ) {
      return
    }

    if (initialRedirectPayload.redirectedToken) {
      localStorage.setItem('marketmetrics.token', initialRedirectPayload.redirectedToken)
    }

    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }, [
    initialRedirectPayload.redirectedAuthError,
    initialRedirectPayload.redirectedSuccessMessage,
    initialRedirectPayload.redirectedToken,
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

  function updateCurrentUserCache(activeToken: string, nextUser: UserOut) {
    setCurrentUser(nextUser)
    if (dashboardCache && dashboardCache.token === activeToken) {
      dashboardCache = { ...dashboardCache, user: nextUser }
    }
  }

  async function refreshCurrentUserProfile(activeToken: string) {
    const nextUser = await fetchCurrentUser(activeToken)
    updateCurrentUserCache(activeToken, nextUser)
    return nextUser
  }

  async function refreshWatchlist(activeToken: string) {
    const updatedWatchlist = await fetchWatchlist(activeToken)
    updateDashboardDataCache(activeToken, (currentData) => ({
      ...currentData,
      watchlist: updatedWatchlist,
    }))
  }

  async function refreshAlertWorkspaceData(activeToken: string) {
    if (alertWorkspaceRefreshPromiseRef.current) {
      alertWorkspaceRefreshQueuedRef.current = true
      return alertWorkspaceRefreshPromiseRef.current
    }

    const refreshPromise = (async () => {
      try {
        const [updatedAlerts, updatedWatchlist] = await Promise.all([
          fetchAlerts(activeToken),
          fetchWatchlist(activeToken),
        ])

        updateDashboardDataCache(activeToken, (currentData) => ({
          ...currentData,
          alerts: updatedAlerts,
          watchlist: updatedWatchlist,
        }))
      } finally {
        alertWorkspaceRefreshPromiseRef.current = null
        if (alertWorkspaceRefreshQueuedRef.current) {
          alertWorkspaceRefreshQueuedRef.current = false
          void refreshAlertWorkspaceData(activeToken)
        }
      }
    })()

    alertWorkspaceRefreshPromiseRef.current = refreshPromise
    return refreshPromise
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
    acceptedTerms: boolean
  }) {
    await register(payload)
    const response = await login(payload.email, payload.password)
    await completeAuthentication(
      response.access_token,
      'Account created and signed in. Check your email to verify your account.',
    )
  }

  function handleLogout() {
    for (const timeoutId of alertReconnectTimersRef.current.values()) {
      window.clearTimeout(timeoutId)
    }
    alertReconnectTimersRef.current.clear()
    alertReconnectAttemptsRef.current.clear()
    alertRetryAfterMsRef.current.clear()

    for (const socket of alertSocketsRef.current.values()) {
      socket.close()
    }
    alertSocketsRef.current.clear()

    triggeredAlertIdsRef.current.clear()
    alertWorkspaceRefreshPromiseRef.current = null
    alertWorkspaceRefreshQueuedRef.current = false
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
      }, toast.severity === 'urgent' ? 30_000 : 7000),
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
        const isUrgent = toast.severity === 'urgent'
        void new window.Notification(
          `${isUrgent ? '[URGENT] ' : ''}${toast.symbol} alert triggered`,
          {
            body: formatAlertToastBody(toast),
            requireInteraction: isUrgent,
          },
        )
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
    alertReconnectAttemptsRef.current.delete(symbol)
    alertRetryAfterMsRef.current.delete(symbol)

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

  const scheduleAlertSocketReconnect = useEffectEvent((symbol: string, retryInMs?: number) => {
    if (!token || alertReconnectTimersRef.current.has(symbol)) {
      return
    }

    const attempt = alertReconnectAttemptsRef.current.get(symbol) ?? 0
    const providerRetryMs = alertRetryAfterMsRef.current.get(symbol)
    const exponentialBackoffMs = Math.min(
      ALERT_SOCKET_RECONNECT_BASE_MS * 2 ** attempt,
      ALERT_SOCKET_RECONNECT_MAX_MS,
    )
    const reconnectDelayMs = Math.min(
      Math.max(
        retryInMs ?? providerRetryMs ?? exponentialBackoffMs,
        ALERT_SOCKET_RECONNECT_BASE_MS,
      ),
      ALERT_SOCKET_RECONNECT_MAX_MS,
    )
    alertReconnectAttemptsRef.current.set(symbol, attempt + 1)

    const timeoutId = window.setTimeout(() => {
      alertReconnectTimersRef.current.delete(symbol)

      const stillActive = (dashboardData.alerts?.activeAlerts ?? []).some(
        (alert) => alert.symbol === symbol,
      )
      if (!token || !stillActive || alertSocketsRef.current.has(symbol)) {
        return
      }

      connectAlertSocket(symbol)
    }, reconnectDelayMs)

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

  const handleAlertSocketMessage = useEffectEvent((symbol: string, rawPayload: string) => {
    let payload: AlertWebSocketMessage

    try {
      payload = JSON.parse(rawPayload) as AlertWebSocketMessage
    } catch {
      return
    }

    if (payload.type === 'error') {
      if (payload.retryInSeconds && Number.isFinite(payload.retryInSeconds)) {
        alertRetryAfterMsRef.current.set(
          symbol,
          Math.min(payload.retryInSeconds * 1000, ALERT_SOCKET_RECONNECT_MAX_MS),
        )
      }
      return
    }

    if (payload.type !== 'alert_triggered') {
      return
    }

    pruneTriggeredAlertIds()

    if (triggeredAlertIdsRef.current.has(payload.data.id)) {
      return
    }

    triggeredAlertIdsRef.current.set(payload.data.id, Date.now())
    showTriggeredAlertNotification({
      id: payload.data.id,
      symbol: payload.data.symbol,
      condition: payload.data.condition,
      targetPrice: payload.data.targetPrice,
      severity: payload.data.severity,
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
      buildWebSocketUrl(`/ws/quotes/${encodeURIComponent(symbol)}`),
      buildWebSocketProtocols(token),
    )

    alertSocketsRef.current.set(symbol, socket)

    socket.onmessage = (event) => {
      handleAlertSocketMessage(symbol, event.data)
    }
    socket.onopen = () => {
      alertReconnectAttemptsRef.current.delete(symbol)
      alertRetryAfterMsRef.current.delete(symbol)
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
        alertReconnectAttemptsRef.current.delete(symbol)
        alertRetryAfterMsRef.current.delete(symbol)
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
      alertReconnectAttemptsRef.current.clear()
      alertRetryAfterMsRef.current.clear()
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

  async function handleBulkAlertAction(payload: BulkAlertActionPayload) {
    if (!token) {
      return
    }

    setAlertActionError('')

    try {
      await bulkAlertAction(token, payload)
      // Clear toasts for any deleted alerts
      if (payload.action === 'delete') {
        const deletedSet = new Set(payload.alertIds)
        setAlertToasts((current) => current.filter((t) => !deletedSet.has(t.id)))
        for (const id of payload.alertIds) {
          triggeredAlertIdsRef.current.delete(id)
        }
      }
      await refreshAlertWorkspaceData(token)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleSessionExpired('Your session expired. Log in again to manage alerts.')
        return
      }

      setAlertActionError(
        error instanceof Error ? error.message : 'Unable to perform bulk action right now.',
      )
    }
  }

  async function handleUpdateEmailNotifications(enabled: boolean) {
    if (!token) {
      return
    }

    try {
      const updatedUser = await updateUserPreferences(token, {
        emailNotificationsEnabled: enabled,
      })
      updateCurrentUserCache(token, updatedUser)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleSessionExpired('Your session expired. Log in again to update settings.')
        return
      }

      throw error
    }
  }

  async function handleUpdateRiskProfile(profile: RiskProfile) {
    if (!token) {
      throw new Error('Log in first to save your risk profile.')
    }

    try {
      const updatedUser = await updateUserPreferences(token, { riskProfile: profile })
      updateCurrentUserCache(token, updatedUser)
      setShowRiskQuiz(false)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleSessionExpired('Your session expired. Log in again to update settings.')
        return
      }

      throw error
    }
  }

  async function handleUpdateAccountProfile(payload: {
    displayName?: string
    email?: string
  }) {
    if (!token) {
      throw new Error('Log in first to update your profile.')
    }

    try {
      const updatedUser = await updateAccountProfile(token, payload)
      updateCurrentUserCache(token, updatedUser)
      return updatedUser
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleSessionExpired('Your session expired. Log in again to update your account.')
      }

      throw error
    }
  }

  async function handleChangePassword(payload: {
    currentPassword?: string
    newPassword: string
  }) {
    if (!token) {
      throw new Error('Log in first to update your password.')
    }

    try {
      const response = await changePassword(token, payload)
      for (const timeoutId of alertReconnectTimersRef.current.values()) {
        window.clearTimeout(timeoutId)
      }
      alertReconnectTimersRef.current.clear()
      alertReconnectAttemptsRef.current.clear()
      alertRetryAfterMsRef.current.clear()

      for (const socket of alertSocketsRef.current.values()) {
        socket.close()
      }
      alertSocketsRef.current.clear()

      triggeredAlertIdsRef.current.clear()
      alertWorkspaceRefreshPromiseRef.current = null
      alertWorkspaceRefreshQueuedRef.current = false
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
      setFlashMessage(`${response.message} Sign in again to continue.`)
      setAuthRedirectError('')
      navigate('/login')
      return response.message
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleSessionExpired('Your session expired. Log in again to update your password.')
      }

      throw error
    }
  }

  async function handleLogoutAllSessions() {
    if (!token) {
      return
    }

    try {
      const response = await logoutAllSessions(token)
      for (const timeoutId of alertReconnectTimersRef.current.values()) {
        window.clearTimeout(timeoutId)
      }
      alertReconnectTimersRef.current.clear()

      for (const socket of alertSocketsRef.current.values()) {
        socket.close()
      }
      alertSocketsRef.current.clear()

      triggeredAlertIdsRef.current.clear()
      alertWorkspaceRefreshPromiseRef.current = null
      alertWorkspaceRefreshQueuedRef.current = false
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
      setFlashMessage(response.message)
      setAuthRedirectError('')
      navigate('/login')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleSessionExpired('Your session expired. Log in again to manage account security.')
        return
      }

      throw error
    }
  }

  async function handleRequestPasswordReset(email: string) {
    const response = await requestPasswordReset(email)
    return response.message
  }

  async function handleResetPasswordWithToken(resetToken: string, newPassword: string) {
    const response = await resetPassword(resetToken, newPassword)
    return response.message
  }

  async function handleVerifyEmailToken(verificationToken: string) {
    const response = await verifyEmail(verificationToken)

    if (token) {
      try {
        await refreshCurrentUserProfile(token)
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          handleSessionExpired('Your session expired. Log in again to refresh your account.')
        } else {
          throw error
        }
      }
    }

    return response.message
  }

  const guestHeader = (
    <AppHeader
      actions={<AuthActions />}
      bannerMessage={flashMessage}
      center={isSearchResultsPage ? <SearchResultsHeaderInput /> : <GlobalSearch token={token || undefined} />}
    />
  )

  const authenticatedHeader = (
    <AppHeader
      actions={
        <>
          <span className="connected-chip">Connected</span>
          <UserMenu isAdmin={currentUser?.isAdmin ?? false} />
          <button className="ghost-action" onClick={handleLogout} type="button">
            Log out
          </button>
        </>
      }
      bannerMessage={flashMessage}
      center={isSearchResultsPage ? <SearchResultsHeaderInput /> : <GlobalSearch onUnauthorized={handleSessionExpired} token={token} />}
    />
  )

  return (
    <>
      <ScrollToTop />
      {token ? (
        <AlertToastStack onDismiss={dismissAlertToast} toasts={alertToasts} />
      ) : null}
      <SideNav token={token} />

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
                  googleAuthUrl={googleLoginUrl}
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
                <SignupPage
                  authError={authRedirectError}
                  googleSignupUrl={googleSignupUrl}
                  onClearAuthError={() => setAuthRedirectError('')}
                  onRegister={handleEmailSignup}
                />
              </>
            )
          }
          path="/signup"
        />
        <Route
          element={
            <>
              {token ? authenticatedHeader : guestHeader}
              <ForgotPasswordPage onRequestReset={handleRequestPasswordReset} />
            </>
          }
          path="/forgot-password"
        />
        <Route
          element={
            <>
              {token ? authenticatedHeader : guestHeader}
              <ResetPasswordPage onResetPassword={handleResetPasswordWithToken} />
            </>
          }
          path="/reset-password"
        />
        <Route
          element={
            <>
              {token ? authenticatedHeader : guestHeader}
              <ResetPasswordPage onResetPassword={handleResetPasswordWithToken} />
            </>
          }
          path="/reset-password/:token"
        />
        <Route
          element={
            <>
              {token ? authenticatedHeader : guestHeader}
              <VerifyEmailPage isAuthenticated={Boolean(token)} onVerify={handleVerifyEmailToken} />
            </>
          }
          path="/verify-email"
        />
        <Route
          element={
            <>
              {token ? authenticatedHeader : guestHeader}
              <VerifyEmailPage isAuthenticated={Boolean(token)} onVerify={handleVerifyEmailToken} />
            </>
          }
          path="/verify-email/:token"
        />
        <Route
          element={
            <>
              {token ? authenticatedHeader : guestHeader}
              <LegalPage
                eyebrow="Terms"
                sections={[...termsSections]}
                summary="These terms outline the baseline responsibilities, access expectations, and product-use boundaries for MarketMetrics."
                title="Terms of use"
              />
            </>
          }
          path="/terms"
        />
        <Route
          element={
            <>
              {token ? authenticatedHeader : guestHeader}
              <LegalPage
                eyebrow="Privacy"
                sections={[...privacySections]}
                summary="This overview explains the account, session, and product data used to run your MarketMetrics workspace."
                title="Privacy policy"
              />
            </>
          }
          path="/privacy"
        />
        <Route
          element={
            <>
              {token ? authenticatedHeader : guestHeader}
              <GuidesPage />
            </>
          }
          path="/guides"
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
                  onBulkAction={handleBulkAlertAction}
                  onDeleteAlert={handleDeleteAlert}
                  onEnableNotifications={handleRequestNotificationPermission}
                  onPauseAlert={handlePauseAlert}
                  onResetAlert={handleResetAlert}
                  onResumeAlert={handleResumeAlert}
                  onStartRiskQuiz={() => setShowRiskQuiz(true)}
                  onRetakeRiskQuiz={() => setShowRiskQuiz(true)}
                  onUpdateAlert={handleUpdateAlert}
                  pendingAlertAction={pendingAlertAction}
                  pendingAlertActionId={pendingAlertActionId}
                  token={token}
                  watchlist={dashboardData.watchlist}
                />
                {showRiskQuiz ? (
                  <div className="risk-quiz-overlay">
                    <RiskProfileQuiz
                      onComplete={handleUpdateRiskProfile}
                      onDismiss={() => setShowRiskQuiz(false)}
                    />
                  </div>
                ) : null}
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
                <AccountPage
                  currentUser={currentUser}
                  onChangePassword={handleChangePassword}
                  onLogoutAllSessions={handleLogoutAllSessions}
                  onUpdateProfile={handleUpdateAccountProfile}
                  onUpdateRiskProfile={handleUpdateRiskProfile}
                />
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
                <SettingsPage
                  currentUser={currentUser}
                  onUpdateEmailNotifications={handleUpdateEmailNotifications}
                />
              </>
            ) : (
              <Navigate replace to="/login" />
            )
          }
          path="/settings"
        />
        <Route
          element={
            token ? (
              <>
                {authenticatedHeader}
                <SimulationHistoryPage
                  onUnauthorized={handleSessionExpired}
                  token={token}
                />
              </>
            ) : (
              <Navigate replace to="/login" />
            )
          }
          path="/simulation-history"
        />
        <Route
          element={
            <>
              {token ? authenticatedHeader : guestHeader}
              <MoversDirectionPage
                direction="gainers"
                token={token || undefined}
              />
            </>
          }
          path="/movers/gainers"
        />
        <Route
          element={
            <>
              {token ? authenticatedHeader : guestHeader}
              <MoversDirectionPage
                direction="losers"
                token={token || undefined}
              />
            </>
          }
          path="/movers/losers"
        />
        <Route
          element={
            <>
              {token ? authenticatedHeader : guestHeader}
              <Suspense fallback={<RouteLoadingState />}>
                <SearchResultsPage
                  onUnauthorized={handleSessionExpired}
                  token={token || undefined}
                  trackedSymbols={dashboardData.watchlist.map((w) => w.symbol)}
                />
              </Suspense>
            </>
          }
          path="/search-results/:query"
        />
        <Route
          element={
            <>
              {token ? authenticatedHeader : guestHeader}
              <Suspense fallback={<RouteLoadingState />}>
                <InstrumentPage
                  isLoadingTrackedSymbols={Boolean(token) && isLoadingDashboard}
                  onCreateAlert={handleCreatePriceAlert}
                  onDeleteAlert={handleDeleteAlert}
                  onTrackSymbol={handleAddWatchlistSymbol}
                  onUnauthorized={handleSessionExpired}
                  onUntrackSymbol={handleRemoveWatchlistSymbol}
                  onUpdateAlert={handleUpdateAlert}
                  riskProfile={currentUser?.riskProfile as RiskProfile | null | undefined}
                  token={token || undefined}
                  trackedSymbols={dashboardData.watchlist}
                />
              </Suspense>
            </>
          }
          path="/instrument/:symbol"
        />
        <Route
          element={
            <>
              {token ? authenticatedHeader : guestHeader}
              <Suspense fallback={<RouteLoadingState />}>
                <ForecastPage token={token || undefined} />
              </Suspense>
            </>
          }
          path="/forecast/:symbol"
        />
        <Route
          element={
            <>
              {token ? authenticatedHeader : guestHeader}
              <Suspense fallback={<RouteLoadingState />}>
                <GrowthProjectionPage token={token || undefined} />
              </Suspense>
            </>
          }
          path="/instrument/:symbol/project"
        />
        <Route
          element={
            !token ? (
              <Navigate replace to="/login" />
            ) : !currentUser?.isAdmin ? (
              <Navigate replace to="/dashboard" />
            ) : (
              <>
                {authenticatedHeader}
                <Suspense fallback={<RouteLoadingState />}>
                  <AdminUsersPage token={token} />
                </Suspense>
              </>
            )
          }
          path="/admin/users"
        />
        <Route
          element={
            !token ? (
              <Navigate replace to="/login" />
            ) : !currentUser?.isAdmin ? (
              <Navigate replace to="/dashboard" />
            ) : (
              <>
                {authenticatedHeader}
                <Suspense fallback={<RouteLoadingState />}>
                  <AdminAuditLogsPage token={token} />
                </Suspense>
              </>
            )
          }
          path="/admin/audit-logs"
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
