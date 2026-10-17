"use client"

import { useEffect } from 'react'
import useSketchStore, { TOOLS, SHORTCUT_MAP } from '@/store/useSketchStore'
import useUIStore from '@/store/useUIStore'
import { showToast } from '@/utils/toast'

export default function useKeyboardShortcuts() {
  useEffect(() => {
    function handleKeyDown(e) {
      const key = e.key.toLowerCase()

      // Escape is modal-global and must work even when focus is inside an
      // input or textarea. Close every open modal in one state update so
      // overlapping dialogs cannot leave a hidden modal behind.
      if (e.key === 'Escape') {
        const uiStore = useUIStore.getState()
        const hasOpenModal = [
          uiStore.saveModalOpen,
          uiStore.aiModalOpen,
          uiStore.commandPaletteOpen,
          uiStore.exportImageModalOpen,
          uiStore.findBarOpen,
          uiStore.canvasPropertiesOpen,
          uiStore.imageGenerateModalOpen,
        ].some(Boolean)
        if (hasOpenModal) {
          e.preventDefault()
          e.stopImmediatePropagation()
          uiStore.closeAllModals()
          return
        }
      }

      // Global Ctrl shortcuts (work even when typing)
      if (e.ctrlKey || e.metaKey) {
        const zoomDirection = (key === '+' || key === '=' || e.code === 'NumpadAdd')
          ? 1
          : (key === '-' || e.code === 'NumpadSubtract')
            ? -1
            : 0
        if (zoomDirection !== 0) {
          if (!e.defaultPrevented) {
            e.preventDefault()
            if (typeof window.zoomFromCenter === 'function') {
              window.zoomFromCenter(zoomDirection)
            }
          }
          return
        }
        if (key === '0' || e.code === 'Numpad0') {
          if (!e.defaultPrevented) {
            e.preventDefault()
            if (typeof window.zoomReset === 'function') window.zoomReset()
          }
          return
        }
        if (key === 's' && e.shiftKey) {
          e.preventDefault()
          useUIStore.getState().toggleSaveModal()
          return
        }
        if (key === 's' && !e.shiftKey) {
          e.preventDefault()
          const serializer = window.__sceneSerializer
          if (serializer) {
            const workspaceName = useUIStore.getState().workspaceName || 'Untitled'
            serializer.download(workspaceName)
              .then(({ fileName }) => showToast(`Saved ${fileName}`, { tone: 'success', duration: 1800 }))
              .catch(() => showToast('Could not save the .lixjson file', { tone: 'warn' }))
          }
          return
        }
        if (key === '/') {
          e.preventDefault()
          useUIStore.getState().toggleCommandPalette()
          return
        }
        if (key === 'o') {
          e.preventDefault()
          const serializer = window.__sceneSerializer
          if (serializer) serializer.upload()
          return
        }
        if (key === 'e' && e.shiftKey) {
          e.preventDefault()
          useUIStore.getState().toggleExportImageModal()
          return
        }
        if (key === 'f' && !e.shiftKey) {
          e.preventDefault()
          useUIStore.getState().toggleFindBar()
          return
        }
      }

      // Skip if user is typing in an input, textarea, or contenteditable
      const tag = e.target.tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return
      if (document.querySelector('.text-edit-overlay:not(.hidden)')) return

      const store = useSketchStore.getState()

      // Ctrl/Cmd shortcuts
      if (e.ctrlKey || e.metaKey) {
        if (key === 'a' && !e.shiftKey) {
          e.preventDefault()
          store.setActiveTool(TOOLS.SELECT)
          // Select all shapes via engine's multiSelection
          if (window.multiSelection && window.shapes) {
            window.multiSelection.clearSelection()
            window.shapes.forEach(shape => {
              window.multiSelection.addShape(shape)
            })
          }
          return
        }
        if (key === 'g' && !e.shiftKey) {
          e.preventDefault()
          // Group: assign a fresh groupId to every shape in the current
          // selection. After this, clicking any group-mate selects them
          // all (see Selection.js → group expansion).
          //
          // Targets: multiSelection if it has 2+ shapes, otherwise the
          // single currentShape (no-op for 0 or 1 shape).
          try {
            const ms = window.multiSelection
            const sel = ms?.selectedShapes
            const targets = sel && sel.size > 1
              ? Array.from(sel)
              : (window.currentShape ? [window.currentShape] : [])
            if (targets.length > 1) {
              const newId = `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
              for (const s of targets) s.groupId = newId
              // Trigger a re-render of the multi-selection bounds so
              // the user sees the group is now committed.
              if (typeof ms?.updateControls === 'function') ms.updateControls()
              showToast(`Grouped ${targets.length} shapes`, { tone: 'success' })
            }
          } catch (err) {
            console.warn('[Group] failed:', err)
          }
          return
        }
        if (key === 'g' && e.shiftKey) {
          e.preventDefault()
          // Ungroup: clear groupId from all selected shapes (and any of
          // their group-mates, so the whole group dissolves cleanly).
          try {
            const ms = window.multiSelection
            const sel = ms?.selectedShapes
            const targets = sel && sel.size > 0
              ? Array.from(sel)
              : (window.currentShape ? [window.currentShape] : [])
            const groupIds = new Set(targets.map(s => s.groupId).filter(Boolean))
            if (groupIds.size > 0 && Array.isArray(window.shapes)) {
              let cleared = 0
              for (const s of window.shapes) {
                if (s.groupId && groupIds.has(s.groupId)) { s.groupId = null; cleared++ }
              }
              if (typeof ms?.updateControls === 'function') ms.updateControls()
              showToast(`Ungrouped ${cleared} shapes`, { tone: 'success' })
            }
          } catch (err) {
            console.warn('[Ungroup] failed:', err)
          }
          return
        }
        if (key === 'd') {
          e.preventDefault()
          // Duplicate — handled by engine
          return
        }
        if (key === "'") {
          e.preventDefault()
          useSketchStore.getState().toggleGrid()
          return
        }
        return
      }

      if (e.shiftKey && (key === '1' || key === '!')) {
        e.preventDefault()
        if (typeof window.zoomFit === 'function') window.zoomFit()
        return
      }

      // Delete / Backspace — delete selected shape(s)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()

        // Multi-selection delete
        if (window.multiSelection && window.multiSelection.selectedShapes && window.multiSelection.selectedShapes.size > 0) {
          if (typeof window.deleteSelectedShapes === 'function') {
            window.deleteSelectedShapes()
          }
          return
        }

        // Single shape delete via engine's currentShape
        if (window.currentShape) {
          const shape = window.currentShape
          const shapes = window.shapes

          // Remove from shapes array
          if (shapes) {
            const idx = shapes.indexOf(shape)
            if (idx !== -1) shapes.splice(idx, 1)
          }

          // Cleanup arrow attachments
          if (typeof window.cleanupAttachments === 'function') {
            window.cleanupAttachments(shape)
          }

          // Remove from parent frame
          if (shape.parentFrame && typeof shape.parentFrame.removeShapeFromFrame === 'function') {
            shape.parentFrame.removeShapeFromFrame(shape)
          }

          // Remove from DOM
          const el = shape.group || shape.element
          if (el && el.parentNode) {
            el.parentNode.removeChild(el)
          }

          // Push undo action
          if (typeof window.pushDeleteAction === 'function') {
            window.pushDeleteAction(shape)
          }

          window.currentShape = null
          if (typeof window.disableAllSideBars === 'function') {
            window.disableAllSideBars()
          }
        }
        return
      }

      // Alt shortcuts
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (key === 'z') {
          e.preventDefault()
          useSketchStore.getState().toggleZenMode()
          return
        }
        if (key === 'r') {
          e.preventDefault()
          useSketchStore.getState().toggleViewMode()
          return
        }
        if (key === 's') {
          e.preventDefault()
          useSketchStore.getState().toggleSnapToObjects()
          return
        }
        return
      }

      if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && key === 'r') {
        e.preventDefault()
        store.toggleRulers()
        showToast(store.rulersEnabled ? 'Rulers hidden' : 'Rulers shown', { tone: 'info' })
        return
      }

      // Tool switching shortcuts (no modifier keys)
      if (!e.shiftKey && !e.altKey) {
        if (key === 'q') {
          e.preventDefault()
          store.toggleToolLock()
          return
        }

        const tool = SHORTCUT_MAP[key]
        if (tool) {
          e.preventDefault()
          store.setActiveTool(tool)
          return
        }

        if (e.key === 'Escape') {
          // Exit view mode or zen mode first
          if (store.viewMode) {
            store.toggleViewMode()
            return
          }
          if (store.zenMode) {
            store.toggleZenMode()
            return
          }
          const uiStore = useUIStore.getState()
          if (uiStore.menuOpen) {
            uiStore.closeMenu()
            return
          }
          // Deselect all — handled by engine
          store.setCurrentShape(null)
          return
        }
      }
    }

    // Prevent browser zoom on Ctrl+scroll — engine's ZoomPan.js handles actual zoom
    function handleWheel(e) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
      }
    }

    // Space held = temporary pan tool
    let spaceHeld = false
    let toolBeforeSpace = null

    function handleKeyUp(e) {
      if (e.code === 'Space' && spaceHeld) {
        spaceHeld = false
        window.__spacePanActive = false
        if (toolBeforeSpace) {
          useSketchStore.getState().setActiveTool(toolBeforeSpace)
          toolBeforeSpace = null
        }
      }
    }

    function handleSpaceDown(e) {
      if (e.code === 'Space' && !spaceHeld) {
        const tag = e.target.tagName.toLowerCase()
        if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return
        e.preventDefault()
        spaceHeld = true
        window.__spacePanActive = true
        const store = useSketchStore.getState()
        if (store.activeTool !== TOOLS.PAN) {
          toolBeforeSpace = store.activeTool
          store.setActiveTool(TOOLS.PAN)
        }
      }
    }

    function handleWindowBlur() {
      spaceHeld = false
      window.__spacePanActive = false
      if (toolBeforeSpace) {
        useSketchStore.getState().setActiveTool(toolBeforeSpace)
        toolBeforeSpace = null
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keydown', handleSpaceDown)
    document.addEventListener('keyup', handleKeyUp)
    document.addEventListener('wheel', handleWheel, { passive: false })
    window.addEventListener('blur', handleWindowBlur)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keydown', handleSpaceDown)
      document.removeEventListener('keyup', handleKeyUp)
      document.removeEventListener('wheel', handleWheel)
      window.removeEventListener('blur', handleWindowBlur)
      window.__spacePanActive = false
    }
  }, [])
}
