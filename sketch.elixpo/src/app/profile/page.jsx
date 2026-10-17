'use client'

import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useInView } from 'framer-motion'
import Link from 'next/link'
import useAuthStore from '@/store/useAuthStore'
import { useProfileStore } from '@/hooks/useGuestProfile'
import { WORKER_URL } from '@/lib/env'
import { getRememberedCanvasId } from '@/utils/canvasSession'
import CloudinaryIntegrationCard from '@/components/profile/CloudinaryIntegrationCard'
import PollinationsIntegrationCard from '@/components/profile/PollinationsIntegrationCard'
import PersonalDetailsCard from '@/components/profile/PersonalDetailsCard'
import LandingNav from '@/components/landing/LandingNav'
import McpWorkspaceAccessModal from '@/components/profile/McpWorkspaceAccessModal'
import { REMOTE_MCP_ENABLED } from '@/lib/featureFlags'

function reconcileActiveWorkspaceName(workspaces) {
  if (typeof window === 'undefined' || !Array.isArray(workspaces)) return workspaces || []
  try {
    const activeCanvasId = getRememberedCanvasId()
    const localWorkspaceName = localStorage.getItem('lixsketch-workspace-name')?.trim()
    if (!activeCanvasId || !localWorkspaceName) return workspaces
    return workspaces.map((workspace) => (
      workspace.session_id === activeCanvasId
        ? { ...workspace, workspace_name: localWorkspaceName }
        : workspace
    ))
  } catch {
    return workspaces
  }
}

function parseDatabaseDate(value) {
  if (!value) return null
  const normalized = /(?:z|[+-]\d\d:\d\d)$/i.test(value)
    ? value
    : `${String(value).replace(' ', 'T')}Z`
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

// ── Dot grid background ──────────────────────────────────────────────────────

function DotGrid() {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-60" width="100%" height="100%">
      <defs>
        <pattern id="profile-dot-grid" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="12" cy="12" r="0.9" fill="rgba(74, 144, 217, 0.18)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#profile-dot-grid)" />
    </svg>
  )
}

// ── Ambient glow ─────────────────────────────────────────────────────────────

function AmbientGlow() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div className="absolute -top-20 -left-32 w-[600px] h-[600px] rounded-full bg-[#4A90D9]/[0.05] blur-[130px]" />
      <div className="absolute top-[20%] -right-40 w-[500px] h-[500px] rounded-full bg-[#8B88E8]/[0.06] blur-[120px]" />
      <div className="absolute bottom-[10%] left-1/2 -translate-x-1/3 w-[700px] h-[350px] rounded-full bg-[#D99BF0]/[0.04] blur-[130px]" />
    </div>
  )
}

// ── RoughJS card ─────────────────────────────────────────────────────────────

function RoughCard({ children, color = '#4A90D9', className = '' }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    let raf
    const draw = async () => {
      const rough = (await import('roughjs')).default
      const { width, height } = container.getBoundingClientRect()
      canvas.width = width * 2
      canvas.height = height * 2
      canvas.style.width = width + 'px'
      canvas.style.height = height + 'px'
      const rc = rough.canvas(canvas)
      const ctx = canvas.getContext('2d')
      ctx.scale(2, 2)
      ctx.clearRect(0, 0, width, height)

      rc.rectangle(4, 4, width - 8, height - 8, {
        stroke: color,
        strokeWidth: 1.2,
        roughness: 1.2,
        bowing: 0.6,
        fill: 'transparent',
        fillStyle: 'solid',
      })
    }

    raf = requestAnimationFrame(draw)
    const ro = new ResizeObserver(() => { raf = requestAnimationFrame(draw) })
    ro.observe(container)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [color])

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
      <div className="relative z-10">{children}</div>
    </div>
  )
}

// ── Progress bar ─────────────────────────────────────────────────────────────

