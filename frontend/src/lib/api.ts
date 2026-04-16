const FALLBACK_API_URL =
  import.meta.env.DEV
    ? 'http://127.0.0.1:8000'
    : (typeof window !== 'undefined' ? window.location.origin : '')
const INSTRUMENT_DETAIL_CACHE_TTL_MS = 60_000

type InstrumentDetailCacheEntry = {
  expiresAt: number
  payload: InstrumentDetailResponse
}

const instrumentDetailCache = new Map<string, InstrumentDetailCacheEntry>()
const instrumentDetailInflight = new Map<string, Promise<InstrumentDetailResponse>>()

export type LoginResponse = {
  access_token: string
  token_type: string
}

export type RegisterPayload = {
  email: string
  password: string
  displayName: string
  acceptedTerms: boolean
}

export type UserOut = {
  userID: string
  email: string
  displayName: string
  primaryAuthProvider: string
  emailNotificationsEnabled?: boolean
  emailVerifiedAt?: string | null
  pendingEmail?: string | null
  sessionVersion?: number
  createdAt: string
  lastLoginAt?: string | null
  planName?: string
  accountStatus?: string
  riskProfile?: 'conservative' | 'moderate' | 'aggressive' | null
}

export type RiskProfile = 'conservative' | 'moderate' | 'aggressive'

export type UserPreferencesPayload = {
  emailNotificationsEnabled?: boolean
  riskProfile?: RiskProfile
}

export type AccountProfileUpdatePayload = {
  displayName?: string
  email?: string
}

export type PasswordChangePayload = {
  currentPassword?: string
  newPassword: string
}

export type AuthMessageResponse = {
  message: string
}

export type CompanySearchResult = {
  symbol: string
  name: string
  type?: string | null
  assetCategory?: string | null
  exchange?: string | null
  region?: string | null
  marketOpen?: string | null
  marketClose?: string | null
  timezone?: string | null
  currency?: string | null
  status?: string | null
  tradable?: boolean | null
  matchScore?: number | null
}

export type CompanySearchResponse = {
  query: string
  results: CompanySearchResult[]
}

export type Mover = {
  symbol: string
  name?: string | null
  price?: number | null
  change_amount?: number | null
  change_percent?: string | null
  volume?: number | null
  sparklineSeries: Array<{
    date: string
    close: number
  }>
}

export type MoversByCategory = {
  stocks: Mover[]
  crypto: Mover[]
  etfs: Mover[]
}

export type MoversResponse = {
  gainers: Mover[]
  losers: Mover[]
  gainersByCategory?: MoversByCategory
  losersByCategory?: MoversByCategory
  source: string
}

export type WatchlistItemDetailedOut = {
  id: string
  userID: string
  symbol: string
  assetCategory?: string | null
  createdAt: string
  latestQuote?: {
    price?: number | null
    change?: number | null
    changePercent?: string | null
    latestTradingDay?: string | null
    source?: string | null
    unavailableReason?: string | null
  } | null
  alerts: {
    totalAlerts: number
    activeAlerts: number
    triggeredAlerts: number
  }
}

export type WatchlistItemOut = {
  id: string
  userID: string
  symbol: string
  createdAt: string
}

export type InstrumentRange = '1M' | '3M' | '6M' | '1Y' | '5Y'

export type InstrumentDetailResponse = {
  symbol: string
  companyName: string
  assetCategory?: string | null
  exchange?: string | null
  range: InstrumentRange
  latestQuote: {
    price: number
    change?: number | null
    changePercent?: string | null
    latestTradingDay?: string | null
    source?: string | null
  }
  historicalSeries: Array<{
    date: string
    close: number
  }>
}

export type AlertCondition = 'above' | 'below' | 'percent_change' | 'range_exit'
export type AlertSeverity = 'normal' | 'urgent'

export type PriceAlert = {
  id: string
  userID: string
  symbol: string
  condition: AlertCondition
  targetPrice: number | null
  referencePrice?: number | null
  lowerBound?: number | null
  upperBound?: number | null
  severity?: AlertSeverity | null
  expiresAt?: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  triggeredAt?: string | null
}

