import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

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
  const d = new Date(createdAt)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
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

// ── Note editor sub-component ─────────────────────────────────────────────────

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
      <div className="sim-history-note-editor">
        <textarea
          className="sim-history-note-textarea"
          maxLength={500}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Add a note about this simulation…"
          ref={textareaRef}
          rows={3}
          value={value}
        />
        {error ? <p className="sim-history-note-error">{error}</p> : null}
        <div className="sim-history-note-actions">
          <button
            className="sim-history-note-save"
            disabled={isSaving}
            onClick={handleSave}
            type="button"
          >
            {isSaving ? 'Saving…' : 'Save note'}
          </button>
          <button
            className="sim-history-note-cancel"
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
    <div className="sim-history-note-display">
      {initialNote ? (
        <p className="sim-history-note-text">{initialNote}</p>
      ) : (
        <span className="sim-history-note-placeholder">No note</span>
      )}
      <button className="sim-history-note-edit-btn" onClick={handleStartEdit} type="button">
        {initialNote ? 'Edit' : 'Add note'}
      </button>
    </div>
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
    <div className="sim-history-card">
      <div className="sim-history-card-header">
        <div className="sim-history-card-identity">
          <MoverLogo name={item.assetName ?? item.assetSymbol} symbol={item.assetSymbol} />
          <div className="sim-history-card-symbol-block">
            <span className="sim-history-card-symbol">{item.assetSymbol}</span>
            {item.assetName ? (
              <span className="sim-history-card-name">{item.assetName}</span>
            ) : null}
          </div>
        </div>
        <span className="sim-history-card-date">{formatRunDate(item.createdAt)}</span>
      </div>

      <div className="sim-history-card-metrics">
        <div className="sim-history-metric">
          <span className="sim-history-metric-label">Horizon</span>
          <span className="sim-history-metric-value">{item.projectionYears}yr</span>
        </div>
        <div className="sim-history-metric">
          <span className="sim-history-metric-label">Initial</span>
          <span className="sim-history-metric-value">{formatCompact(item.initialAmount)}</span>
        </div>
        {item.monthlyContribution > 0 ? (
          <div className="sim-history-metric">
            <span className="sim-history-metric-label">Monthly</span>
            <span className="sim-history-metric-value">{formatCompact(item.monthlyContribution)}</span>
          </div>
        ) : null}
        {item.inflationRate > 0 ? (
          <div className="sim-history-metric">
            <span className="sim-history-metric-label">Inflation</span>
            <span className="sim-history-metric-value">{(item.inflationRate * 100).toFixed(1)}%</span>
          </div>
        ) : null}
      </div>

      <div className="sim-history-card-result">
        <div className="sim-history-result-arrow">→</div>
        <div className="sim-history-result-values">
          <span className="sim-history-result-baseline">{formatCompact(item.baselineEndValue)}</span>
          <span className={`sim-history-result-growth ${isGain ? 'positive-text' : 'negative-text'}`}>
            {formatPct(item.baselineGrowthPct)} baseline
          </span>
        </div>
        <div className="sim-history-result-range">
          <span className="sim-history-result-range-label">Range</span>
          <span className="sim-history-result-pessimistic">{formatCompact(item.pessimisticEndValue)}</span>
          <span className="sim-history-result-sep">–</span>
          <span className="sim-history-result-optimistic">{formatCompact(item.optimisticEndValue)}</span>
        </div>
        <div className="sim-history-result-prob">
          <span className="sim-history-result-prob-label">Probability of profit</span>
          <span className="sim-history-result-prob-value">
            {(item.probabilityOfProfit * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      <div className="sim-history-card-note">
        <NoteEditor
          initialNote={item.notes}
          onSaved={onNoteSaved}
          onUnauthorized={onUnauthorized}
          simulationId={item.simulationId}
          token={token}
        />
      </div>

      <div className="sim-history-card-footer">
        <button
          className="sim-history-btn-rerun"
          onClick={() => onRerun(item)}
          type="button"
        >
          Re-run
        </button>
        <button
          className="sim-history-btn-delete"
          disabled={isDeleting}
          onClick={() => onDelete(item.simulationId)}
          type="button"
        >
          {isDeleting ? 'Removing…' : 'Delete'}
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

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

  // Reset to page 0 whenever filter or sort changes
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
        return
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

  const filtered = history.filter((item) =>
    symbolFilter.trim() === '' ||
    item.assetSymbol.toUpperCase().includes(symbolFilter.toUpperCase()) ||
    (item.assetName ?? '').toLowerCase().includes(symbolFilter.toLowerCase()),
  )
  const sorted = sortItems(filtered, sortKey)
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageItems = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  return (
    <main className="sim-history-page">
      <div className="sim-history-header">
        <div className="sim-history-title-block">
          <h1 className="sim-history-title">Simulation History</h1>
          <p className="sim-history-subtitle">Past growth projections you have run</p>
        </div>
        {history.length > 0 ? (
          <button
            className="sim-history-clear-btn"
            disabled={isClearing}
            onClick={handleClearAll}
            type="button"
          >
            {isClearing ? 'Clearing…' : 'Clear all history'}
          </button>
        ) : null}
      </div>

      {clearError ? <p className="sim-history-error">{clearError}</p> : null}

      {isLoading ? (
        <p className="sim-history-loading">Loading history…</p>
      ) : error ? (
        <div className="sim-history-error-block">
          <p className="sim-history-error">{error}</p>
          <button className="sim-history-retry-btn" onClick={loadHistory} type="button">
            Retry
          </button>
        </div>
      ) : history.length === 0 ? (
        <div className="sim-history-empty">
          <p className="sim-history-empty-text">No simulations saved yet.</p>
          <p className="sim-history-empty-sub">
            Run a projection on any instrument page and it will appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="sim-history-controls">
            <input
              className="sim-history-filter-input"
              onChange={(e) => setSymbolFilter(e.target.value)}
              placeholder="Filter by symbol or name"
              type="text"
              value={symbolFilter}
            />
            <select
              className="sim-history-sort-select"
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              value={sortKey}
            >
              <option value="date_desc">Newest first</option>
              <option value="date_asc">Oldest first</option>
              <option value="return_desc">Highest return</option>
              <option value="return_asc">Lowest return</option>
            </select>
          </div>

          {pageItems.length === 0 ? (
            <p className="sim-history-no-results">No results match your filter.</p>
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

          {totalPages > 1 ? (
            <div className="sim-history-pagination">
              <button
                className="sim-history-page-btn"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                type="button"
              >
                ← Previous
              </button>
              <span className="sim-history-page-indicator">
                Page {safePage + 1} of {totalPages}
              </span>
              <button
                className="sim-history-page-btn"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                type="button"
              >
                Next →
              </button>
            </div>
          ) : null}
        </>
      )}
    </main>
  )
}
