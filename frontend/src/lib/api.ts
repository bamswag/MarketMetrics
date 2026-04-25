const FALLBACK_API_URL =
  import.meta.env.DEV
    ? 'http://127.0.0.1:8000'
    : (typeof window !== 'undefined' ? window.location.origin : '')
const ALLOW_REMOTE_API_IN_DEV = import.meta.env.VITE_ALLOW_REMOTE_API_IN_DEV === 'true'
const FEATURED_MOVER_CACHE_TTL_MS = 60_000
const INSTRUMENT_DETAIL_CACHE_TTL_MS = 60_000
const INSTRUMENT_DETAIL_CACHE_MAX_SIZE = 40
const PUBLIC_QUOTE_CACHE_TTL_MS = 30_000
const PUBLIC_QUOTE_CACHE_MAX_SIZE = 300

type FeaturedMoverCacheEntry = {
  expiresAt: number
  payload: FeaturedMoverResponse
}

type InstrumentDetailCacheEntry = {
  expiresAt: number
  payload: InstrumentDetailResponse
}

type PublicQuoteCacheEntry = {
  expiresAt: number
  payload: PublicQuote
}

const featuredMoverCache = new Map<string, FeaturedMoverCacheEntry>()
const featuredMoverInflight = new Map<string, Promise<FeaturedMoverResponse>>()
const instrumentDetailCache = new Map<string, InstrumentDetailCacheEntry>()
const instrumentDetailInflight = new Map<string, Promise<InstrumentDetailResponse>>()
const publicQuoteCache = new Map<string, PublicQuoteCacheEntry>()

function featuredMoverCacheKey(selection: FeaturedMoverSelection): string {
  return `${selection.period}:${selection.direction}:${selection.asset}`
}

function pruneFeaturedMoverCache(now = Date.now()): void {
  for (const [key, entry] of featuredMoverCache.entries()) {
    if (entry.expiresAt <= now) {
      featuredMoverCache.delete(key)
    }
  }
}

function pruneInstrumentDetailCache(now = Date.now()): void {
  for (const [key, entry] of instrumentDetailCache.entries()) {
    if (entry.expiresAt <= now) {
      instrumentDetailCache.delete(key)
    }
  }

  if (instrumentDetailCache.size <= INSTRUMENT_DETAIL_CACHE_MAX_SIZE) {
    return
  }

  const targetSize = Math.floor(INSTRUMENT_DETAIL_CACHE_MAX_SIZE / 2)
  for (const key of instrumentDetailCache.keys()) {
    if (instrumentDetailCache.size <= targetSize) {
      break
    }
    instrumentDetailCache.delete(key)
  }
}

function publicQuoteCacheKey(symbol: string): string {
  return symbol.trim().toUpperCase()
}

function prunePublicQuoteCache(now = Date.now()): void {
  for (const [key, entry] of publicQuoteCache.entries()) {
    if (entry.expiresAt <= now) {
      publicQuoteCache.delete(key)
    }
  }

  if (publicQuoteCache.size <= PUBLIC_QUOTE_CACHE_MAX_SIZE) {
    return
  }

  const targetSize = Math.floor(PUBLIC_QUOTE_CACHE_MAX_SIZE / 2)
  for (const key of publicQuoteCache.keys()) {
    if (publicQuoteCache.size <= targetSize) {
      break
    }
    publicQuoteCache.delete(key)
  }
}

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
  passwordAuthEnabled?: boolean
  googleLinked?: boolean
  emailNotificationsEnabled?: boolean
  emailVerifiedAt?: string | null
  pendingEmail?: string | null
  sessionVersion?: number
  createdAt: string
  lastLoginAt?: string | null
  planName?: string
  accountStatus?: string
  riskProfile?: 'conservative' | 'moderate' | 'aggressive' | null
  isAdmin?: boolean
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

export type PublicQuote = {
  symbol: string
  price?: number | null
  change?: number | null
  changePercent?: string | null
  latestTradingDay?: string | null
  source?: string | null
  unavailableReason?: string | null
}