export type PriceAlertCreatePayload = {
  symbol: string
  condition: AlertCondition
  targetPrice?: number
  referencePrice?: number
  lowerBound?: number
  upperBound?: number
  severity?: AlertSeverity
  expiresAt?: string
}

export type AlertListResponse = {
  activeAlerts: PriceAlert[]
  pausedAlerts: PriceAlert[]
  triggeredAlerts: PriceAlert[]
  totalCount: number
  activeCount: number
  pausedCount: number
  triggeredCount: number
}

export type PriceAlertUpdatePayload = {
  isActive?: boolean
  resetTriggered?: boolean
  targetPrice?: number
  condition?: AlertCondition
  severity?: AlertSeverity
  expiresAt?: string
}

export type AlertEvent = {
  id: string
  alertID: string
  symbol: string
  condition: string
  targetPrice: number | null
  triggerPrice: number
  triggeredAt: string
  createdAt: string
}

export type AlertHistoryListResponse = {
  events: AlertEvent[]
  totalCount: number
}

export type BulkAlertActionPayload = {
  alertIds: string[]
  action: 'delete' | 'pause' | 'resume' | 'reset'
}

export type QuoteWebSocketMessage = {
  type: 'quote'
  data: {
    symbol?: string
    price: number
    change?: number | null
    changePercent?: string | null
    latestTradingDay?: string | null
    source?: string | null
  }
}

export type AlertTriggeredWebSocketMessage = {
  type: 'alert_triggered'
  data: {
    id: string
    symbol: string
    condition: AlertCondition
    targetPrice: number
    severity?: AlertSeverity | null
    triggeredAt?: string | null
  }
}

export type ErrorWebSocketMessage = {
  type: 'error'
  message: string
  retryInSeconds?: number
  attempt?: number
}

export type AlertWebSocketMessage =
  | QuoteWebSocketMessage
  | AlertTriggeredWebSocketMessage
  | ErrorWebSocketMessage

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NetworkError'
  }
}

function instrumentDetailCacheKey(symbol: string, range: InstrumentRange): string {
  return `${symbol.trim().toUpperCase()}:${range}`
}

export function getApiUrl(): string {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL?.trim()

  if (!configuredUrl) {
    return FALLBACK_API_URL
  }

  return configuredUrl.replace(/\/+$/, '')
}

export function buildWebSocketUrl(path: string, token: string): string {
  const url = new URL(path, getApiUrl())
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('token', token)
  return url.toString()
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`

    try {
      const payload = await response.json()
      if (typeof payload?.detail === 'string') {
        detail = payload.detail
      }
    } catch {
      // Keep the fallback message when the response body isn't JSON.
    }

    throw new ApiError(detail, response.status)
  }

  return response.json() as Promise<T>
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  }
}

function authHeadersIfPresent(token?: string): HeadersInit | undefined {
  return token ? authHeaders(token) : undefined
}

async function safeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    if (error instanceof TypeError) {
      throw new NetworkError(
        `Cannot reach the API at ${getApiUrl()}. Make sure the FastAPI server is running.`,
      )
    }

    throw error
  }
}

const inflightGetRequests = new Map<string, Promise<unknown>>()

async function dedupedGet<T>(
  cacheKey: string,
  url: string,
  headers: HeadersInit | undefined,
  signal: AbortSignal | undefined,
): Promise<T> {
  const existing = inflightGetRequests.get(cacheKey) as Promise<T> | undefined
  if (existing && !signal?.aborted) {
    return existing
  }

  const request = (async () => {
    const response = await safeFetch(url, { headers, signal })
    return parseResponse<T>(response)
  })()

  inflightGetRequests.set(cacheKey, request as Promise<unknown>)
  try {
    return await request
  } finally {
    if (inflightGetRequests.get(cacheKey) === request) {
      inflightGetRequests.delete(cacheKey)
    }
  }
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const body = new URLSearchParams()
  body.set('username', email)
  body.set('password', password)

  const response = await safeFetch(`${getApiUrl()}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  return parseResponse<LoginResponse>(response)
}

