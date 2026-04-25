import { useCallback, useEffect, useState } from 'react'
import { type AdminAuditLogOut, fetchAuditLogs } from '../lib/api'
import '../styles/pages/AdminPages.css'

type AdminAuditLogsPageProps = {
  token: string
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function truncateId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id
}

export function AdminAuditLogsPage({ token }: AdminAuditLogsPageProps) {
  const [logs, setLogs] = useState<AdminAuditLogOut[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [pageError, setPageError] = useState('')

  const load = useCallback(
    async (nextPage: number, search: string) => {
      setIsLoading(true)
      setPageError('')
      try {
        const result = await fetchAuditLogs(token, {
          page: nextPage,
          pageSize: 25,
          search: search || undefined,
        })
        setLogs(result.items)
        setTotal(result.total)
        setTotalPages(result.totalPages)
      } catch (err) {
        setPageError(err instanceof Error ? err.message : 'Failed to load audit logs.')
      } finally {
        setIsLoading(false)
      }
    },
    [token],
  )

  useEffect(() => {
    void load(page, activeSearch)
  }, [load, page, activeSearch])

  function handleSearch() {
    setPage(1)
    setActiveSearch(searchInput.trim())
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSearch()
  }

  return (
    <section className="admin-page page-section">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Audit Logs</h1>
        <span className="admin-badge">Admin</span>
      </div>

      {pageError ? (
        <div className="admin-status-bar admin-status-bar--error">{pageError}</div>
      ) : null}

      <div className="admin-toolbar">
        <input
          className="admin-search-input"
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search by action, user ID, or details..."
          type="text"
          value={searchInput}
        />
        <button className="admin-search-button" onClick={handleSearch} type="button">
          Search
        </button>
        {activeSearch ? (
          <button
            className="ghost-action"
            onClick={() => {
              setSearchInput('')
              setActiveSearch('')
              setPage(1)
            }}
            type="button"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="admin-table-card">
        {isLoading ? (
          <p className="admin-loading">Loading audit logs...</p>
        ) : logs.length === 0 ? (
          <p className="admin-empty">No audit log entries found.</p>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Admin ID</th>
                  <th>Action</th>
                  <th>Target User</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <span className="admin-log-time">{formatDateTime(entry.createdAt)}</span>
                    </td>
                    <td>
                      <span title={entry.adminUserID}>{truncateId(entry.adminUserID)}</span>
                    </td>
                    <td>
                      <span className="admin-log-action">{entry.action}</span>
                    </td>
                    <td>
                      {entry.targetUserID ? (
                        <span title={entry.targetUserID}>{truncateId(entry.targetUserID)}</span>
                      ) : (
                        <span style={{ color: '#64748b' }}>—</span>
                      )}
                    </td>
                    <td>{entry.details ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(totalPages > 1 || total > 0) ? (
          <div className="admin-pagination">
            <span className="admin-pagination-info">
              {total} entr{total !== 1 ? 'ies' : 'y'} — page {page} of {totalPages}
            </span>
            <div className="admin-pagination-controls">
              <button
                className="admin-page-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                type="button"
              >
                ‹
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pageNum = Math.max(1, Math.min(page - 2, totalPages - 4)) + i
                if (pageNum < 1 || pageNum > totalPages) return null
                return (
                  <button
                    className={page === pageNum ? 'admin-page-btn admin-page-btn--active' : 'admin-page-btn'}
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    type="button"
                  >
                    {pageNum}
                  </button>
                )
              })}
              <button
                className="admin-page-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                type="button"
              >
                ›
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
