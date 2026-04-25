import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type AdminUserOut,
  type AdminUserUpdatePayload,
  deleteAdminUser,
  demoteUser,
  fetchAdminUsers,
  forceLogoutUser,
  promoteUser,
  resendVerification,
  sendPasswordResetAdmin,
  setUserStatus,
  updateAdminUser,
} from '../lib/api'
import '../styles/pages/AdminPages.css'

type AdminUsersPageProps = {
  token: string
}

type ConfirmAction = {
  label: string
  description: string
  variant: 'danger' | 'warn'
  onConfirm: () => Promise<void>
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function AdminUsersPage({ token }: AdminUsersPageProps) {
  const [users, setUsers] = useState<AdminUserOut[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [pageError, setPageError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')
  const [actionError, setActionError] = useState('')
  const [pendingActionId, setPendingActionId] = useState('')
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [selectedUser, setSelectedUser] = useState<AdminUserOut | null>(null)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editError, setEditError] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showSuccess = useCallback((msg: string) => {
    setActionSuccess(msg)
    if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current)
    successTimeoutRef.current = setTimeout(() => setActionSuccess(''), 4000)
  }, [])

  const load = useCallback(
    async (nextPage: number, search: string) => {
      setIsLoading(true)
      setPageError('')
      try {
        const result = await fetchAdminUsers(token, { page: nextPage, pageSize: 20, search: search || undefined })
        setUsers(result.items)
        setTotal(result.total)
        setTotalPages(result.totalPages)
      } catch (err) {
        setPageError(err instanceof Error ? err.message : 'Failed to load users.')
      } finally {
        setIsLoading(false)
      }
    },
    [token],
  )

  useEffect(() => {
    void load(page, activeSearch)
  }, [load, page, activeSearch])

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current)
    }
  }, [])

  function handleSearch() {
    setPage(1)
    setActiveSearch(searchInput.trim())
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSearch()
  }

  function updateUserInList(updated: AdminUserOut) {
    setUsers((prev) => prev.map((u) => (u.userID === updated.userID ? updated : u)))
    if (selectedUser?.userID === updated.userID) setSelectedUser(updated)
  }

  async function runAction(
    userId: string,
    action: () => Promise<AdminUserOut | void>,
    successMsg: string,
  ) {
    setPendingActionId(userId)
    setActionError('')
    try {
      const result = await action()
      if (result && typeof result === 'object' && 'userID' in result) {
        updateUserInList(result as AdminUserOut)
      }
      showSuccess(successMsg)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed.')
    } finally {
      setPendingActionId('')
    }
  }

  function openConfirm(action: ConfirmAction) {
    setConfirmAction(action)
  }

  function openDetail(user: AdminUserOut) {
    setSelectedUser(user)
    setEditDisplayName(user.displayName)
    setEditError('')
  }

  async function handleSaveEdit() {
    if (!selectedUser) return
    setIsSavingEdit(true)
    setEditError('')
    try {
      const payload: AdminUserUpdatePayload = {}
      if (editDisplayName.trim() !== selectedUser.displayName) {
        payload.displayName = editDisplayName.trim()
      }
      if (Object.keys(payload).length === 0) {
        setSelectedUser(null)
        return
      }
      const updated = await updateAdminUser(token, selectedUser.userID, payload)
      updateUserInList(updated)
      showSuccess('User updated.')
      setSelectedUser(null)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setIsSavingEdit(false)
    }
  }

  async function handleVerifyNow(user: AdminUserOut) {
    setPendingActionId(user.userID)
    setActionError('')
    try {
      const now = new Date().toISOString()
      const updated = await updateAdminUser(token, user.userID, { emailVerifiedAt: now })
      updateUserInList(updated)
      showSuccess('Email marked as verified.')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed.')
    } finally {
      setPendingActionId('')
    }
  }

  return (
    <section className="admin-page page-section">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Users</h1>
        <span className="admin-badge">Admin</span>
      </div>

      {actionSuccess ? (
        <div className="admin-status-bar admin-status-bar--success">{actionSuccess}</div>
      ) : null}
      {actionError ? (
        <div className="admin-status-bar admin-status-bar--error">{actionError}</div>
      ) : null}
      {pageError ? (
        <div className="admin-status-bar admin-status-bar--error">{pageError}</div>
      ) : null}

      <div className="admin-toolbar">
        <input
          className="admin-search-input"
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search by name or email..."
          type="text"
          value={searchInput}
        />
        <button className="admin-search-button" onClick={handleSearch} type="button">
          Search
        </button>
        {activeSearch ? (
          <button
            className="ghost-action"
            onClick={() => { setSearchInput(''); setActiveSearch(''); setPage(1) }}
            type="button"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="admin-table-card">
        {isLoading ? (
          <p className="admin-loading">Loading users...</p>
        ) : users.length === 0 ? (
          <p className="admin-empty">No users found.</p>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Provider</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Verified</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.userID}>
                    <td>{user.displayName}</td>
                    <td>{user.email}</td>
                    <td>{user.primaryAuthProvider}</td>
                    <td>
                      <span className={user.isAdmin ? 'admin-pill admin-pill--admin' : 'admin-pill admin-pill--user'}>
                        {user.isAdmin ? 'Admin' : 'User'}
                      </span>
                    </td>
                    <td>
                      <span className={user.isActive ? 'admin-pill admin-pill--active' : 'admin-pill admin-pill--inactive'}>
                        {user.isActive ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td>
                      <span className={user.emailVerifiedAt ? 'admin-pill admin-pill--verified' : 'admin-pill admin-pill--unverified'}>
                        {user.emailVerifiedAt ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td>{formatDate(user.createdAt)}</td>
                    <td>
                      <div className="admin-row-actions">
                        <button
                          className="admin-action-btn admin-action-btn--neutral"
                          disabled={pendingActionId === user.userID}
                          onClick={() => openDetail(user)}
                          type="button"
                        >
                          Edit
                        </button>
                        <button
                          className={user.isActive ? 'admin-action-btn admin-action-btn--warn' : 'admin-action-btn admin-action-btn--primary'}
                          disabled={pendingActionId === user.userID}
                          onClick={() =>
                            openConfirm({
                              label: user.isActive ? 'Deactivate user' : 'Activate user',
                              description: user.isActive
                                ? `Deactivate ${user.email}? They will not be able to log in.`
                                : `Reactivate ${user.email}?`,
                              variant: user.isActive ? 'warn' : 'warn',
                              onConfirm: () =>
                                runAction(
                                  user.userID,
                                  () => setUserStatus(token, user.userID, !user.isActive),
                                  user.isActive ? 'User deactivated.' : 'User activated.',
                                ),
                            })
                          }
                          type="button"
                        >
                          {user.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          className="admin-action-btn admin-action-btn--neutral"
                          disabled={pendingActionId === user.userID}
                          onClick={() =>
                            runAction(
                              user.userID,
                              () => forceLogoutUser(token, user.userID),
                              'User logged out of all sessions.',
                            )
                          }
                          type="button"
                        >
                          Force logout
                        </button>
                        {user.isAdmin ? (
                          <button
                            className="admin-action-btn admin-action-btn--warn"
                            disabled={pendingActionId === user.userID}
                            onClick={() =>
                              openConfirm({
                                label: 'Demote admin',
                                description: `Remove admin access from ${user.email}?`,
                                variant: 'warn',
                                onConfirm: () =>
                                  runAction(
                                    user.userID,
                                    () => demoteUser(token, user.userID),
                                    'Admin access removed.',
                                  ),
                              })
                            }
                            type="button"
                          >
                            Demote
                          </button>
                        ) : (
                          <button
                            className="admin-action-btn admin-action-btn--primary"
                            disabled={pendingActionId === user.userID}
                            onClick={() =>
                              runAction(
                                user.userID,
                                () => promoteUser(token, user.userID),
                                'User promoted to admin.',
                              )
                            }
                            type="button"
                          >
                            Promote
                          </button>
                        )}
                        {!user.emailVerifiedAt ? (
                          <button
                            className="admin-action-btn admin-action-btn--primary"
                            disabled={pendingActionId === user.userID}
                            onClick={() =>
                              runAction(
                                user.userID,
                                () => resendVerification(token, user.userID),
                                'Verification email sent.',
                              )
                            }
                            type="button"
                          >
                            Send verify
                          </button>
                        ) : null}
                        {!user.emailVerifiedAt ? (
                          <button
                            className="admin-action-btn admin-action-btn--neutral"
                            disabled={pendingActionId === user.userID}
                            onClick={() => handleVerifyNow(user)}
                            type="button"
                          >
                            Mark verified
                          </button>
                        ) : null}
                        <button
                          className="admin-action-btn admin-action-btn--neutral"
                          disabled={pendingActionId === user.userID}
                          onClick={() =>
                            runAction(
                              user.userID,
                              () => sendPasswordResetAdmin(token, user.userID),
                              'Password reset email sent.',
                            )
                          }
                          type="button"
                        >
                          Reset pw
                        </button>
                        <button
                          className="admin-action-btn admin-action-btn--danger"
                          disabled={pendingActionId === user.userID}
                          onClick={() =>
                            openConfirm({
                              label: 'Delete user',
                              description: `Permanently delete ${user.email}? This cannot be undone.`,
                              variant: 'danger',
                              onConfirm: async () => {
                                setPendingActionId(user.userID)
                                setActionError('')
                                try {
                                  await deleteAdminUser(token, user.userID)
                                  setUsers((prev) => prev.filter((u) => u.userID !== user.userID))
                                  setTotal((t) => t - 1)
                                  if (selectedUser?.userID === user.userID) setSelectedUser(null)
                                  showSuccess('User deleted.')
                                } catch (err) {
                                  setActionError(err instanceof Error ? err.message : 'Delete failed.')
                                } finally {
                                  setPendingActionId('')
                                }
                              },
                            })
                          }
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 || total > 0 ? (
          <div className="admin-pagination">
            <span className="admin-pagination-info">
              {total} user{total !== 1 ? 's' : ''} total — page {page} of {totalPages}
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

      {/* Confirmation modal */}
      {confirmAction ? (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true">
          <div className="admin-modal">
            <h2 className="admin-modal-title">{confirmAction.label}</h2>
            <p className="admin-modal-body">{confirmAction.description}</p>
            <div className="admin-modal-actions">
              <button
                className="ghost-action"
                onClick={() => setConfirmAction(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className={confirmAction.variant === 'danger' ? 'admin-action-btn admin-action-btn--danger' : 'admin-action-btn admin-action-btn--warn'}
                onClick={async () => {
                  const action = confirmAction
                  setConfirmAction(null)
                  await action.onConfirm()
                }}
                style={{ height: 40, padding: '0 18px', fontSize: '0.9rem' }}
                type="button"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Detail / edit panel */}
      {selectedUser ? (
        <div className="admin-detail-panel" role="complementary" aria-label="User details">
          <div className="admin-detail-header">
            <h2>User details</h2>
            <button
              aria-label="Close"
              className="admin-detail-close"
              onClick={() => setSelectedUser(null)}
              type="button"
            >
              ×
            </button>
          </div>
          <div className="admin-detail-body">
            <section className="admin-detail-section">
              <p className="admin-detail-section-title">Account</p>
              <div className="admin-detail-row">
                <span className="admin-detail-label">ID</span>
                <span className="admin-detail-value">{selectedUser.userID}</span>
              </div>
              <div className="admin-detail-row">
                <span className="admin-detail-label">Email</span>
                <span className="admin-detail-value">{selectedUser.email}</span>
              </div>
              <div className="admin-detail-row">
                <span className="admin-detail-label">Provider</span>
                <span className="admin-detail-value">{selectedUser.primaryAuthProvider}</span>
              </div>
              <div className="admin-detail-row">
                <span className="admin-detail-label">Role</span>
                <span className="admin-detail-value">{selectedUser.isAdmin ? 'Admin' : 'User'}</span>
              </div>
              <div className="admin-detail-row">
                <span className="admin-detail-label">Status</span>
                <span className="admin-detail-value">{selectedUser.accountStatus}</span>
              </div>
              <div className="admin-detail-row">
                <span className="admin-detail-label">Verified</span>
                <span className="admin-detail-value">{formatDate(selectedUser.emailVerifiedAt)}</span>
              </div>
              <div className="admin-detail-row">
                <span className="admin-detail-label">Joined</span>
                <span className="admin-detail-value">{formatDate(selectedUser.createdAt)}</span>
              </div>
              <div className="admin-detail-row">
                <span className="admin-detail-label">Last login</span>
                <span className="admin-detail-value">{formatDate(selectedUser.lastLoginAt)}</span>
              </div>
              <div className="admin-detail-row">
                <span className="admin-detail-label">Risk profile</span>
                <span className="admin-detail-value">{selectedUser.riskProfile ?? '—'}</span>
              </div>
            </section>

            <section className="admin-detail-section">
              <p className="admin-detail-section-title">Edit</p>
              {editError ? (
                <p className="error-text">{editError}</p>
              ) : null}
              <div className="admin-edit-form">
                <div className="field">
                  <label className="field-label" htmlFor="admin-edit-name">Display name</label>
                  <input
                    className="input"
                    id="admin-edit-name"
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    type="text"
                    value={editDisplayName}
                  />
                </div>
                <div className="admin-edit-actions">
                  <button
                    className="search-button"
                    disabled={isSavingEdit}
                    onClick={handleSaveEdit}
                    type="button"
                  >
                    {isSavingEdit ? 'Saving...' : 'Save changes'}
                  </button>
                  <button
                    className="ghost-action"
                    onClick={() => setSelectedUser(null)}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </section>
  )
}
