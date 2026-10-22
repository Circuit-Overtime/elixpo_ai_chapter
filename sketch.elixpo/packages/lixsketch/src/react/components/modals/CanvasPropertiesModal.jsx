"use client"

import { useState, useEffect } from 'react'
import useUIStore from '../../store/useUIStore'
import useSketchStore from '../../store/useSketchStore'
import useAuthStore from '../../hooks/inertStores'
import useCollabStore from '../../hooks/inertStores'
import { useProfileStore } from '../../hooks/inertStores'
import { getSessionID } from '../../hooks/inertStores'
import { triggerDocCloudSync, persistLayoutMode } from '../../hooks/inertStores'

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function InfoRow({ label, value, icon, color }) {
  return (
    <div className="flex items-center justify-between py-2 px-1">
      <div className="flex items-center gap-2 text-text-dim text-xs">
        <i className={`bx ${icon} text-sm ${color || 'text-text-muted'}`} />
        {label}
      </div>
      <span className="text-text-secondary text-xs font-medium">{value}</span>
    </div>
  )
}

export default function CanvasPropertiesModal() {
  const isOpen = useUIStore((s) => s.canvasPropertiesOpen)
  const toggle = useUIStore((s) => s.toggleCanvasProperties)
  const workspaceName = useUIStore((s) => s.workspaceName)
  const saveStatus = useUIStore((s) => s.saveStatus)

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const authUser = useAuthStore((s) => s.user)
  const guestProfile = useProfileStore((s) => s.profile)

  const collabConnected = useCollabStore((s) => s.connected)
  const collabUsers = useCollabStore((s) => s.users)
  const adminUserId = useCollabStore((s) => s.adminUserId)
  const ws = useCollabStore((s) => s.ws)

  const layoutMode = useSketchStore((s) => s.layoutMode)
  const setLayoutMode = useSketchStore((s) => s.setLayoutMode)
  const handleSetLayout = (mode) => {
    if (mode === layoutMode) return
    setLayoutMode(mode)
    persistLayoutMode(mode)
  }

  // Determine if current user is admin
  const myUserId = isAuthenticated ? authUser?.id : guestProfile?.id
  const isAdmin = myUserId && adminUserId && myUserId === adminUserId

  const handleKickUser = (userId) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ type: 'kick', userId }))
  }

  const [stats, setStats] = useState({
    shapeCount: 0,
    canvasSize: '0 x 0',
    zoom: 1,
    dataSize: '0 B',
    sessionId: '',
  })

  useEffect(() => {
    if (!isOpen) return

    const shapes = window.shapes || []
    const vb = window.svg?.viewBox?.baseVal
    const zoom = window.currentZoom || 1
    const sessionId = getSessionID() || ''

    // Estimate canvas data size from localStorage (per-session key, fall
    // back to the legacy single-key entry).
    const sceneSavedKey = sessionId ? `lixsketch-autosave-${sessionId}` : 'lixsketch-autosave'
    const sceneSaved = localStorage.getItem(sceneSavedKey) || localStorage.getItem('lixsketch-autosave')
    const dataSize = sceneSaved ? new Blob([sceneSaved]).size : 0

    // Doc stats: pulled from the doc-autosave localStorage buffer.
    const docKey = sessionId ? `lixsketch-doc-autosave-${sessionId}` : 'lixsketch-doc-autosave'
    const docMetaKey = sessionId ? `lixsketch-doc-autosave-meta-${sessionId}` : 'lixsketch-doc-autosave-meta'
    const docSaved = localStorage.getItem(docKey)
    let docBlockCount = 0
    let docSize = 0
    let docSavedAt = null
    if (docSaved) {
      docSize = new Blob([docSaved]).size
      try {
        const parsed = JSON.parse(docSaved)
        if (Array.isArray(parsed?.blocks)) docBlockCount = parsed.blocks.length
        if (parsed?.savedAt) docSavedAt = parsed.savedAt
      } catch {}
    }
    let docCloudUpdatedAt = null
    try {
      const meta = JSON.parse(localStorage.getItem(docMetaKey) || '{}')
      docCloudUpdatedAt = meta?.lastSeenUpdatedAt || null
    } catch {}

    // Count shape types
    const typeCounts = {}
    shapes.forEach(s => {
      const name = s.shapeName || 'unknown'
      typeCounts[name] = (typeCounts[name] || 0) + 1
    })

    setStats({
      shapeCount: shapes.length,
      canvasSize: vb ? `${Math.round(vb.width)} x ${Math.round(vb.height)}` : 'N/A',
      zoom: Math.round(zoom * 100),
      dataSize: formatBytes(dataSize),
      sessionId,
      typeCounts,
      docBlockCount,
      docSize: formatBytes(docSize),
      docSavedAt,
      docCloudUpdatedAt,
    })
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e) => {
      if (e.key === 'Escape') toggle()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, toggle])

  if (!isOpen) return null

  const ownerName = isAuthenticated
    ? (authUser?.displayName || authUser?.email || 'You')
    : (guestProfile?.displayName || 'Guest')

  const ownerType = isAuthenticated ? 'Authenticated' : 'Guest'

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center font-[lixFont]"
      onClick={toggle}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative bg-surface-card border border-border-light rounded-2xl w-[380px] mx-4 max-h-[85vh] overflow-y-auto docs-scroll"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <i className="bx bx-info-circle text-lg text-accent-blue" />
            <h2 className="text-text-primary text-sm font-medium">Canvas Properties</h2>
          </div>
          <button
            onClick={toggle}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover cursor-pointer transition-all duration-200"
          >
            <i className="bx bx-x text-xl" />
          </button>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-3">
          {/* Workspace Info */}
          <div className="p-3 rounded-xl border border-border-light bg-surface/50">
            <p className="text-text-dim text-[10px] uppercase tracking-wider mb-2">Workspace</p>
            <InfoRow label="Name" value={workspaceName || 'Untitled'} icon="bx-rename" />
            <InfoRow label="Owner" value={ownerName} icon="bx-user" />
            <InfoRow label="Account" value={ownerType} icon="bx-shield" color={isAuthenticated ? 'text-green-400' : 'text-yellow-400'} />
            <InfoRow
              label="Session ID"
              value={
                <span className="font-mono text-[10px] text-text-dim max-w-[140px] truncate inline-block" title={stats.sessionId}>
                  {stats.sessionId}
                </span>
              }
              icon="bx-hash"
            />
          </div>

          {/* Canvas Stats */}
          <div className="p-3 rounded-xl border border-border-light bg-surface/50">
            <p className="text-text-dim text-[10px] uppercase tracking-wider mb-2">Canvas</p>
            <InfoRow label="Shapes" value={stats.shapeCount} icon="bx-shape-square" color="text-blue-400" />
            <InfoRow label="Viewport" value={stats.canvasSize} icon="bx-expand" />
            <InfoRow label="Zoom" value={`${stats.zoom}%`} icon="bx-zoom-in" />
            <InfoRow label="Local data" value={stats.dataSize} icon="bx-data" />

            {/* Shape breakdown */}
            {stats.typeCounts && Object.keys(stats.typeCounts).length > 0 && (
              <div className="mt-2 pt-2 border-t border-border-light">
                <p className="text-text-dim text-[10px] uppercase tracking-wider mb-1.5">Shape Breakdown</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(stats.typeCounts).map(([type, count]) => (
                    <span
                      key={type}
                      className="px-2 py-0.5 rounded-md bg-surface text-text-muted text-[10px] border border-border-light"
                    >
                      {type}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Document */}
          <div className="p-3 rounded-xl border border-border-light bg-surface/50">
            <div className="flex items-center justify-between mb-2">
              <p className="text-text-dim text-[10px] uppercase tracking-wider">Document</p>
              <button
                onClick={() => triggerDocCloudSync()}
                title="Force sync the doc to cloud"
                className="text-[10px] text-accent-blue hover:text-accent-blue-hover px-1.5 py-0.5 rounded hover:bg-accent-blue/10 cursor-pointer transition-all duration-200"
              >
                Sync now
              </button>
            </div>

            {/* Layout mode pill toggle */}
            <div className="flex items-center gap-1 bg-surface/60 border border-border-light rounded-lg p-0.5 mb-2">
              {[
                { key: 'canvas', icon: 'bx-pen', label: 'Canvas' },
                { key: 'split', icon: 'bx-layout', label: 'Split' },
                { key: 'docs', icon: 'bxs-notepad', label: 'Docs' },
              ].map((m) => {
                const active = layoutMode === m.key
                return (
                  <button
                    key={m.key}
                    onClick={() => handleSetLayout(m.key)}
                    className={`flex-1 flex items-center justify-center gap-1 h-6 rounded-md text-[10.5px] transition-all duration-150 ${
                      active
                        ? 'bg-accent-blue text-text-primary'
                        : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
                    }`}
                  >
                    <i className={`bx ${m.icon} text-[11px]`} />
                    {m.label}
                  </button>
                )
              })}
            </div>

            <InfoRow label="Blocks" value={stats.docBlockCount || 0} icon="bx-list-ul" color="text-purple-400" />
            <InfoRow label="Local size" value={stats.docSize || '0 B'} icon="bx-data" />
            <InfoRow
              label="Last local save"
              value={
                stats.docSavedAt
                  ? new Date(stats.docSavedAt).toLocaleTimeString()
                  : '—'
              }
              icon="bx-time"
            />
            <InfoRow
              label="Last cloud sync"
              value={
                stats.docCloudUpdatedAt
                  ? new Date(stats.docCloudUpdatedAt).toLocaleString()
                  : '—'
              }
              icon="bx-cloud"
              color={stats.docCloudUpdatedAt ? 'text-green-400' : 'text-text-muted'}
            />
          </div>

          {/* Save & Sync Status */}
          <div className="p-3 rounded-xl border border-border-light bg-surface/50">
            <p className="text-text-dim text-[10px] uppercase tracking-wider mb-2">Sync Status</p>
            <div className="flex items-center gap-2 py-1.5">
              <span className={`w-2 h-2 rounded-full ${
                saveStatus === 'cloud' ? 'bg-green-400' :
                saveStatus === 'local' ? 'bg-yellow-400' :
                'bg-text-dim'
              }`} />
              <span className="text-text-secondary text-xs">
                {saveStatus === 'cloud' ? 'Synced to cloud' :
                 saveStatus === 'local' ? 'Saved locally (pending cloud sync)' :
                 'Not saved yet'}
              </span>
            </div>
          </div>

          {/* Collaboration Status */}
          <div className="p-3 rounded-xl border border-border-light bg-surface/50">
            <div className="flex items-center justify-between mb-2">
              <p className="text-text-dim text-[10px] uppercase tracking-wider">Collaboration</p>
              {collabConnected && collabUsers && (
                <span className="text-text-dim text-[10px]">
                  {collabUsers.length} participant{collabUsers.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {collabConnected ? (
              <>
                <div className="flex items-center gap-2 py-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-green-400 text-xs">Live session active</span>
                  {isAdmin && (
                    <span className="ml-auto px-1.5 py-0.5 rounded bg-accent-blue/15 text-accent-blue text-[9px]">Admin</span>
                  )}
                </div>
                {collabUsers && collabUsers.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1">
                    {collabUsers.map((user, i) => {
                      const isMe = user.userId === myUserId
                      const isUserAdmin = user.userId === adminUserId
                      return (
                        <div
                          key={user.userId || i}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-surface/80 border border-border-light"
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: user.color || '#7667a8' }}
                          />
                          <span className="text-text-secondary text-[11px] flex-1 truncate">
                            {user.displayName || user.name || `User ${i + 1}`}
                            {isMe && <span className="text-text-dim ml-1">(you)</span>}
                          </span>
                          {isUserAdmin && (
                            <span className="text-[9px] text-accent-blue px-1 py-0.5 rounded bg-accent-blue/10">admin</span>
                          )}
                          {isAdmin && !isMe && (
                            <button
                              onClick={() => handleKickUser(user.userId)}
                              className="text-red-400/60 hover:text-red-400 text-[10px] px-1.5 py-0.5 rounded hover:bg-red-500/10 transition-all duration-200 cursor-pointer"
                              title={`Remove ${user.displayName || 'user'} from session`}
                            >
                              <i className="bx bx-x text-sm" />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 py-1.5">
                <span className="w-2 h-2 rounded-full bg-text-dim" />
                <span className="text-text-dim text-xs">No active session</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