export type PublicQuotesResponse = {
  quotes: PublicQuote[]
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

export type FeaturedMoverPeriod = 'day' | 'week' | 'month'
export type FeaturedMoverDirection = 'gainer' | 'loser'
export type FeaturedMoverAsset = 'all' | 'stocks' | 'crypto' | 'etfs'

export type FeaturedMoverSelection = {
  period: FeaturedMoverPeriod
  direction: FeaturedMoverDirection
  asset: FeaturedMoverAsset
}

export type FeaturedMoverResponse = {
  period: FeaturedMoverPeriod
  direction: FeaturedMoverDirection
  asset: FeaturedMoverAsset
  title: string
  mover: Mover | null
  historicalSeries: Array<{
    date: string
    close: number
  }>
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

export type InstrumentRange = '1W' | '1M' | '3M' | '6M' | '1Y' | '5Y' | 'MAX'

export type InstrumentDetailResponse = {
  symbol: string
  companyName: string
  assetCategory?: string | null
  exchange?: string | null
  range: InstrumentRange
  availableRanges: InstrumentRange[]
  earliestAvailableDate?: string | null
  latestQuote: {
    price: number
    change?: number | null
    changePercent?: string | null
    open?: number | null
    high?: number | null
    low?: number | null
    close?: number | null
    previousClose?: number | null
    volume?: number | null
    vwap?: number | null
    tradeCount?: number | null
    latestTradingDay?: string | null
    source?: string | null
  }
  historicalSeries: Array<{
    date: string
    open?: number | null
    high?: number | null
    low?: number | null
    close: number
    volume?: number | null
    vwap?: number | null
    tradeCount?: number | null
  }>
}

export type SimilarInstrument = {
  symbol: string
  name: string
  type?: string | null
  assetCategory?: string | null
  exchange?: string | null
  currency?: string | null
  similarityReason?: string | null
  latestQuote?: PublicQuote | null
}

export type SimilarInstrumentsResponse = {
  symbol: string
  assetCategory?: string | null
  results: SimilarInstrument[]
}

const LEGACY_INSTRUMENT_RANGES: InstrumentRange[] = ['1W', '1M', '3M', '6M', '1Y', '5Y']

function isInstrumentRangeValue(value: unknown): value is InstrumentRange {
  return (
    value === '1W'
    || value === '1M'
    || value === '3M'
    || value === '6M'
    || value === '1Y'
    || value === '5Y'
    || value === 'MAX'
  )
}

function normalizeInstrumentDetailResponse(
  payload: InstrumentDetailResponse,
): InstrumentDetailResponse {
  const currentRange = isInstrumentRangeValue(payload.range) ? payload.range : '6M'
  const normalizedRanges = Array.isArray(payload.availableRanges)
    ? payload.availableRanges.filter(isInstrumentRangeValue)
    : []

  return {
    ...payload,
    range: currentRange,
    availableRanges:
      normalizedRanges.length > 0
        ? normalizedRanges
        : [...LEGACY_INSTRUMENT_RANGES],
    earliestAvailableDate:
      typeof payload.earliestAvailableDate === 'string'
        ? payload.earliestAvailableDate
        : null,
  }
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
    targetPrice: number | null
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

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '::1' || hostname.startsWith('127.')
}

function shouldForceLocalApiInDev(configuredUrl: string): boolean {
  if (!import.meta.env.DEV || ALLOW_REMOTE_API_IN_DEV || typeof window === 'undefined') {
    return false
  }

  if (!isLoopbackHostname(window.location.hostname)) {
    return false
  }

  try {
    const resolvedUrl = new URL(configuredUrl, window.location.origin)
    return !isLoopbackHostname(resolvedUrl.hostname)
  } catch {
    return false
  }
}

export function getApiUrl(): string {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL?.trim()

  if (!configuredUrl) {
    return FALLBACK_API_URL
  }

  if (shouldForceLocalApiInDev(configuredUrl)) {
    return FALLBACK_API_URL
  }

  return configuredUrl.replace(/\/+$/, '')
}

export function buildWebSocketUrl(path: string): string {
  const url = new URL(path, getApiUrl())
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

export function buildWebSocketProtocols(token: string): string[] {
  return ['marketmetrics.jwt.v1', `bearer.${token}`]
}

async function parseResponse<T>(response: Response): Promise<T> {
  const bodyText = await response.text().catch(() => '')
  const trimmedBody = bodyText.trim()

  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`

    if (trimmedBody) {
      try {
        const payload = JSON.parse(trimmedBody)
        if (typeof payload?.detail === 'string') {
          detail = payload.detail
        }
      } catch {
        // Keep the fallback message when the error body isn't valid JSON.
      }
    }

    const apiError = new ApiError(detail, response.status)
    // Notify the app shell so any 401 — including those from lazy-loaded pages
    // that don't have their own 401 handler — triggers a global session-expired
    // logout rather than silently failing.
    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('marketmetrics:session-expired'))
    }
    throw apiError
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''

  if (!contentType.includes('application/json')) {
    if (
      trimmedBody.startsWith('<!DOCTYPE html')
      || trimmedBody.startsWith('<html')
      || trimmedBody.includes('<body')
    ) {
      throw new Error(
        'The API returned HTML instead of JSON. This usually means the request hit the frontend app instead of the deployed backend route.',
      )
    }

    throw new Error(
      `The API returned ${contentType || 'a non-JSON response'} when JSON was expected.`,
    )
  }

  try {
    return JSON.parse(bodyText) as T
  } catch (error) {
    if (
      trimmedBody.startsWith('<!DOCTYPE html')
      || trimmedBody.startsWith('<html')
      || trimmedBody.includes('<body')
    ) {
      throw new Error(
        'The API returned HTML instead of JSON. This usually means the request hit the frontend app instead of the deployed backend route.',
      )
    }

    if (error instanceof Error) {
      throw new Error(
        `The API returned invalid JSON: ${error.message}`,
      )
    }

    throw new Error('The API returned invalid JSON.')
  }
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
        `The browser could not read a response from ${getApiUrl()}. The API may be down, or the backend may have failed before returning a readable CORS response.`,
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

export async function verifyEmail(token: string): Promise<AuthMessageResponse> {
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

export async function fetchPublicQuotes(
  symbols: string[],
  signal?: AbortSignal,
): Promise<PublicQuote[]> {
  prunePublicQuoteCache()

  const normalizedSymbols = Array.from(
    new Set(
      symbols
        .map((symbol) => publicQuoteCacheKey(symbol))
        .filter(Boolean),
    ),
  )

  if (normalizedSymbols.length === 0) {
    return []
  }

  const quotesBySymbol = new Map<string, PublicQuote>()
  const missingSymbols: string[] = []

  for (const symbol of normalizedSymbols) {
    const cachedEntry = publicQuoteCache.get(symbol)
    if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
      quotesBySymbol.set(symbol, cachedEntry.payload)
    } else {
      missingSymbols.push(symbol)
    }
  }

  if (missingSymbols.length > 0) {
    const response = await safeFetch(
      `${getApiUrl()}/quotes/?symbols=${encodeURIComponent(missingSymbols.join(','))}`,
      { signal },
    )
    const payload = await parseResponse<PublicQuotesResponse>(response)

    for (const quote of payload.quotes) {
      const key = publicQuoteCacheKey(quote.symbol)
      publicQuoteCache.set(key, {
        expiresAt: Date.now() + PUBLIC_QUOTE_CACHE_TTL_MS,
        payload: quote,
      })
      quotesBySymbol.set(key, quote)
    }

    prunePublicQuoteCache()
  }

  return normalizedSymbols.map((symbol) => (
    quotesBySymbol.get(symbol) ?? {
      symbol,
      unavailableReason: 'No quote data available.',
    }
  ))
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

export async function fetchPublicMovers(
  limit = 5,
  signal?: AbortSignal,
): Promise<MoversResponse> {
  return fetchMovers(undefined, limit, signal)
}

export async function fetchFeaturedMover(
  selection: FeaturedMoverSelection,
  signal?: AbortSignal,
): Promise<FeaturedMoverResponse> {
  pruneFeaturedMoverCache()
  const key = featuredMoverCacheKey(selection)
  const cachedEntry = featuredMoverCache.get(key)
  if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
    return cachedEntry.payload
  }

  const inflightRequest = featuredMoverInflight.get(key)
  if (inflightRequest) {
    return inflightRequest
  }

  const requestPromise = (async () => {
    const params = new URLSearchParams({
      period: selection.period,
      direction: selection.direction,
      asset: selection.asset,
    })
    const response = await safeFetch(`${getApiUrl()}/movers/featured?${params.toString()}`, {
      signal,
    })
    const payload = await parseResponse<FeaturedMoverResponse>(response)
    featuredMoverCache.set(key, {
      expiresAt: Date.now() + FEATURED_MOVER_CACHE_TTL_MS,
      payload,
    })
    pruneFeaturedMoverCache()
    return payload
  })()

  featuredMoverInflight.set(key, requestPromise)

  try {
    return await requestPromise
  } finally {
    featuredMoverInflight.delete(key)
  }
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
  signal?: AbortSignal,
): Promise<InstrumentDetailResponse> {
  pruneInstrumentDetailCache()
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
        signal,
      },
    )

    const payload = normalizeInstrumentDetailResponse(
      await parseResponse<InstrumentDetailResponse>(response),
    )
    instrumentDetailCache.delete(key)
    instrumentDetailCache.set(key, {
      expiresAt: Date.now() + INSTRUMENT_DETAIL_CACHE_TTL_MS,
      payload,
    })
    pruneInstrumentDetailCache()
    return payload
  })()

  instrumentDetailInflight.set(key, requestPromise)

  try {
    return await requestPromise
  } finally {
    instrumentDetailInflight.delete(key)
  }
}

export async function fetchSimilarInstruments(
  symbol: string,
  limit = 8,
  signal?: AbortSignal,
): Promise<SimilarInstrumentsResponse> {
  const response = await safeFetch(
    `${getApiUrl()}/instruments/similar/${encodeURIComponent(symbol)}?limit=${encodeURIComponent(limit)}`,
    { signal },
  )

  return parseResponse<SimilarInstrumentsResponse>(response)
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

// ── Forecast / Price Prediction ──────────────────────────────────────────────

export type ForecastPoint = {
  date: string
  predictedClose: number
  predictedReturnPct: number
  predictedCloseLow?: number | null
  predictedCloseHigh?: number | null
}

export type ForecastMetrics = {
  maePrice: number
  rmsePrice: number
  maeReturn: number
  directionalAccuracy: number
  naiveMaePrice?: number | null
}

export type ForecastResponse = {
  symbol: string
  lastActualClose: number
  predictedNextDayClose: number
  predictedReturnPctOverHorizon: number
  forecastHorizonDays: number
  historicalSeries: Array<{ date: string; close: number }>
  forecastSeries: ForecastPoint[]
  metrics: ForecastMetrics
  featureImportances: Array<{ feature: string; importance: number }>
  modelVersion: string
}

export async function fetchForecast(
  token: string | undefined,
  symbol: string,
  horizonDays: number,
  signal?: AbortSignal,
): Promise<ForecastResponse> {
  if (!token) {
    throw new Error('Sign in to use the price forecast feature.')
  }
  const response = await safeFetch(`${getApiUrl()}/predict/forecast`, {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ symbol, horizonDays, historyWindowDays: 365 }),
    signal,
  })
  return parseResponse<ForecastResponse>(response)
}

// ── Growth Projections ────────────────────────────────────────────────────────

export type GrowthProjectionRequest = {
  symbol: string
  years: number
  initialAmount: number
  recurringContribution?: number
  contributionFrequency?: 'monthly' | 'quarterly' | 'yearly'
  expectedAnnualReturn?: number
  annualVolatility?: number
  inflationRate?: number
  simulationRuns?: number
}

export type MonthlyProjectionPoint = {
  date: string
  investedCapital: number
  pessimisticValue: number
  baselineValue: number
  optimisticValue: number
  monteCarloP10: number
  monteCarloP50: number
  monteCarloP90: number
}

export type DeterministicScenario = {
  annualReturnUsed: number
  projectedEndValue: number
  projectedGrowthPct: number
}

export type DeterministicScenarios = {
  pessimistic: DeterministicScenario
  baseline: DeterministicScenario
  optimistic: DeterministicScenario
}

export type MonteCarloSummary = {
  runs: number
  p10EndValue: number
  p50EndValue: number
  p90EndValue: number
  probabilityOfProfit: number
  bestCaseEndValue: number
  worstCaseEndValue: number
}

export type ProjectionEndValues = {
  pessimistic: number
  baseline: number
  optimistic: number
  monteCarloP10: number
  monteCarloP50: number
  monteCarloP90: number
}

export type ProjectionAssumptions = {
  source: string
  expectedAnnualReturn: number
  annualVolatility: number
  inflationRate: number
  historyWindowYearsUsed: number
}

export type GrowthProjectionResponse = {
  symbol: string
  companyName?: string | null
  lastActualClose: number
  projectionYears: number
  projectionMonths: number
  assumptionsUsed: ProjectionAssumptions
  monthlyChartData: MonthlyProjectionPoint[]
  deterministicScenarios: DeterministicScenarios
  monteCarloSummary: MonteCarloSummary
  projectedContributionTotal: number
  initialAmount: number
  totalInvested: number
  nominalEndValues: ProjectionEndValues
  nominalProfitGain: ProjectionEndValues
  nominalGrowthPct: ProjectionEndValues
  realEndValues?: ProjectionEndValues | null
  realProfitGain?: ProjectionEndValues | null
  realGrowthPct?: ProjectionEndValues | null
}

export async function fetchGrowthProjection(
  token: string | undefined,
  payload: GrowthProjectionRequest,
  signal?: AbortSignal,
): Promise<GrowthProjectionResponse> {
  if (!token) {
    throw new Error('Sign in to run investment simulations.')
  }
  const response = await safeFetch(`${getApiUrl()}/project/long-term`, {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
  })
  return parseResponse<GrowthProjectionResponse>(response)
}

// ── Simulation History ────────────────────────────────────────────────────────

export type SimulationHistoryItem = {
  simulationId: string
  userID: string
  assetSymbol: string
  assetName: string | null
  projectionYears: number
  initialAmount: number
  monthlyContribution: number
  inflationRate: number
  totalInvested: number
  baselineEndValue: number
  pessimisticEndValue: number
  optimisticEndValue: number
  baselineGrowthPct: number
  probabilityOfProfit: number
  notes: string | null
  createdAt: string
}

export async function fetchSimulationHistory(
  token: string,
  signal?: AbortSignal,
): Promise<SimulationHistoryItem[]> {
  const response = await safeFetch(`${getApiUrl()}/simulate/history`, {
    headers: authHeaders(token),
    signal,
  })
  return parseResponse<SimulationHistoryItem[]>(response)
}

export async function deleteSimulationHistoryItem(
  token: string,
  simulationId: string,
): Promise<void> {
  const response = await safeFetch(
    `${getApiUrl()}/simulate/history/${encodeURIComponent(simulationId)}`,
    { method: 'DELETE', headers: authHeaders(token) },
  )
  if (!response.ok && response.status !== 204) {
    await parseResponse<void>(response)
  }
}

export async function clearSimulationHistory(token: string): Promise<void> {
  const response = await safeFetch(`${getApiUrl()}/simulate/history`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  if (!response.ok && response.status !== 204) {
    await parseResponse<void>(response)
  }
}

export async function updateSimulationHistoryNotes(
  token: string,
  simulationId: string,
  notes: string | null,
): Promise<SimulationHistoryItem> {
  const response = await safeFetch(
    `${getApiUrl()}/simulate/history/${encodeURIComponent(simulationId)}`,
    {
      method: 'PATCH',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    },
  )
  return parseResponse<SimulationHistoryItem>(response)
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export type AdminUserOut = {
  userID: string
  email: string
  displayName: string
  primaryAuthProvider: string
  passwordAuthEnabled: boolean
  googleLinked: boolean
  emailNotificationsEnabled: boolean
  emailVerifiedAt: string | null
  isAdmin: boolean
  isActive: boolean
  sessionVersion: number
  riskProfile: string | null
  createdAt: string
  lastLoginAt: string | null
  planName: string
  accountStatus: string
}

export type AdminUserListResponse = {
  items: AdminUserOut[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type AdminUserUpdatePayload = {
  displayName?: string
  emailVerifiedAt?: string | null
}

export type AdminAuditLogOut = {
  id: string
  adminUserID: string
  targetUserID: string | null
  action: string
  details: string | null
  createdAt: string
}

export type AdminAuditLogListResponse = {
  items: AdminAuditLogOut[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function fetchAdminUsers(
  token: string,
  params: { search?: string; page?: number; pageSize?: number } = {},
): Promise<AdminUserListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.page) query.set('page', String(params.page))
  if (params.pageSize) query.set('pageSize', String(params.pageSize))
  const response = await safeFetch(`${getApiUrl()}/admin/users?${query.toString()}`, {
    headers: authHeaders(token),
  })
  return parseResponse<AdminUserListResponse>(response)
}

export async function fetchAdminUser(token: string, userId: string): Promise<AdminUserOut> {
  const response = await safeFetch(`${getApiUrl()}/admin/users/${encodeURIComponent(userId)}`, {
    headers: authHeaders(token),
  })
  return parseResponse<AdminUserOut>(response)
}

export async function updateAdminUser(
  token: string,
  userId: string,
  payload: AdminUserUpdatePayload,
): Promise<AdminUserOut> {
  const response = await safeFetch(`${getApiUrl()}/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseResponse<AdminUserOut>(response)
}

export async function setUserStatus(
  token: string,
  userId: string,
  active: boolean,
): Promise<AdminUserOut> {
  const response = await safeFetch(
    `${getApiUrl()}/admin/users/${encodeURIComponent(userId)}/status`,
    {
      method: 'PATCH',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    },
  )
  return parseResponse<AdminUserOut>(response)
}

export async function forceLogoutUser(token: string, userId: string): Promise<AdminUserOut> {
  const response = await safeFetch(
    `${getApiUrl()}/admin/users/${encodeURIComponent(userId)}/force-logout`,
    {
      method: 'POST',
      headers: authHeaders(token),
    },
  )
  return parseResponse<AdminUserOut>(response)
}

export async function promoteUser(token: string, userId: string): Promise<AdminUserOut> {
  const response = await safeFetch(
    `${getApiUrl()}/admin/users/${encodeURIComponent(userId)}/promote`,
    {
      method: 'POST',
      headers: authHeaders(token),
    },
  )
  return parseResponse<AdminUserOut>(response)
}

export async function demoteUser(token: string, userId: string): Promise<AdminUserOut> {
  const response = await safeFetch(
    `${getApiUrl()}/admin/users/${encodeURIComponent(userId)}/demote`,
    {
      method: 'POST',
      headers: authHeaders(token),
    },
  )
  return parseResponse<AdminUserOut>(response)
}

export async function resendVerification(token: string, userId: string): Promise<AdminUserOut> {
  const response = await safeFetch(
    `${getApiUrl()}/admin/users/${encodeURIComponent(userId)}/resend-verification`,
    {
      method: 'POST',
      headers: authHeaders(token),
    },
  )
  return parseResponse<AdminUserOut>(response)
}

export async function sendPasswordResetAdmin(
  token: string,
  userId: string,
): Promise<AuthMessageResponse> {
  const response = await safeFetch(
    `${getApiUrl()}/admin/users/${encodeURIComponent(userId)}/send-password-reset`,
    {
      method: 'POST',
      headers: authHeaders(token),
    },
  )
  return parseResponse<AuthMessageResponse>(response)
}

export async function deleteAdminUser(token: string, userId: string): Promise<AuthMessageResponse> {
  const response = await safeFetch(
    `${getApiUrl()}/admin/users/${encodeURIComponent(userId)}`,
    {
      method: 'DELETE',
      headers: authHeaders(token),
    },
  )
  return parseResponse<AuthMessageResponse>(response)
}

export async function fetchAuditLogs(
  token: string,
  params: { search?: string; page?: number; pageSize?: number } = {},
): Promise<AdminAuditLogListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.page) query.set('page', String(params.page))
  if (params.pageSize) query.set('pageSize', String(params.pageSize))
  const response = await safeFetch(`${getApiUrl()}/admin/audit-logs?${query.toString()}`, {
    headers: authHeaders(token),
  })
  return parseResponse<AdminAuditLogListResponse>(response)
}
