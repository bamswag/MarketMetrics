import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { MoverLogo } from '../components/MoverLogo'
import {
  ApiError,
  clearSimulationHistory,
  deleteSimulationHistoryItem,
  fetchSimulationHistory,
  type SimulationHistoryItem,
  updateSimulationHistoryNotes,
} from '../lib/api'
import { formatCurrency } from '../lib/formatters'
import '../styles/pages/SimulationHistoryPage.css'

type SimulationHistoryPageProps = {
  token: string
  onUnauthorized: (message: string) => void
}

type SortKey = 'date_desc' | 'date_asc' | 'return_desc' | 'return_asc'

const PAGE_SIZE = 10

function formatPct(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return formatCurrency(value)
}

function formatRunDate(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function deduplicateBySymbol(items: SimulationHistoryItem[]): SimulationHistoryItem[] {
  const map = new Map<string, SimulationHistoryItem>()
  for (const item of items) {
    const existing = map.get(item.assetSymbol)
    if (!existing || new Date(item.createdAt) > new Date(existing.createdAt)) {
      map.set(item.assetSymbol, item)
    }
  }
  return Array.from(map.values())
}

function sortItems(items: SimulationHistoryItem[], sort: SortKey): SimulationHistoryItem[] {
  const copy = [...items]
  switch (sort) {
    case 'date_desc':
      return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    case 'date_asc':
      return copy.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    case 'return_desc':
      return copy.sort((a, b) => b.baselineGrowthPct - a.baselineGrowthPct)
    case 'return_asc':
      return copy.sort((a, b) => a.baselineGrowthPct - b.baselineGrowthPct)
  }
}

// ── Note editor ───────────────────────────────────────────────────────────────

type NoteEditorProps = {
  simulationId: string
  initialNote: string | null
  token: string
  onSaved: (simulationId: string, notes: string | null) => void
  onUnauthorized: (message: string) => void
}

function NoteEditor({ simulationId, initialNote, token, onSaved, onUnauthorized }: NoteEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [value, setValue] = useState(initialNote ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleStartEdit() {
    setValue(initialNote ?? '')
    setIsEditing(true)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  function handleCancel() {
    setIsEditing(false)
    setError('')
  }

  async function handleSave() {
    setIsSaving(true)
    setError('')
    try {
      const updated = await updateSimulationHistoryNotes(token, simulationId, value.trim() || null)
      onSaved(simulationId, updated.notes)
      setIsEditing(false)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized('Your session expired. Log in again.')
        return
      }
      setError(err instanceof Error ? err.message : 'Unable to save note.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isEditing) {
    return (
      <div className="sim-note-editor">
        <textarea
          className="sim-note-textarea"
          maxLength={500}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Add a note about this simulation…"
          ref={textareaRef}
          rows={2}
          value={value}
        />
        {error ? <p className="sim-note-error">{error}</p> : null}
        <div className="sim-note-actions">
          <button
            className="sim-note-save-btn"
            disabled={isSaving}
            onClick={handleSave}
            type="button"
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
          <button
            className="sim-note-cancel-btn"
            disabled={isSaving}
            onClick={handleCancel}
            type="button"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <button className="sim-note-trigger" onClick={handleStartEdit} type="button">
      {initialNote
        ? <span className="sim-note-value">{initialNote}</span>
        : <span className="sim-note-placeholder">Add a note…</span>}
    </button>
  )
}

// ── History card ──────────────────────────────────────────────────────────────

type HistoryCardProps = {
  item: SimulationHistoryItem
  token: string
  isDeleting: boolean
  onDelete: (id: string) => void
  onRerun: (item: SimulationHistoryItem) => void
  onNoteSaved: (simulationId: string, notes: string | null) => void
  onUnauthorized: (message: string) => void
}

function HistoryCard({
  item,
  token,
  isDeleting,
  onDelete,
  onRerun,
  onNoteSaved,
  onUnauthorized,
}: HistoryCardProps) {
  const isGain = item.baselineGrowthPct >= 0

  return (
    <article className="sim-card">
      {/* Identity row */}
      <div className="sim-card-top">
        <div className="sim-card-identity">
          <MoverLogo name={item.assetName ?? item.assetSymbol} symbol={item.assetSymbol} />
          <div>
            <span className="sim-card-symbol">{item.assetSymbol}</span>
            {item.assetName ? (
              <span className="sim-card-name">{item.assetName}</span>
            ) : null}
          </div>
        </div>
        <span className="sim-card-date">{formatRunDate(item.createdAt)}</span>
      </div>

      {/* Params chips */}
      <div className="sim-card-chips">
        <span className="sim-chip">
          <span className="sim-chip-label">Horizon</span>
          <span className="sim-chip-value">{item.projectionYears}yr</span>
        </span>
        <span className="sim-chip">
          <span className="sim-chip-label">Start</span>
          <span className="sim-chip-value">{formatCompact(item.initialAmount)}</span>
        </span>
        {item.monthlyContribution > 0 && (
          <span className="sim-chip">
            <span className="sim-chip-label">Monthly</span>
            <span className="sim-chip-value">{formatCompact(item.monthlyContribution)}</span>
          </span>
        )}
        {item.inflationRate > 0 && (
          <span className="sim-chip sim-chip--accent">
            <span className="sim-chip-label">Inflation</span>
            <span className="sim-chip-value">{(item.inflationRate * 100).toFixed(1)}%</span>
          </span>
        )}
      </div>

      {/* Result band */}
      <div className="sim-card-result">
        <div className="sim-result-main">
          <span className="sim-result-arrow">→</span>
          <span className="sim-result-value">{formatCompact(item.baselineEndValue)}</span>
          <span className={`sim-result-growth ${isGain ? 'sim-result-growth--up' : 'sim-result-growth--down'}`}>
            {formatPct(item.baselineGrowthPct)}
          </span>
        </div>
        <div className="sim-result-meta">
          <span className="sim-result-range">
            {formatCompact(item.pessimisticEndValue)} – {formatCompact(item.optimisticEndValue)}
          </span>
          <span className="sim-result-range-label">scenario range</span>
        </div>
        <div className="sim-result-prob">
          <span className="sim-result-prob-value">
            {(item.probabilityOfProfit * 100).toFixed(0)}%
          </span>
          <span className="sim-result-prob-label">profit probability</span>
        </div>
      </div>

      {/* Note */}
      <div className="sim-card-note">
        <NoteEditor
          initialNote={item.notes}
          onSaved={onNoteSaved}
          onUnauthorized={onUnauthorized}
          simulationId={item.simulationId}
          token={token}
        />
      </div>

      {/* Footer actions */}
      <div className="sim-card-footer">
        <button
          className="sim-btn-rerun"
          onClick={() => onRerun(item)}
          type="button"
        >
          Re-run simulation
        </button>
        <button
          className="sim-btn-delete"
          disabled={isDeleting}
          onClick={() => onDelete(item.simulationId)}
          type="button"
        >
          {isDeleting ? 'Removing…' : 'Delete'}
        </button>
      </div>
    </article>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function SimulationHistoryPage({ token, onUnauthorized }: SimulationHistoryPageProps) {
  const navigate = useNavigate()

  const [history, setHistory] = useState<SimulationHistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [symbolFilter, setSymbolFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date_desc')
  const [page, setPage] = useState(0)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isClearing, setIsClearing] = useState(false)
  const [clearError, setClearError] = useState('')

  const abortRef = useRef<AbortController | null>(null)

  const loadHistory = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)
    setError('')
    try {
      const data = await fetchSimulationHistory(token, controller.signal)
      setHistory(data)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized('Your session expired. Log in again.')
        return
      }
      setError(err instanceof Error ? err.message : 'Unable to load simulation history.')
    } finally {
      setIsLoading(false)
    }
  }, [token, onUnauthorized])

  useEffect(() => {
    void loadHistory()
    return () => abortRef.current?.abort()
  }, [loadHistory])

  useEffect(() => {
    setPage(0)
  }, [symbolFilter, sortKey])

  async function handleDelete(simulationId: string) {
    setDeletingId(simulationId)
    try {
      await deleteSimulationHistoryItem(token, simulationId)
      setHistory((prev) => prev.filter((item) => item.simulationId !== simulationId))
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized('Your session expired. Log in again.')
      }
    } finally {
      setDeletingId(null)
    }
  }

  async function handleClearAll() {
    if (!window.confirm('Delete all simulation history? This cannot be undone.')) return
    setIsClearing(true)
    setClearError('')
    try {
      await clearSimulationHistory(token)
      setHistory([])
      setPage(0)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized('Your session expired. Log in again.')
        return
      }
      setClearError(err instanceof Error ? err.message : 'Unable to clear history.')
    } finally {
      setIsClearing(false)
    }
  }

  function handleRerun(item: SimulationHistoryItem) {
    navigate(`/instrument/${encodeURIComponent(item.assetSymbol)}/project`, {
      state: {
        prefill: {
          years: item.projectionYears,
          initialAmount: item.initialAmount,
          monthlyContribution: item.monthlyContribution,
          inflationRate: item.inflationRate,
        },
      },
    })
  }

  function handleNoteSaved(simulationId: string, notes: string | null) {
    setHistory((prev) =>
      prev.map((item) =>
        item.simulationId === simulationId ? { ...item, notes } : item,
      ),
    )
  }

  // Show only the most recent run per symbol
  const deduplicated = deduplicateBySymbol(history)

  const filtered = deduplicated.filter(
    (item) =>
      symbolFilter.trim() === '' ||
      item.assetSymbol.toUpperCase().includes(symbolFilter.toUpperCase()) ||
      (item.assetName ?? '').toLowerCase().includes(symbolFilter.toLowerCase()),
  )
  const sorted = sortItems(filtered, sortKey)
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageItems = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  return (
    <section className="sim-history-page page-section">

      {/* Hero header */}
      <div className="sim-history-hero">
        <div className="sim-history-hero-left">
          <Link className="forecast-back-link" to="/dashboard">← Dashboard</Link>
          <div className="sim-history-hero-text">
            <h1 className="sim-history-title">Simulation History</h1>
            <p className="sim-history-subtitle">
              Most recent growth projection per symbol
              {deduplicated.length > 0 ? ` · ${deduplicated.length} saved` : ''}
            </p>
          </div>
        </div>
        {history.length > 0 && (
          <button
            className="sim-history-clear-btn"
            disabled={isClearing}
            onClick={handleClearAll}
            type="button"
          >
            {isClearing ? 'Clearing…' : 'Clear all'}
          </button>
        )}
      </div>

      {clearError ? <p className="sim-history-inline-error">{clearError}</p> : null}

      {isLoading ? (
        <div className="sim-history-state-box">
          <p className="sim-history-state-text">Loading history…</p>
        </div>
      ) : error ? (
        <div className="sim-history-state-box">
          <p className="sim-history-state-text sim-history-state-text--error">{error}</p>
          <button className="sim-history-retry-btn" onClick={loadHistory} type="button">
            Try again
          </button>
        </div>
      ) : history.length === 0 ? (
        <div className="sim-history-state-box sim-history-state-box--empty">
          <div className="sim-history-empty-icon">📊</div>
          <p className="sim-history-empty-heading">No simulations yet</p>
          <p className="sim-history-empty-sub">
            Run a growth projection on any instrument and it will appear here automatically.
          </p>
        </div>
      ) : (
        <>
          {/* Controls */}
          <div className="sim-history-controls">
            <input
              className="sim-history-filter"
              onChange={(e) => { setSymbolFilter(e.target.value); setPage(0) }}
              placeholder="Filter by symbol or company name"
              type="text"
              value={symbolFilter}
            />
            <select
              className="sim-history-sort"
              onChange={(e) => { setSortKey(e.target.value as SortKey); setPage(0) }}
              value={sortKey}
            >
              <option value="date_desc">Newest first</option>
              <option value="date_asc">Oldest first</option>
              <option value="return_desc">Highest return</option>
              <option value="return_asc">Lowest return</option>
            </select>
          </div>

          {pageItems.length === 0 ? (
            <div className="sim-history-state-box">
              <p className="sim-history-state-text">No results match your filter.</p>
            </div>
          ) : (
            <div className="sim-history-list">
              {pageItems.map((item) => (
                <HistoryCard
                  isDeleting={deletingId === item.simulationId}
                  item={item}
                  key={item.simulationId}
                  onDelete={handleDelete}
                  onNoteSaved={handleNoteSaved}
                  onRerun={handleRerun}
                  onUnauthorized={onUnauthorized}
                  token={token}
                />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="sim-history-pagination">
              <button
                className="sim-page-btn"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                type="button"
              >
                ← Prev
              </button>
              <span className="sim-page-label">
                {safePage + 1} / {totalPages}
              </span>
              <button
                className="sim-page-btn"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                type="button"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