export async function register(payload: RegisterPayload): Promise<UserOut> {
  const response = await safeFetch(`${getApiUrl()}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return parseResponse<UserOut>(response)
}

export async function fetchCurrentUser(
  token: string,
  signal?: AbortSignal,
): Promise<UserOut> {
  const response = await safeFetch(`${getApiUrl()}/auth/me`, {
    headers: authHeaders(token),
    signal,
  })

  return parseResponse<UserOut>(response)
}

export async function updateAccountProfile(
  token: string,
  payload: AccountProfileUpdatePayload,
): Promise<UserOut> {
  const response = await safeFetch(`${getApiUrl()}/auth/me`, {
    method: 'PATCH',
    headers: {
      ...authHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return parseResponse<UserOut>(response)
}

export async function changePassword(
  token: string,
  payload: PasswordChangePayload,
): Promise<AuthMessageResponse> {
  const response = await safeFetch(`${getApiUrl()}/auth/me/password`, {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return parseResponse<AuthMessageResponse>(response)
}

export async function logoutAllSessions(token: string): Promise<AuthMessageResponse> {
  const response = await safeFetch(`${getApiUrl()}/auth/me/logout-all`, {
    method: 'POST',
    headers: authHeaders(token),
  })

  return parseResponse<AuthMessageResponse>(response)
}

export async function requestPasswordReset(email: string): Promise<AuthMessageResponse> {
  const response = await safeFetch(`${getApiUrl()}/auth/password/forgot`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  })

  return parseResponse<AuthMessageResponse>(response)
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<AuthMessageResponse> {
  const response = await safeFetch(`${getApiUrl()}/auth/password/reset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token, newPassword }),
  })

  return parseResponse<AuthMessageResponse>(response)
}

export async function verifyPendingEmail(token: string): Promise<AuthMessageResponse> {
  const response = await safeFetch(`${getApiUrl()}/auth/email/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token }),
  })

  return parseResponse<AuthMessageResponse>(response)
}

export async function fetchSearchResults(
  token: string | undefined,
  query: string,
  signal?: AbortSignal,
): Promise<CompanySearchResponse> {
  const response = await safeFetch(
    `${getApiUrl()}/search/companies?q=${encodeURIComponent(query)}`,
    {
      headers: authHeadersIfPresent(token),
      signal,
    },
  )

  return parseResponse<CompanySearchResponse>(response)
}

export async function fetchMovers(
  token?: string,
  limit = 5,
  signal?: AbortSignal,
): Promise<MoversResponse> {
  const url = `${getApiUrl()}/movers/?limit=${encodeURIComponent(limit)}`
  return dedupedGet<MoversResponse>(
    `movers:${limit}:${token ? 'auth' : 'guest'}`,
    url,
    authHeadersIfPresent(token),
    signal,
  )
}

export async function fetchWatchlist(
  token: string,
  signal?: AbortSignal,
): Promise<WatchlistItemDetailedOut[]> {
  return dedupedGet<WatchlistItemDetailedOut[]>(
    `watchlist:${token}`,
    `${getApiUrl()}/watchlist/`,
    authHeaders(token),
    signal,
  )
}

export async function createWatchlistItem(
  token: string,
  symbol: string,
): Promise<WatchlistItemOut> {
  const response = await safeFetch(`${getApiUrl()}/watchlist/`, {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ symbol }),
  })

  return parseResponse<WatchlistItemOut>(response)
}

export async function deleteWatchlistItem(token: string, symbol: string): Promise<void> {
  const response = await safeFetch(`${getApiUrl()}/watchlist/${encodeURIComponent(symbol)}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })

  if (!response.ok) {
    await parseResponse<unknown>(response)
  }
}

export async function fetchInstrumentDetail(
  token: string | undefined,
  symbol: string,
  range: InstrumentRange,
): Promise<InstrumentDetailResponse> {
  const key = instrumentDetailCacheKey(symbol, range)
  const cachedEntry = instrumentDetailCache.get(key)
  if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
    return cachedEntry.payload
  }

  const inflightRequest = instrumentDetailInflight.get(key)
  if (inflightRequest) {
    return inflightRequest
  }

  const requestPromise = (async () => {
    const response = await safeFetch(
      `${getApiUrl()}/instruments/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}`,
      {
        headers: authHeadersIfPresent(token),
      },
    )

    const payload = await parseResponse<InstrumentDetailResponse>(response)
    instrumentDetailCache.set(key, {
      expiresAt: Date.now() + INSTRUMENT_DETAIL_CACHE_TTL_MS,
      payload,
    })
    return payload
  })()

  instrumentDetailInflight.set(key, requestPromise)

  try {
    return await requestPromise
  } finally {
    instrumentDetailInflight.delete(key)
  }
}

