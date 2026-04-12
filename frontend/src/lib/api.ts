const FALLBACK_API_URL = 'http://127.0.0.1:8000'
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
}

export type UserOut = {
  userID: string
  email: string
  displayName: string
  createdAt: string
  lastLoginAt?: string | null
}

export type CompanySearchResult = {
  symbol: string
  name: string
  type?: string | null
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

export type MoversResponse = {
  gainers: Mover[]
  losers: Mover[]
  source: string
}

export type WatchlistItemDetailedOut = {
  id: string
  userID: string
  symbol: string
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

export type AlertListResponse = {
  activeAlerts: Array<{
    id: string
    symbol: string
    condition: string
    targetPrice: number
    isActive: boolean
    createdAt: string
    updatedAt: string
    triggeredAt?: string | null
  }>
  triggeredAlerts: Array<{
    id: string
    symbol: string
    condition: string
    targetPrice: number
    isActive: boolean
    createdAt: string
    updatedAt: string
    triggeredAt?: string | null
  }>
  totalCount: number
  activeCount: number
  triggeredCount: number
}

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
