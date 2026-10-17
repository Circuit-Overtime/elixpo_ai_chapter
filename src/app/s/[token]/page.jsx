'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { WORKER_URL } from '@/store/useAuthStore'
import useSketchStore from '@/store/useSketchStore'
import useUIStore from '@/store/useUIStore'
import { decrypt } from '@/utils/encryption'
import CanvasPage from '../../c/[sessionId]/page'

/**
 * Shareable link page: /s/{token}#key={encryptionKey}
 *
 * Flow:
 * 1. Extract token from URL path, encryption key from hash fragment
 * 2. Fetch encrypted scene data from worker API
 * 3. Decrypt with key from fragment
 * 4. Load scene via __sceneSerializer.loadScene()
 * 5. Apply permissions (view = viewMode, edit = normal)
 */
export default function SharedScenePage() {
  const params = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const token = params.token
    if (!token) {
      setError('Invalid share link')
      setLoading(false)
      return
    }

    // Extract encryption key from URL fragment
    const hash = window.location.hash
    const keyMatch = hash.match(/key=([^&]+)/)
    const encryptionKey = keyMatch?.[1]

    if (!encryptionKey) {
      setError('Missing encryption key — this link may be incomplete')
      setLoading(false)
      return
    }

    // Store the encryption key
    useUIStore.getState().setSessionEncryptionKey(encryptionKey)

    loadSharedScene(token, encryptionKey)
  }, [params.token])

  async function loadSharedScene(token, key) {
    try {
      // Fetch encrypted scene from worker
      const res = await fetch(`${WORKER_URL}/api/scenes/load?token=${encodeURIComponent(token)}`)

      if (!res.ok) {
        if (res.status === 404) {
          setError('Scene not found — this link may have expired')
        } else {
          setError('Failed to load scene')
        }
        setLoading(false)
        return
      }

      const { encryptedData, permission, workspaceName } = await res.json()

      // Decrypt the scene
      const sceneJson = await decrypt(encryptedData, key)
      const sceneData = JSON.parse(sceneJson)

      // Set workspace name
      if (workspaceName) {
        useUIStore.getState().setWorkspaceName(workspaceName)
      }

      // Wait for the engine to be ready
      await waitForEngine()

      // Load the scene
      const serializer = window.__sceneSerializer
      if (serializer) {
        serializer.load(sceneData)
      }

      // Apply permission
      if (permission === 'view') {
        const store = useSketchStore.getState()
        if (!store.viewMode) {
          store.toggleViewMode()
        }
      }

      setLoading(false)
    } catch (err) {
      console.error('[SharedScene] Failed to load:', err)
      if (err.name === 'OperationError') {
        setError('Decryption failed — the encryption key may be wrong')
      } else {
        setError('Failed to load scene: ' + err.message)
      }
      setLoading(false)
    }
  }

  // Wait for the sketch engine and serializer to be initialized
  function waitForEngine(timeout = 10000) {
    return new Promise((resolve, reject) => {
      const start = Date.now()
      const check = () => {
        if (window.__sceneSerializer) {
          resolve()
          return
        }
        if (Date.now() - start > timeout) {
          reject(new Error('Engine initialization timeout'))
          return
        }
        requestAnimationFrame(check)
      }
      check()
    })
  }

  // Render the full app with a loading/error overlay
  return (
    <>
      <CanvasPage />

      {/* Loading overlay */}
      {loading && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm font-[lixFont]">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-text-secondary text-sm">Loading shared scene...</p>
            <p className="text-text-dim text-xs mt-1">Decrypting with E2E encryption</p>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && !loading && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm font-[lixFont]">
          <div className="bg-surface-card border border-border-light rounded-2xl p-6 max-w-[360px] mx-4 text-center">
            <i className="bx bx-error-circle text-3xl text-red-400 mb-2" />
            <h2 className="text-text-primary text-base font-medium mb-2">Cannot Load Scene</h2>
            <p className="text-text-dim text-sm mb-4">{error}</p>
            <a
              href="/c/new"
              className="inline-block px-4 py-2 bg-accent-blue hover:bg-accent-blue-hover text-text-primary text-sm rounded-lg transition-all duration-200"
            >
              Start Fresh
            </a>
          </div>
        </div>
      )}
    </>
  )
}