export function prefetchInstrumentDetail(
  token: string | undefined,
  symbol: string,
  range: InstrumentRange = '6M',
): void {
  void fetchInstrumentDetail(token, symbol, range).catch(() => {
    // Ignore prefetch failures and let the detail page surface the real error state.
  })
}

export async function fetchAlerts(
  token: string,
  signal?: AbortSignal,
): Promise<AlertListResponse> {
  return dedupedGet<AlertListResponse>(
    `alerts:${token}`,
    `${getApiUrl()}/alerts/`,
    authHeaders(token),
    signal,
  )
}

export async function fetchAlertsForSymbol(
  token: string,
  symbol: string,
  signal?: AbortSignal,
): Promise<AlertListResponse> {
  const url = `${getApiUrl()}/alerts/?symbol=${encodeURIComponent(symbol)}`
  const response = await safeFetch(url, { headers: authHeaders(token), signal })
  return parseResponse<AlertListResponse>(response)
}

export async function createAlert(
  token: string,
  payload: PriceAlertCreatePayload,
): Promise<PriceAlert> {
  const response = await safeFetch(`${getApiUrl()}/alerts/`, {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return parseResponse<PriceAlert>(response)
}

export async function resetAlert(token: string, alertId: string): Promise<PriceAlert> {
  const response = await safeFetch(`${getApiUrl()}/alerts/${encodeURIComponent(alertId)}`, {
    method: 'PATCH',
    headers: {
      ...authHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ resetTriggered: true }),
  })

  return parseResponse<PriceAlert>(response)
}

export async function deleteAlert(token: string, alertId: string): Promise<void> {
  const response = await safeFetch(`${getApiUrl()}/alerts/${encodeURIComponent(alertId)}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })

  if (!response.ok) {
    await parseResponse<unknown>(response)
  }
}

export async function updateAlert(
  token: string,
  alertId: string,
  payload: PriceAlertUpdatePayload,
): Promise<PriceAlert> {
  const response = await safeFetch(`${getApiUrl()}/alerts/${encodeURIComponent(alertId)}`, {
    method: 'PATCH',
    headers: {
      ...authHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return parseResponse<PriceAlert>(response)
}

export async function pauseAlert(token: string, alertId: string): Promise<PriceAlert> {
  return updateAlert(token, alertId, { isActive: false })
}

export async function resumeAlert(token: string, alertId: string): Promise<PriceAlert> {
  return updateAlert(token, alertId, { isActive: true })
}

export async function fetchAlertHistory(
  token: string,
  alertId: string,
): Promise<AlertHistoryListResponse> {
  const response = await safeFetch(
    `${getApiUrl()}/alerts/${encodeURIComponent(alertId)}/history`,
    { headers: authHeaders(token) },
  )
  return parseResponse<AlertHistoryListResponse>(response)
}

export async function fetchRecentAlertEvents(
  token: string,
): Promise<AlertHistoryListResponse> {
  const response = await safeFetch(`${getApiUrl()}/alerts/history`, {
    headers: authHeaders(token),
  })
  return parseResponse<AlertHistoryListResponse>(response)
}

export async function bulkAlertAction(
  token: string,
  payload: BulkAlertActionPayload,
): Promise<{ affected: number; action: string }> {
  const response = await safeFetch(`${getApiUrl()}/alerts/bulk`, {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  return parseResponse<{ affected: number; action: string }>(response)
}

export async function updateUserPreferences(
  token: string,
  payload: UserPreferencesPayload,
): Promise<UserOut> {
  const response = await safeFetch(`${getApiUrl()}/auth/me/preferences`, {
    method: 'PATCH',
    headers: {
      ...authHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  return parseResponse<UserOut>(response)
}
