import { lazy, Suspense, useEffect, useEffectEvent, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'

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
  createWatchlistItem,
  deleteWatchlistItem,
  fetchAlerts,
  fetchCurrentUser,
  fetchMovers,
  fetchWatchlist,
  getApiUrl,
  login,
  register,
} from '../lib/api'
import type {
  AlertListResponse,
  MoversResponse,
  UserOut,
  WatchlistItemDetailedOut,
} from '../lib/api'
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

  const handleSessionExpired = useEffectEvent((message: string) => {
    localStorage.removeItem('marketmetrics.token')
    dashboardCache = null
    setToken('')
    setCurrentUser(null)
    setDashboardData(initialDashboardData)
    setDashboardError('')
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
  }, [handleSessionExpired, token])

  async function refreshWatchlist(activeToken: string) {
    const updatedWatchlist = await fetchWatchlist(activeToken)
    setDashboardData((currentData) => {
      const nextData = { ...currentData, watchlist: updatedWatchlist }
      if (dashboardCache && dashboardCache.token === activeToken) {
        dashboardCache = { ...dashboardCache, data: nextData }
      }
      return nextData
    })
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
    localStorage.removeItem('marketmetrics.token')
    dashboardCache = null
    setToken('')
    setCurrentUser(null)
    setDashboardData(initialDashboardData)
    setDashboardError('')
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
          <span className="connected-chip">{currentUser?.displayName ?? 'Connected'}</span>
          <UserMenu displayName={currentUser?.displayName} />
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
                currentUser={currentUser}
                dashboardError={dashboardError}
                isLoadingDashboard={isLoadingDashboard}
                movers={dashboardData.movers}
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
  )
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}
