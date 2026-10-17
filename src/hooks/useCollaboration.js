"use client"

import { useEffect, useRef } from 'react'
import useCollabStore from '@/store/useCollabStore'
import useAuthStore from '@/store/useAuthStore'
import { useProfileStore } from '@/hooks/useGuestProfile'
import useUIStore from '@/store/useUIStore'
import { encrypt, decrypt } from '@/utils/encryption'

import { COLLAB_URL } from '@/lib/env'
const PING_INTERVAL = 25000
const RECONNECT_BASE = 1000
const RECONNECT_MAX = 30000
const SCENE_SYNC_DEBOUNCE = 80
const PRESENCE_BUFFER_LIMIT = 64 * 1024

export default function useCollaboration(roomId) {
  const wsRef = useRef(null)
  const pingRef = useRef(null)
  const reconnectRef = useRef(null)
  const reconnectDelay = useRef(RECONNECT_BASE)
  const intentionalClose = useRef(false)
  const syncTimerRef = useRef(null)
  const snapshotInFlightRef = useRef(false)
  const snapshotQueuedRef = useRef(false)
  const applyingRemoteRef = useRef(false)
  const clientSeqRef = useRef(0)
  const lastServerSeqRef = useRef(0)
  const messageChainRef = useRef(Promise.resolve())
  const anonymousIdRef = useRef(null)
  const clientIdRef = useRef(null)

  if (!anonymousIdRef.current && typeof crypto !== 'undefined') {
    anonymousIdRef.current = `anon-${crypto.randomUUID().slice(0, 12)}`
  }
  if (!clientIdRef.current && typeof window !== 'undefined') {
    // Stable for reconnects in this tab, unique across tabs so one browser can
    // join twice without one socket replacing the other.
    clientIdRef.current = crypto.randomUUID()
  }

  useEffect(() => {
    if (!roomId) return
    intentionalClose.current = false
    let disposed = false
    let engineWaitTimer = null

    function getRoomKey() {
      let key = useUIStore.getState().sessionEncryptionKey
      if (!key) {
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
        key = hash.get('key') || useUIStore.getState().loadEncryptionKeyForSession(roomId)
      }
      if (key) useUIStore.getState().setSessionEncryptionKey(key, roomId)
      return key
    }

    // Wait for engine to be ready
    const waitForEngine = () => {
      if (disposed) return
      if (window.__sketchStoreApi) {
        connect()
      } else {
        engineWaitTimer = setTimeout(waitForEngine, 200)
      }
    }

    function getIdentity() {
      const authUser = useAuthStore.getState().user
      const profile = useProfileStore.getState().profile
      return {
        userId: authUser?.id || profile?.id || anonymousIdRef.current || 'anonymous',
        displayName: authUser?.displayName || profile?.displayName || 'Anonymous',
        avatar: authUser?.avatar || profile?.avatar || '',
        authToken: useAuthStore.getState().sessionToken || '',
      }
    }

    function connect() {
      if (wsRef.current?.readyState === WebSocket.OPEN
        || wsRef.current?.readyState === WebSocket.CONNECTING) return

      const roomKey = getRoomKey()
      if (!roomKey) {
        useCollabStore.getState().setError('This collaboration link is missing its encryption key.')
        return
      }

      const { userId, displayName, avatar, authToken } = getIdentity()
      const workspaceName = useUIStore.getState().workspaceName || 'Untitled'

      const params = new URLSearchParams({
        userId,
        clientId: clientIdRef.current,
        displayName: btoa(encodeURIComponent(displayName)),
        avatar: avatar || '',
        workspaceName: btoa(encodeURIComponent(workspaceName)),
      })
      if (authToken) params.set('authToken', authToken)
      const invite = new URLSearchParams(window.location.search).get('invite')
      const adminToken = sessionStorage.getItem(`lixsketch-collab-admin:${roomId}`)
      if (invite) params.set('invite', invite)
      if (adminToken) params.set('adminToken', adminToken)

      const wsUrl = `${COLLAB_URL.replace(/\/$/, '')}/room/${encodeURIComponent(roomId)}?${params}`
      console.log('[Collab] Connecting to room', roomId)

      const ws = new WebSocket(wsUrl)
      wsRef.current = ws
      const collabStore = useCollabStore.getState()
      collabStore.setConnecting(true)
      collabStore.setWs(ws)

      ws.onopen = () => {
        console.log('[Collab] Connected')
        useCollabStore.getState().setConnected(true)
        useCollabStore.getState().setError(null)
        reconnectDelay.current = RECONNECT_BASE

        // Start ping keepalive
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
          }
        }, PING_INTERVAL)
      }

      ws.onmessage = (event) => {
        let msg
        try {
          msg = JSON.parse(event.data)
        } catch {
          return
        }
        // Keep encrypted scene updates in server order even when decrypting
        // one payload takes longer than the next.
        messageChainRef.current = messageChainRef.current
          .then(() => handleMessage(msg, ws))
          .catch((error) => {
            console.error('[Collab] Failed to process message:', error)
            useCollabStore.getState().setError('Could not apply a collaboration update.')
          })
      }

      ws.onclose = (event) => {
        console.log('[Collab] Disconnected:', event.code, event.reason)
        cleanup()
        useCollabStore.getState().setConnected(false)
        if (wsRef.current === ws) {
          wsRef.current = null
          useCollabStore.getState().setWs(null)
        }

        if (!intentionalClose.current) {
          scheduleReconnect()
        }
      }

      ws.onerror = () => {
        // onclose will fire after this
      }
    }

    async function handleMessage(msg, ws) {
      const store = useCollabStore.getState()

      switch (msg.type) {
        case 'room-info':
          store.setRoomInfo(msg)
          if (msg.adminToken) {
            sessionStorage.setItem(`lixsketch-collab-admin:${roomId}`, msg.adminToken)
          }
          // Store session ID for the room
          window.__sessionID = roomId
          // If we're not the first user, request a sync
          if (msg.users.length > 1) {
            ws.send(JSON.stringify({
              type: 'sync-request',
              lastServerSeq: 0,
            }))
          }
          break

        case 'join':
          store.addUser({
            userId: msg.from,
            connectionId: msg.connectionId,
            displayName: msg.displayName,
            avatar: msg.avatar,
            color: msg.color,
            role: msg.role || 'editor',
            isAdmin: !!msg.isAdmin,
          })
          break

        case 'leave':
          store.removeUser(msg.connectionId || msg.from)
          // Remove cursor
          removeCursor(msg.connectionId || msg.from)
          break

        case 'presence':
          store.updatePresence(msg.connectionId || msg.from, msg.cursor)
          renderCursor(msg.connectionId || msg.from, msg.cursor, msg.displayName, msg.color)
          break

        case 'op':
          if (msg.serverSeq && msg.serverSeq <= lastServerSeqRef.current) break
          lastServerSeqRef.current = msg.serverSeq || lastServerSeqRef.current
          await applyScenePayload(msg.payload)
          break

        case 'agent-op':
          if (msg.serverSeq && msg.serverSeq <= lastServerSeqRef.current) break
          lastServerSeqRef.current = msg.serverSeq || lastServerSeqRef.current
          await applyScenePayload(msg.payload)
          if (Number.isInteger(msg.revision)) {
            window.__cloudSceneRevisionSession = roomId
            window.__cloudSceneRevision = msg.revision
          }
          showAgentEditToast(msg.displayName || 'MCP agent')
          window.dispatchEvent(new CustomEvent('lix-agent-scene-applied', { detail: { agent: msg.displayName, revision: msg.revision } }))
          break

        case 'sync-needed': {
          // Another user needs our scene state
          const serializer = window.__sceneSerializer
          if (serializer) {
            const sceneData = serializer.save()
            const payload = await encrypt(JSON.stringify(sceneData), getRoomKey())
            ws.send(JSON.stringify({
              type: 'sync-response',
              targetConnectionId: msg.requestedBy,
              payload,
            }))
          }
          break
        }

        case 'sync-response': {
          // Full scene from another user
          const serializer = window.__sceneSerializer
          if (serializer && msg.payload) {
            try {
              await applyScenePayload(msg.payload)
              lastServerSeqRef.current = Math.max(lastServerSeqRef.current, msg.serverSeq || 0)
              console.log('[Collab] Scene synced from peer')
            } catch (e) {
              console.error('[Collab] Failed to load synced scene:', e)
            }
          }
          break
        }

        case 'kicked':
          console.warn('[Collab] Kicked from room:', msg.reason)
          intentionalClose.current = true
          ws.close()
          store.reset()
          // Show a notification to the user
          if (typeof window !== 'undefined') {
            const toast = document.getElementById('save-toast')
            if (toast) {
              toast.innerHTML = '<i class="bx bx-block text-red-400 mr-1.5"></i>You were removed from the session'
              toast.classList.remove('hidden')
              setTimeout(() => toast.classList.add('hidden'), 4000)
            }
          }
          break

        case 'access-updated':
          store.updateUserAccess(msg.userId, msg.role)
          break

        case 'room-settings':
          store.setRoomSettings(msg)
          break

        case 'invite-rotated':
          store.setInviteToken(msg.inviteToken, msg.inviteVersion)
          break

        case 'invite-invalidated':
          store.setRoomSettings({ inviteVersion: msg.inviteVersion })
          break

        case 'sharing-disabled':
          intentionalClose.current = true
          store.setRoomSettings({ sharingEnabled: false })
          store.setError('The workspace owner stopped live sharing.')
          ws.close(1000, 'sharing-disabled')
          break

        case 'room-expired':
        case 'room-closed':
          console.warn('[Collab] Room closed:', msg.type)
          intentionalClose.current = true
          ws.close()
          break

        case 'error':
          console.warn('[Collab] Server error:', msg.code)
          store.setError(humanizeServerError(msg.code))
          if (['ROOM_EXPIRED', 'ROOM_IDLE_TIMEOUT', 'ROOM_CLOSED'].includes(msg.code)) {
            intentionalClose.current = true
            ws.close(1000, msg.code)
          }
          break

        case 'pong':
          break
      }
    }

    async function applyScenePayload(payload) {
      if (!payload || !window.__sceneSerializer) return
      const plaintext = await decrypt(payload, getRoomKey())
      const sceneData = JSON.parse(plaintext)
      applyingRemoteRef.current = true
      try {
        window.__sceneSerializer.load(sceneData)
        window.rebindUndoHistory?.(window.shapes || [])
      } finally {
        applyingRemoteRef.current = false
      }
    }

    async function sendSceneSnapshot() {
      const ws = wsRef.current
      const serializer = window.__sceneSerializer
      if (!ws || ws.readyState !== WebSocket.OPEN || !serializer || applyingRemoteRef.current) return
      if (useCollabStore.getState().myRole !== 'editor') return
      if (snapshotInFlightRef.current) {
        snapshotQueuedRef.current = true
        return
      }
      snapshotInFlightRef.current = true
      try {
        const sceneData = serializer.save(useUIStore.getState().workspaceName || 'Untitled')
        const payload = await encrypt(JSON.stringify(sceneData), getRoomKey())
        ws.send(JSON.stringify({
          type: 'op',
          seq: ++clientSeqRef.current,
          payload,
        }))
      } catch (error) {
        console.error('[Collab] Failed to publish scene update:', error)
        useCollabStore.getState().setError('Could not publish the latest canvas update.')
      } finally {
        snapshotInFlightRef.current = false
        if (snapshotQueuedRef.current) {
          snapshotQueuedRef.current = false
          queueMicrotask(sendSceneSnapshot)
        }
      }
    }

    function scheduleSceneSnapshot() {
      if (applyingRemoteRef.current) return
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
      syncTimerRef.current = setTimeout(() => {
        syncTimerRef.current = null
        sendSceneSnapshot()
      }, SCENE_SYNC_DEBOUNCE)
    }

    window.__collabSceneChanged = scheduleSceneSnapshot
    window.__applyRemoteOp = (sceneData) => {
      if (!sceneData || !window.__sceneSerializer) return
      applyingRemoteRef.current = true
      try {
        window.__sceneSerializer.load(sceneData)
        window.rebindUndoHistory?.(window.shapes || [])
      }
      finally { applyingRemoteRef.current = false }
    }

    // --- Cursor rendering ---

    const cursors = new Map()

    function renderCursor(userId, cursor, displayName, color) {
      if (!cursor || !window.svg) return

      let el = cursors.get(userId)
      if (!el) {
        el = document.createElementNS('http://www.w3.org/2000/svg', 'g')
        el.setAttribute('class', 'remote-cursor')
        el.setAttribute('data-user', userId)
        el.style.pointerEvents = 'none'

        // Cursor arrow
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        path.setAttribute('d', 'M0,0 L0,14 L4,11 L7,17 L9,16 L6,10 L11,10 Z')
        path.setAttribute('fill', color || '#5B57D1')
        path.setAttribute('stroke', '#000')
        path.setAttribute('stroke-width', '0.5')
        el.appendChild(path)

        // Name tag
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        bg.setAttribute('rx', '3')
        bg.setAttribute('fill', color || '#5B57D1')
        bg.setAttribute('y', '18')
        bg.setAttribute('x', '2')
        el.appendChild(bg)

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
        text.setAttribute('fill', '#fff')
        text.setAttribute('font-size', '9')
        text.setAttribute('font-family', 'lixFont, sans-serif')
        text.setAttribute('y', '27')
        text.setAttribute('x', '5')
        text.textContent = displayName || userId.slice(0, 8)
        el.appendChild(text)

        // Size the bg after text is measurable
        requestAnimationFrame(() => {
          const bbox = text.getBBox?.()
          if (bbox) {
            bg.setAttribute('width', bbox.width + 6)
            bg.setAttribute('height', bbox.height + 4)
          }
        })

        window.svg.appendChild(el)
        cursors.set(userId, el)
      }

      const zoom = Math.max(0.05, Number(window.currentZoom) || 1)
      el.setAttribute('transform', `translate(${cursor.x}, ${cursor.y}) scale(${1 / zoom})`)
    }

    function removeCursor(userId) {
      const el = cursors.get(userId)
      if (el) {
        el.remove()
        cursors.delete(userId)
      }
    }

    // --- Presence broadcasting ---

    let pendingPointer = null
    let presenceFrame = 0
    function flushPresence() {
      presenceFrame = 0
      const e = pendingPointer
      pendingPointer = null
      if (!e) return
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > PRESENCE_BUFFER_LIMIT) return

      // Convert screen coords to SVG viewBox coords
      const svg = window.svg
      if (!svg) return
      const pt = svg.createSVGPoint()
      pt.x = e.clientX
      pt.y = e.clientY
      const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse())

      ws.send(JSON.stringify({
        type: 'presence',
        cursor: { x: Math.round(svgPt.x), y: Math.round(svgPt.y) },
      }))
    }

    function onPointerMove(e) {
      pendingPointer = { clientX: e.clientX, clientY: e.clientY }
      if (!presenceFrame) presenceFrame = requestAnimationFrame(flushPresence)
    }

    document.addEventListener('pointermove', onPointerMove, { passive: true })

    // --- Reconnection ---

    function scheduleReconnect() {
      if (intentionalClose.current || reconnectRef.current) return
      const delay = reconnectDelay.current
      console.log(`[Collab] Reconnecting in ${delay}ms...`)
      reconnectRef.current = setTimeout(() => {
        reconnectRef.current = null
        reconnectDelay.current = Math.min(delay * 2, RECONNECT_MAX)
        connect()
      }, delay)
    }

    function cleanup() {
      if (pingRef.current) {
        clearInterval(pingRef.current)
        pingRef.current = null
      }
    }

    waitForEngine()

    window.__disconnectCollaboration = () => {
      intentionalClose.current = true
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      reconnectRef.current = null
      if (wsRef.current) wsRef.current.close(1000, 'session-ended')
    }

    return () => {
      disposed = true
      intentionalClose.current = true
      document.removeEventListener('pointermove', onPointerMove)
      if (presenceFrame) cancelAnimationFrame(presenceFrame)
      cleanup()
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      if (engineWaitTimer) clearTimeout(engineWaitTimer)
      // Clean up cursors
      cursors.forEach((el) => el.remove())
      cursors.clear()
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      useCollabStore.getState().reset()
      delete window.__collabSceneChanged
      delete window.__applyRemoteOp
      delete window.__disconnectCollaboration
    }
  }, [roomId])
}

function showAgentEditToast(agent) {
  const toast = document.getElementById('save-toast')
  if (!toast) return
  toast.textContent = `${agent} updated the canvas`
  toast.classList.remove('hidden')
  clearTimeout(toast._hideTimer)
  toast._hideTimer = setTimeout(() => toast.classList.add('hidden'), 3500)
}

function humanizeServerError(code) {
  switch (code) {
    case 'ROOM_EXPIRED': return 'This collaboration room has expired.'
    case 'ROOM_IDLE_TIMEOUT': return 'This collaboration room closed after being idle.'
    case 'ROOM_FULL': return 'This collaboration room is full.'
    case 'NOT_AUTHORIZED': return 'You are not allowed to perform that action.'
    case 'INVALID_OPERATION': return 'A collaboration update was rejected.'
    case 'READ_ONLY': return 'You have view-only access to this workspace.'
    case 'ROOM_SHARING_DISABLED': return 'Live sharing is disabled for this workspace.'
    case 'INVALID_INVITE': return 'This collaboration invite is no longer valid.'
    default: return 'The collaboration server reported an error.'
  }
}