function UsageBar({ used, limit, color = '#4A90D9', label, unit = '', showRemaining = false }) {
  const pct = limit === 0 ? 0 : Math.min(100, (used / limit) * 100)
  const isNearLimit = pct >= 80

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-text-secondary text-xs">{label}</span>
        <span className={`text-xs font-mono ${isNearLimit ? 'text-red-400' : 'text-text-dim'}`}>
          {showRemaining && `${Math.max(0, limit - used).toFixed(2)}${unit} remaining · `}
          {used}{unit} / {limit}{unit}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-hover overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            backgroundColor: isNearLimit ? '#EF4444' : color,
          }}
        />
      </div>
    </div>
  )
}

function SectionIntro({ tab }) {
  return (
    <div className="flex flex-col gap-2 border-b border-white/[0.07] pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#8B88E8]">Profile</p>
        <h2 className="mt-1 flex items-center gap-2 text-lg font-medium font-[lixFont] text-text-primary">
          <i className={`bx ${tab.icon} text-[#A99CF1]`} />
          {tab.label}
        </h2>
        <p className="mt-1 max-w-xl text-xs leading-5 text-text-dim">{tab.description}</p>
      </div>
    </div>
  )
}

function MetricCard({ icon, label, value, detail, color = '#8B88E8' }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] uppercase tracking-wider text-text-dim">{label}</p>
          <p className="mt-1 text-lg font-medium text-text-primary">{value}</p>
        </div>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}18`, color }}>
          <i className={`bx ${icon} text-base`} />
        </span>
      </div>
      {detail && <p className="mt-2 text-[10px] leading-4 text-text-dim">{detail}</p>}
    </div>
  )
}

// ── Workspace card ───────────────────────────────────────────────────────────

function WorkspaceCard({ workspace, index, onDelete, onMcpAccess }) {
  const sizeKB = ((workspace.size_bytes || 0) / 1024).toFixed(1)
  const lastAccessedDate = parseDatabaseDate(workspace.last_accessed_at)
  const lastAccessed = lastAccessedDate
    ? lastAccessedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Never'
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const accessLabel = workspace.permission === 'edit'
    ? 'Editable link'
    : workspace.permission === 'view' ? 'View link' : 'Private'
  const hasActiveMcp = REMOTE_MCP_ENABLED && Number(workspace.active_mcp_grants || 0) > 0

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeleting(true)
    try {
      await onDelete(workspace)
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.25) }}
      className="group rounded-xl border border-white/[0.08] bg-[#141120]/80 p-3 transition-colors hover:border-[#8B88E8]/35 hover:bg-[#181426]"
    >
      <div className="flex items-start gap-2.5">
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#8B88E8]/12 text-[#A99CF1]">
          <i className="bx bx-shape-square text-base" />
          {hasActiveMcp && <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-[#141120] bg-[#54D6A0] text-[#141120]" title="Remote MCP active"><i className="bx bx-plug text-[9px]" /></span>}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-text-primary" title={workspace.workspace_name || 'Untitled'}>
            {workspace.workspace_name || 'Untitled'}
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-text-dim">
            <span><i className="bx bx-time-five mr-1" />{lastAccessed}</span>
            <span>{sizeKB} KB</span>
            <span>{accessLabel}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {hasActiveMcp && <span className="inline-flex items-center gap-1 rounded-full border border-[#54D6A0]/20 bg-[#54D6A0]/10 px-1.5 py-0.5 text-[8px] uppercase tracking-wide text-[#70DFB3]" title={`${workspace.active_mcp_grants} active Remote MCP client${Number(workspace.active_mcp_grants) === 1 ? '' : 's'}`}><i className="bx bx-plug text-[9px]" />MCP</span>}
          <span className="rounded-full bg-green-500/10 px-1.5 py-0.5 text-[8px] uppercase tracking-wide text-green-400" title="End-to-end encrypted">E2E</span>
        </div>
      </div>

      {workspace.template_mode === 'fork' && workspace.template_slug && (
        <Link href={`/templates/${workspace.template_slug}`} className="mt-2 inline-flex max-w-full items-center gap-1 truncate text-[9px] text-[#A99CF1] hover:underline">
          <i className="bx bx-git-repo-forked" />
          Forked from {workspace.template_title || 'template'}
        </Link>
      )}

      <div className="mt-3 flex gap-1.5 border-t border-white/[0.06] pt-2.5">
        <Link
          href={`/c/${workspace.session_id}`}
          className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg bg-[#8B88E8] px-2 py-1.5 text-[10px] text-white transition-colors hover:bg-[#9E91EE]"
        >
          <i className="bx bx-window-open" />
          Open canvas
        </Link>
        {onMcpAccess && (
          <button
            type="button"
            onClick={() => { if (REMOTE_MCP_ENABLED) onMcpAccess(workspace) }}
            disabled={!REMOTE_MCP_ENABLED}
            className="flex cursor-pointer items-center justify-center gap-1 rounded-lg border border-[#8B88E8]/30 px-2.5 py-1.5 text-[10px] text-[#B6ACF4] transition-colors hover:bg-[#8B88E8]/10 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
            title={REMOTE_MCP_ENABLED ? 'Manage Remote MCP access' : 'Remote MCP is coming soon'}
          >
            <i className="bx bx-plug text-xs" />
            {REMOTE_MCP_ENABLED ? 'Remote MCP' : 'MCP · Coming soon'}
          </button>
        )}
        <button
          onClick={handleDelete}
          onMouseLeave={() => setConfirmDelete(false)}
          disabled={deleting}
          className={`min-w-8 cursor-pointer rounded-lg border px-2 py-1.5 text-[10px] transition-all ${
            confirmDelete
              ? 'border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20'
              : 'border-white/10 text-text-dim hover:border-red-500/30 hover:text-red-400'
          } ${deleting ? 'cursor-not-allowed opacity-50' : ''}`}
          title={confirmDelete ? 'Click again to confirm' : 'Delete workspace'}
        >
          {deleting ? <i className="bx bx-loader-alt bx-spin text-xs" /> : confirmDelete ? 'Confirm?' : <i className="bx bx-trash text-xs" />}
        </button>
      </div>
    </motion.div>
  )
}

// ── Tier badge ───────────────────────────────────────────────────────────────

const TIER_COLORS = {
  guest: { bg: 'bg-white/5', text: 'text-text-dim', border: 'border-white/10' },
  free: { bg: 'bg-[#4A90D9]/10', text: 'text-[#4A90D9]', border: 'border-[#4A90D9]/20' },
  pro: { bg: 'bg-[#8B88E8]/10', text: 'text-[#8B88E8]', border: 'border-[#8B88E8]/20' },
  team: { bg: 'bg-[#D99BF0]/10', text: 'text-[#D99BF0]', border: 'border-[#D99BF0]/20' },
}

const PROFILE_TABS = [
  { id: 'personal', label: 'Personal', icon: 'bx-user', description: 'Manage the identity and public details shown across LixSketch.' },
  { id: 'workspaces', label: 'Workspaces', icon: 'bx-grid-alt', description: 'Open, review, and manage every canvas owned by this profile.' },
  { id: 'integrations', label: 'Integrations', icon: 'bx-plug', description: 'Connect private storage providers and control where new media is uploaded.' },
  { id: 'usage', label: 'Usage', icon: 'bx-bar-chart-alt-2', description: 'Track workspace capacity, managed media, collaboration, and export access.' },
  { id: 'billing', label: 'Billing', icon: 'bx-credit-card', description: 'Review the current plan, included limits, and billing availability.' },
]

function profileTabFromLocation() {
  if (typeof window === 'undefined') return 'personal'
  const requested = new URLSearchParams(window.location.search).get('tab')
  return PROFILE_TABS.some((tab) => tab.id === requested) ? requested : 'personal'
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router = useRouter()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user = useAuthStore((s) => s.user)
  const login = useAuthStore((s) => s.login)
  const logout = useAuthStore((s) => s.logout)
  const init = useAuthStore((s) => s.init)
  const authLoading = useAuthStore((s) => s.loading)

  const [quotaData, setQuotaData] = useState(null)
  const [workspaces, setWorkspaces] = useState([])
  const [publishedTemplates, setPublishedTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('personal')
  const [mcpWorkspace, setMcpWorkspace] = useState(null)

  const handleMcpGrantCountChange = useCallback((sessionId, count) => {
    setWorkspaces((current) => current.map((workspace) => (
      workspace.session_id === sessionId
        ? { ...workspace, active_mcp_grants: count }
        : workspace
    )))
  }, [])

  const headerRef = useRef(null)
  const headerInView = useInView(headerRef, { once: true })

  // Generate a fresh session ID for the "New" workspace button
  const newSessionId = useMemo(
    () => `lx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    []
  )

  // Init auth on mount
  useEffect(() => { init() }, [init])

  useEffect(() => {
    const syncTab = () => setActiveTab(profileTabFromLocation())
    syncTab()
    window.addEventListener('popstate', syncTab)
    return () => window.removeEventListener('popstate', syncTab)
  }, [])

  const selectTab = (tabId) => {
    setActiveTab(tabId)
    const destination = new URL(window.location.href)
    destination.searchParams.set('tab', tabId)
    destination.hash = tabId === 'integrations' ? 'integrations' : ''
    window.history.pushState({}, '', `${destination.pathname}${destination.search}${destination.hash}`)
  }

  // Fetch quota + workspaces
  useEffect(() => {
    if (authLoading) return
    const fetchData = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (isAuthenticated && user?.id) {
          params.set('userId', user.id)
        } else {
          const profile = useProfileStore.getState().profile
          const guestId = profile?.id || localStorage.getItem('lixsketch-guest-session')
          if (guestId) params.set('guestId', guestId)
          else { setLoading(false); return }
        }

        const [quotaRes, wsRes, templatesRes] = await Promise.all([
          fetch(`${WORKER_URL}/api/user/quota-summary?${params}`),
          fetch(`${WORKER_URL}/api/scenes/list?${params}`),
          isAuthenticated ? fetch('/api/templates?mine=1') : Promise.resolve(null),
        ])

        if (quotaRes.ok) {
          const q = await quotaRes.json()
          setQuotaData(q)
        }
        if (wsRes.ok) {
          const w = await wsRes.json()
          setWorkspaces(reconcileActiveWorkspaceName(w.workspaces))
        }
        if (templatesRes?.ok) {
          const published = await templatesRes.json()
          setPublishedTemplates(published.templates || [])
        } else if (!isAuthenticated) {
          setPublishedTemplates([])
        }
      } catch (err) {
        console.warn('[Profile] Failed to fetch data:', err)
      }
      setLoading(false)
    }
    fetchData()
  }, [authLoading, isAuthenticated, user?.id])

  const handleDeleteWorkspace = async (workspace) => {
    try {
      const profile = useProfileStore.getState().profile
      const createdBy = isAuthenticated && user?.id ? user.id : (profile?.id || localStorage.getItem('lixsketch-guest-session'))

      const res = await fetch(`${WORKER_URL}/api/scenes/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: workspace.session_id,
          createdBy,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to delete')
      }

      // Remove from local state
      setWorkspaces((prev) => prev.filter((ws) => ws.session_id !== workspace.session_id))
      // Update quota count
      if (quotaData) {
        setQuotaData((prev) => prev ? { ...prev, workspaceCount: Math.max(0, (prev.workspaceCount || 1) - 1) } : prev)
      }
    } catch (err) {
      console.error('[Profile] Failed to delete workspace:', err)
    }
  }

  const tier = quotaData?.tier || (isAuthenticated ? 'free' : 'guest')
  const tierStyle = TIER_COLORS[tier] || TIER_COLORS.guest

  const workspaceLimit = quotaData?.workspaces?.limit || (isAuthenticated ? 2 : 1)
  const fallbackStorageLimit = (isAuthenticated ? 5 : 2) * 1024 * 1024 * workspaceLimit
  const managedStorageUsedBytes = Number(quotaData?.storage?.accountUsedBytes || 0)
  const managedStorageLimitBytes = Number(quotaData?.storage?.accountLimitBytes || fallbackStorageLimit)
  const managedStorageUsedMB = Number((managedStorageUsedBytes / (1024 * 1024)).toFixed(2))
  const managedStorageLimitMB = Number((managedStorageLimitBytes / (1024 * 1024)).toFixed(2))
  const perWorkspaceImageLimitMB = Math.round((quotaData?.storage?.limitBytes || (isAuthenticated ? 5 : 2) * 1024 * 1024) / (1024 * 1024))
  const managedStorageRemainingMB = Number(Math.max(0, managedStorageLimitMB - managedStorageUsedMB).toFixed(2))
  const workspaceRemaining = Math.max(0, workspaceLimit - workspaces.length)
  const maxCollaborators = quotaData?.collaboration?.maxParticipants || (isAuthenticated ? 3 : 1)
  const pdfExport = Boolean(quotaData?.exports?.pdf)
  const activeTabDetails = PROFILE_TABS.find((tab) => tab.id === activeTab) || PROFILE_TABS[0]
  const workspaceUsagePercent = workspaceLimit > 0
    ? Math.min(100, (workspaces.length / workspaceLimit) * 100)
    : 0

  return (
    <div className="profile-page relative min-h-screen bg-[#0a0a12] text-text-primary overflow-hidden">
      <LandingNav />
      <DotGrid />
      <AmbientGlow />

      <div className="relative z-10 max-w-3xl mx-auto px-6 pb-16 pt-20 sm:pt-24">
        {/* Back link */}
        <motion.div
          ref={headerRef}
          initial={{ opacity: 0, y: 20 }}
          animate={headerInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 text-text-dim text-xs hover:text-text-secondary transition-colors mb-8 bg-transparent border-none cursor-pointer"
          >
            <i className="bx bx-arrow-back text-sm" />
            Back
          </button>

          {/* Profile header */}
          <div className="flex items-start gap-4 mb-8">
            <div className="w-14 h-14 rounded-xl bg-accent-blue/20 flex items-center justify-center shrink-0">
              {isAuthenticated && user?.avatar ? (
                <img src={user.avatar} alt="" className="w-14 h-14 rounded-xl" referrerPolicy="no-referrer" />
              ) : (
                <i className="bx bx-user text-2xl text-accent-blue" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-medium font-[lixFont] text-text-primary truncate">
                  {isAuthenticated ? (user?.displayName || user?.email || 'User') : 'Guest'}
                </h1>
                <span className={`px-2 py-0.5 text-[10px] rounded-full font-medium uppercase tracking-wider border ${tierStyle.bg} ${tierStyle.text} ${tierStyle.border}`}>
                  {tier}
                </span>
              </div>
              {isAuthenticated && user?.email && (
                <p className="text-text-dim text-xs truncate">{user.email}</p>
              )}
              {!isAuthenticated && (
                <p className="text-text-dim text-xs">Sign in to unlock 2 workspaces, larger images, and live collaboration</p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              {isAuthenticated ? (
                <button
                  onClick={logout}
                  className="px-3 py-1.5 rounded-lg text-xs text-text-dim border border-white/10 hover:border-red-500/30 hover:text-red-400 transition-all"
                >
                  Sign out
                </button>
              ) : (
                <button
                  onClick={() => login()}
                  className="px-4 py-1.5 rounded-lg text-xs text-white bg-accent-blue hover:bg-accent-blue/80 transition-all"
                >
                  Sign in
                </button>
              )}
            </div>
          </div>
        </motion.div>

        <nav className="mb-8 flex gap-1 overflow-x-auto rounded-xl border border-[#8B88E8]/20 bg-[#151321]/80 p-1.5" aria-label="Profile sections">
          {PROFILE_TABS.map((tab) => {
            const selected = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectTab(tab.id)}
                className={`flex min-w-max flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors ${selected
                  ? 'bg-[#8B88E8]/20 text-[#B6ACF4]'
                  : 'text-text-dim hover:bg-white/[0.04] hover:text-text-secondary'
                }`}
                aria-current={selected ? 'page' : undefined}
              >
                <i className={`bx ${tab.icon} text-sm`} />
                {tab.label}
              </button>
            )
          })}
        </nav>

        {loading || authLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="relative w-8 h-8">
              <div className="absolute inset-0 rounded-full border-2 border-accent-blue/20" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent-blue animate-spin" />
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <SectionIntro tab={activeTabDetails} />

            {/* Usage overview */}
            {activeTab === 'usage' && <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard icon="bx-grid-alt" label="Workspace slots" value={`${workspaceRemaining} left`} detail={`${workspaces.length} of ${workspaceLimit} currently used`} color="#8B88E8" />
                <MetricCard icon="bx-data" label="Managed storage" value={`${managedStorageRemainingMB} MB`} detail={`${managedStorageUsedMB} MB used account-wide`} color="#2ECC71" />
                <MetricCard icon="bx-group" label="Live collaboration" value={`${maxCollaborators} people`} detail="Maximum participants in one realtime room" color="#D99BF0" />
                <MetricCard icon="bx-file" label="PDF export" value={pdfExport ? 'Included' : 'Pro only'} detail={pdfExport ? 'Available on the current plan' : 'Canvas image exports remain available'} color="#F2C94C" />
              </div>
              <RoughCard color="#8B88E8">
                <div className="p-5">
                  <h2 className="text-sm font-medium font-[lixFont] text-text-primary mb-4 flex items-center gap-2">
                    <i className="bx bx-bar-chart-alt-2 text-[#8B88E8]" />
                    Usage
                  </h2>

                  <UsageBar
                    label="Workspaces"
                    used={workspaces.length}
                    limit={workspaceLimit}
                    color="#4A90D9"
                  />

                  <UsageBar
                    label="Managed storage (all workspaces)"
                    used={managedStorageUsedMB}
                    limit={managedStorageLimitMB}
                    color="#2ECC71"
                    unit=" MB"
                    showRemaining
                  />

                  {tier !== 'pro' && tier !== 'team' && (
                    <Link
                      href="/pricing"
                      className="inline-flex items-center gap-1.5 mt-2 text-[#8B88E8] text-xs hover:underline"
                    >
                      <i className="bx bx-rocket text-sm" />
                      Upgrade for more
                    </Link>
                  )}
                </div>
              </RoughCard>
            </motion.div>}

            {/* Workspaces */}
            {activeTab === 'workspaces' && <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-medium font-[lixFont] text-text-primary">Your canvases</h3>
                  <p className="mt-1 text-[10px] text-text-dim">Workspace names, activity, scene size, and access history.</p>
                </div>
                {workspaces.length < workspaceLimit && (
                  <Link
                    href={`/c/${newSessionId}?new=1`}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-accent-blue border border-accent-blue/20 hover:bg-accent-blue/10 transition-all"
                  >
                    <i className="bx bx-plus text-sm" />
                    New
                  </Link>
                )}
              </div>

              {workspaces.length === 0 ? (
                <RoughCard color="#333">
                  <div className="p-8 text-center">
                    <i className="bx bx-folder-open text-3xl text-text-dim mb-2" />
                    <p className="text-text-dim text-sm mb-3">No workspaces yet</p>
                    <Link
                      href={`/c/${newSessionId}?new=1`}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 text-white text-xs rounded-lg transition-all"
                    >
                      <i className="bx bx-pencil text-sm" />
                      Start Sketching
                    </Link>
                  </div>
                </RoughCard>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {workspaces.map((ws, i) => (
                    <WorkspaceCard key={ws.id || ws.session_id} workspace={ws} index={i} onDelete={handleDeleteWorkspace} onMcpAccess={isAuthenticated ? setMcpWorkspace : null} />
                  ))}
                </div>
              )}

              <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-3">
                <div className="mb-2 flex items-center justify-between gap-3 text-[10px]">
                  <span className="text-text-secondary">Workspace usage</span>
                  <span className="font-mono text-[#B6ACF4]">{workspaces.length} / {workspaceLimit}</span>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]"
                  role="progressbar"
                  aria-label="Workspace usage"
                  aria-valuemin={0}
                  aria-valuemax={workspaceLimit}
                  aria-valuenow={workspaces.length}
                >
                  <div className="h-full rounded-full bg-gradient-to-r from-[#7568C8] to-[#B094EA] transition-[width] duration-500" style={{ width: `${workspaceUsagePercent}%` }} />
                </div>
                <p className="mt-2 text-[9px] text-text-dim">{workspaceRemaining} workspace slot{workspaceRemaining === 1 ? '' : 's'} remaining on the {tier} plan.</p>
              </div>

              {isAuthenticated && <div className="mt-8 border-t border-border-light pt-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium font-[lixFont] text-text-primary">Published templates</h3>
                    <p className="mt-1 text-[10px] text-text-dim">Public snapshots others can fork or clone.</p>
                  </div>
                  <Link href="/templates" className="flex items-center gap-1 rounded-lg border border-accent-blue/20 px-3 py-1.5 text-xs text-accent-blue transition hover:bg-accent-blue/10"><i className="bx bx-world" />Browse</Link>
                </div>
                {publishedTemplates.length ? <div className="grid gap-3 sm:grid-cols-2">
                  {publishedTemplates.map((template) => <Link key={template.id} href={`/templates/${template.slug}`} className="rounded-xl border border-border-light bg-surface-card p-4 transition hover:border-accent-blue/40">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm text-text-primary">{template.title}</p><p className="mt-1 text-[10px] text-text-dim">{template.status === 'published' ? 'Public' : 'Unpublished'} · {template.forks} forks · {template.clones} clones</p></div><i className="bx bx-link-external text-accent-blue" /></div>
                  </Link>)}
                </div> : <div className="rounded-xl border border-dashed border-border-light p-5 text-center text-xs text-text-dim">Publish from a canvas using Save &amp; Export.</div>}
              </div>}
            </motion.div>}

            {/* Account details for authenticated users */}
            {activeTab === 'personal' && isAuthenticated && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3 }}
              >
                <PersonalDetailsCard />
              </motion.div>
            )}

            {activeTab === 'integrations' && isAuthenticated && (
              <div className="space-y-4">
                <CloudinaryIntegrationCard
                  managedUsage={{
                    usedBytes: managedStorageUsedBytes,
                    limitBytes: managedStorageLimitBytes,
                  }}
                />
                <PollinationsIntegrationCard />
              </div>
            )}

            {/* Guest info card */}
            {activeTab === 'personal' && !isAuthenticated && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3 }}
              >
                <RoughCard color="#555">
                  <div className="p-5">
                    <h2 className="text-sm font-medium font-[lixFont] text-text-primary mb-3 flex items-center gap-2">
                      <i className="bx bx-info-circle text-text-dim" />
                      Guest Account
                    </h2>
                    <div className="space-y-2 text-xs text-text-dim">
                      <p>You're using LixSketch as a guest. Your workspace data is stored locally and synced to the cloud under a guest session.</p>
                      <ul className="space-y-1.5 mt-3">
                        <li className="flex items-center gap-2">
                          <i className="bx bx-check text-green-400" />
                          <span className="text-text-secondary">1 workspace</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <i className="bx bx-check text-green-400" />
                          <span className="text-text-secondary">2 MB image limit per workspace</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <i className="bx bx-x text-red-400" />
                          <span className="text-text-secondary">Unused workspaces deleted after 1 month</span>
                        </li>
                      </ul>
                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={() => login()}
                          className="px-4 py-2 rounded-lg text-xs text-white bg-accent-blue hover:bg-accent-blue/80 transition-all"
                        >
                          Sign in for free
                        </button>
                        <Link
                          href="/pricing"
                          className="px-4 py-2 rounded-lg text-xs text-text-dim border border-white/10 hover:border-white/20 hover:text-text-secondary transition-all"
                        >
                          View plans
                        </Link>
                      </div>
                    </div>
                  </div>
                </RoughCard>
              </motion.div>
            )}

            {activeTab === 'integrations' && !isAuthenticated && (
              <RoughCard color="#8B88E8">
                <div id="integrations" className="p-8 text-center">
                  <i className="bx bx-plug mb-3 text-3xl text-[#A99CF1]" />
                  <h2 className="text-sm font-medium text-text-primary">Personal integrations</h2>
                  <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-text-dim">
                    Sign in to connect your own Cloudinary product environment and keep personal media outside the managed workspace allowance.
                  </p>
                  <button type="button" onClick={() => login('/profile?tab=integrations')} className="mt-4 cursor-pointer rounded-lg bg-[#8B88E8] px-4 py-2 text-xs text-white hover:bg-[#9E91EE]">
                    Sign in to connect
                  </button>
                </div>
              </RoughCard>
            )}

            {activeTab === 'billing' && (
              <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard icon="bx-grid-alt" label="Workspaces" value={workspaceLimit} detail={`${workspaces.length} currently in use`} />
                <MetricCard icon="bx-image" label="Images" value={`${perWorkspaceImageLimitMB} MB`} detail="Managed media per workspace" color="#2ECC71" />
                <MetricCard icon="bx-group" label="Collaboration" value={maxCollaborators} detail="People per realtime room" color="#D99BF0" />
                <MetricCard icon="bx-file" label="PDF export" value={pdfExport ? 'Included' : 'Not included'} detail="Lossless image export remains available" color="#F2C94C" />
              </div>
              <RoughCard color="#8B88E8">
                <div className="p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="flex items-center gap-2 text-sm font-medium text-text-primary">
                        <i className="bx bx-credit-card text-[#A99CF1]" />
                        Billing
                      </h2>
                      <p className="mt-2 text-xs leading-5 text-text-dim">
                        Pro billing is in early access. Viewing plans will not charge you or change your current account.
                      </p>
                    </div>
                    <span className={`w-fit rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wider ${tierStyle.bg} ${tierStyle.text} ${tierStyle.border}`}>
                      {tier} plan
                    </span>
                  </div>
                  <div className="mt-5 grid gap-3 border-y border-white/[0.07] py-4 text-xs sm:grid-cols-3">
                    <div>
                      <p className="text-text-dim">Workspaces</p>
                      <p className="mt-1 text-text-secondary">{workspaceLimit}</p>
                    </div>
                    <div>
                      <p className="text-text-dim">Managed images</p>
                      <p className="mt-1 text-text-secondary">{quotaData?.storage?.limitBytes ? `${Math.round(quotaData.storage.limitBytes / (1024 * 1024))} MB / workspace` : '—'}</p>
                    </div>
                    <div>
                      <p className="text-text-dim">Billing status</p>
                      <p className="mt-1 text-text-secondary">{tier === 'pro' || tier === 'team' ? 'Early access' : 'No active subscription'}</p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-text-dim">Next charge</span>
                      <span className="text-text-secondary">No scheduled charge</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-2">
                      <span className="text-text-dim">Invoices</span>
                      <span className="text-text-secondary">No invoices yet</span>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link href="/pricing" className="cursor-pointer rounded-lg bg-[#8B88E8] px-4 py-2 text-xs text-white hover:bg-[#9E91EE]">
                      View plans
                    </Link>
                    {!isAuthenticated && (
                      <button type="button" onClick={() => login()} className="cursor-pointer rounded-lg border border-[#8B88E8]/30 px-4 py-2 text-xs text-[#A99CF1] hover:bg-[#8B88E8]/10">
                        Sign in
                      </button>
                    )}
                  </div>
                </div>
              </RoughCard>
              </div>
            )}
          </div>
        )}
      </div>
      {REMOTE_MCP_ENABLED && mcpWorkspace && <McpWorkspaceAccessModal workspace={mcpWorkspace} onClose={() => setMcpWorkspace(null)} onGrantCountChange={handleMcpGrantCountChange} />}
    </div>
  )
}
