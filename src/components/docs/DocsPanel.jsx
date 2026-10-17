'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import useSketchStore from '@/store/useSketchStore'
import useUIStore from '@/store/useUIStore'
import useDocAutoSave, { triggerDocSync } from '@/hooks/useDocAutoSave'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
// KaTeX CSS — until @elixpo/lixeditor republishes with KaTeX bundled
// inline, we have to import it consumer-side or block equations won't
// render. Safe to leave even after package republish (idempotent).
import 'katex/dist/katex.min.css'
import '@elixpo/lixeditor/styles'
import './docs-theme.css'
import { LixEditor, LixThemeProvider } from '@elixpo/lixeditor'
import {
  FormattingToolbar,
  FormattingToolbarController,
  getFormattingToolbarItems,
  SideMenuController,
  useBlockNoteEditor,
  useExtension,
  useExtensionState,
} from '@blocknote/react'
import { SideMenuExtension, SuggestionMenu } from '@blocknote/core/extensions'
import { flip, offset, shift } from '@floating-ui/react'
import { compressImage } from '@elixpo/lixsketch/src/utils/imageCompressor.js'
import { WORKER_URL } from '@/lib/env'
import { showToast } from '@/utils/toast'
import {
  DOC_CANVAS_LINKS_EVENT,
  FOCUS_DOC_BLOCK_EVENT,
  focusCanvasShape,
  getSelectedCanvasShape,
  getShapeDocBlockIds,
  getShapesLinkedToBlock,
  linkShapeToBlock,
  pruneDocCanvasLinks,
  unlinkBlock,
  unlinkShapeFromBlock,
} from '@/utils/docCanvasLinks'

const DOC_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
function getDocumentImageLimitBytes() {
  return Number(window.__roomImageLimitBytes) || 2 * 1024 * 1024
}

const DOC_FORMATTING_TOOLBAR_OPTIONS = {
  useFloatingOptions: {
    placement: 'bottom-start',
    middleware: [offset(4), shift({ padding: 8 }), flip({ padding: 8 })],
  },
}

const DOC_SIDE_MENU_OPTIONS = {
  useFloatingOptions: {
    // The side menu uses `left-start`; a negative main-axis offset moves the
    // controls inward so they do not sit flush against the docs-pane edge.
    middleware: [offset(-12)],
  },
}

function DocumentFormattingToolbar() {
  return (
    <div className="lix-doc-formatting-toolbar">
      <FormattingToolbar>
        {getFormattingToolbarItems().filter((item) => {
          const key = item?.key ?? item?.props?.key
          return key !== 'createLink'
        })}
      </FormattingToolbar>
    </div>
  )
}

function DocumentBlockSideMenu() {
  const editor = useBlockNoteEditor()
  const sideMenu = useExtension(SideMenuExtension)
  const suggestionMenu = useExtension(SuggestionMenu)
  const block = useExtensionState(SideMenuExtension, {
    editor,
    selector: (state) => state?.block,
  })
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [, setLinkRevision] = useState(0)
  const menuRef = useRef(null)

  useEffect(() => {
    const refresh = () => setLinkRevision((revision) => revision + 1)
    window.addEventListener(DOC_CANVAS_LINKS_EVENT, refresh)
    return () => window.removeEventListener(DOC_CANVAS_LINKS_EVENT, refresh)
  }, [])

  useEffect(() => {
    setOpen(false)
    setConfirmDelete(false)
  }, [block?.id])

  useEffect(() => {
    if (!open) return undefined
    sideMenu.freezeMenu()
    const close = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return
      if (event.type === 'pointerdown' && menuRef.current?.contains(event.target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', close, true)
    document.addEventListener('keydown', close, true)
    return () => {
      document.removeEventListener('pointerdown', close, true)
      document.removeEventListener('keydown', close, true)
      sideMenu.unfreezeMenu()
    }
  }, [open, sideMenu])

  if (!block) return null

  const linkedShapes = getShapesLinkedToBlock(block.id)
  const selectedShape = open ? getSelectedCanvasShape() : null
  const selectedShapeIsLinked = selectedShape
    ? getShapeDocBlockIds(selectedShape).includes(block.id)
    : false

  const openContextMenu = (event) => {
    event.preventDefault()
    setOpen(true)
  }
  const openContextMenuFromKeyboard = (event) => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
    openContextMenu(event)
  }
  const addBlock = () => {
    const isEmpty = Array.isArray(block.content) && block.content.length === 0
    const target = isEmpty
      ? block
      : editor.insertBlocks([{ type: 'paragraph', content: [] }], block, 'after')[0]
    editor.setTextCursorPosition(target, 'start')
    setOpen(false)
    requestAnimationFrame(() => suggestionMenu.openSuggestionMenu('/'))
  }
  const deleteBlock = () => {
    if (linkedShapes.length && !confirmDelete) {
      setConfirmDelete(true)
      return
    }
    unlinkBlock(block.id)
    setOpen(false)
    editor.removeBlocks([block])
    requestAnimationFrame(() => editor.focus())
  }
  const linkSelectedShape = () => {
    if (!selectedShape || selectedShapeIsLinked) return
    linkShapeToBlock(selectedShape, block.id)
    setOpen(false)
    showToast('Shape linked to document block', { tone: 'success', duration: 1800 })
  }
  const removeLink = () => {
    unlinkBlock(block.id)
    setOpen(false)
    showToast('Canvas link removed', { duration: 1600 })
  }
  const removeShapeLink = (shape) => {
    unlinkShapeFromBlock(shape, block.id)
    showToast('Canvas link removed', { duration: 1600 })
  }

  return (
    <div ref={menuRef} className="bn-side-menu lix-doc-block-side-menu" role="group" aria-label="Block actions">
      <button
        type="button"
        className="lix-doc-block-handle"
        title="Add block · right-click for block actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={addBlock}
        onContextMenu={openContextMenu}
        onKeyDown={openContextMenuFromKeyboard}
      >
        <i className="bx bx-plus text-xl" />
      </button>
      <button
        type="button"
        className="lix-doc-block-handle"
        title="Drag to move · right-click for block actions"
        aria-haspopup="menu"
        aria-expanded={open}
        draggable
        onDragStart={(event) => sideMenu.blockDragStart(event, block)}
        onDragEnd={sideMenu.blockDragEnd}
        onContextMenu={openContextMenu}
        onKeyDown={openContextMenuFromKeyboard}
      >
        <i className="bx bx-grid-vertical text-lg" />
      </button>
      {linkedShapes.length > 0 && (
        <button
          type="button"
          className="lix-doc-block-handle lix-doc-link-handle"
          title={`Open ${linkedShapes.length} linked canvas ${linkedShapes.length === 1 ? 'shape' : 'shapes'}`}
          aria-label="Open linked canvas shapes"
          onClick={() => linkedShapes.length === 1 ? focusCanvasShape(linkedShapes[0].shapeID) : setOpen(true)}
        >
          <i className="bx bx-link text-sm" />
          {linkedShapes.length > 1 && <span className="lix-doc-link-count">{linkedShapes.length}</span>}
        </button>
      )}
      {open && (
        <div className="lix-doc-block-context" role="menu">
          <button type="button" role="menuitem" onClick={addBlock}>
            <i className="bx bx-plus-circle" />
            <span>Add block</span>
          </button>
          <button type="button" role="menuitem" disabled={!selectedShape || selectedShapeIsLinked} onClick={linkSelectedShape}>
            <i className="bx bx-link" />
            <span>{selectedShapeIsLinked ? 'Selected shape is linked' : 'Link selected shape'}</span>
          </button>
          {!selectedShape && !linkedShapes.length && (
            <p className="lix-doc-block-context-hint">Select one canvas shape first</p>
          )}
          {linkedShapes.length > 0 && (
            <>
              {linkedShapes.map((shape, index) => (
                <div key={shape.shapeID} className="lix-doc-linked-destination">
                  <button type="button" role="menuitem" onClick={() => {
                    setOpen(false)
                    focusCanvasShape(shape.shapeID)
                  }}>
                    <i className="bx bx-target-lock" />
                    <span>{shape.shapeName || 'Canvas shape'} {index + 1}</span>
                  </button>
                  <button type="button" title="Remove this connection" aria-label="Remove this connection" onClick={() => removeShapeLink(shape)}>
                    <i className="bx bx-unlink" />
                  </button>
                </div>
              ))}
              <button type="button" role="menuitem" onClick={removeLink}>
                <i className="bx bx-unlink" />
                <span>Remove all canvas links</span>
              </button>
            </>
          )}
          {confirmDelete ? (
            <div className="lix-doc-delete-warning" role="alert">
              <p>This block has {linkedShapes.length} canvas {linkedShapes.length === 1 ? 'connection' : 'connections'}. Deleting it will break them.</p>
              <div>
                <button type="button" onClick={() => setConfirmDelete(false)}>Cancel</button>
                <button type="button" className="danger" onClick={deleteBlock}>Delete and break links</button>
              </div>
            </div>
          ) : (
            <button type="button" role="menuitem" className="danger" onClick={deleteBlock}>
              <i className="bx bx-trash" />
              <span>Delete block</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('Could not read image'))
    reader.readAsDataURL(file)
  })
}

function validateRemoteImage(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      resolve(false)
      return
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      resolve(false)
      return
    }

    const image = new Image()
    let settled = false
    const finish = (valid) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      image.onload = null
      image.onerror = null
      resolve(valid)
    }
    const timer = setTimeout(() => finish(false), timeoutMs)
    image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0)
    image.onerror = () => finish(false)
    image.src = parsed.href
  })
}

async function uploadDocumentImage(file) {
  const roomLimit = getDocumentImageLimitBytes()
  const personalStorage = Boolean(window.__personalCloudinary?.connected && window.__personalCloudinary?.useForUploads)
  const uploadLimit = personalStorage ? 20 * 1024 * 1024 : roomLimit
  if (file.size > uploadLimit) {
    showToast(`Image exceeds the ${Math.round(uploadLimit / (1024 * 1024))} MB upload limit`, { tone: 'warn' })
    throw new Error('Image exceeds workspace limit')
  }
  const dataUrl = await readFileAsDataURL(file)
  const compressed = await compressImage(dataUrl)
  const usedBytes = Number(window.__roomImageBytesUsed) || 0
  if (!personalStorage && usedBytes + compressed.compressedSize > roomLimit) {
    showToast(`Workspace image limit reached (${Math.round(roomLimit / (1024 * 1024))} MB)`, { tone: 'warn' })
    throw new Error('Workspace image limit reached')
  }
  const sessionId = window.__sessionID
  const workerUrl = window.__WORKER_URL || WORKER_URL

  if (personalStorage && sessionId) {
    const personalForm = new FormData()
    personalForm.append('file', compressed.blob, `doc_${Date.now()}`)
    personalForm.append('sessionId', sessionId)
    const personalResponse = await fetch('/api/images/personal-upload', {
      method: 'POST',
      body: personalForm,
    })
    const personalData = await personalResponse.json().catch(() => ({}))
    if (!personalResponse.ok || !personalData.url) {
      throw new Error(personalData.error || 'Personal Cloudinary upload failed')
    }
    return personalData.url
  }

  // Offline/local fallback: retain the compressed image without exposing the
  // package's default Embed URL card.
  if (!workerUrl || !sessionId) {
    window.__roomImageBytesUsed = usedBytes + compressed.compressedSize
    return compressed.dataUrl
  }

  const signResponse = await fetch(`${workerUrl}/api/images/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      filename: `doc_${Date.now()}`,
      sizeBytes: compressed.compressedSize,
    }),
  })
  if (!signResponse.ok) {
    const body = await signResponse.json().catch(() => ({}))
    throw new Error(body.message || 'Could not authorize document image upload')
  }
  const signData = await signResponse.json()

  const formData = new FormData()
  formData.append('file', compressed.blob)
  formData.append('api_key', signData.apiKey)
  formData.append('timestamp', String(signData.timestamp))
  formData.append('signature', signData.signature)
  formData.append('folder', signData.folder)
  formData.append('public_id', signData.publicId)

  const uploadResponse = await fetch(
    `https://api.cloudinary.com/v1_1/${signData.cloudName}/image/upload`,
    { method: 'POST', body: formData },
  )
  if (!uploadResponse.ok) throw new Error('Document image upload failed')
  const uploaded = await uploadResponse.json()
  const imageUrl = uploaded.secure_url || uploaded.url
  if (!imageUrl) throw new Error('Document image upload returned no URL')
  await fetch(`${workerUrl}/api/images/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      publicId: uploaded.public_id || signData.publicId,
      sizeBytes: uploaded.bytes || compressed.compressedSize,
    }),
  }).catch(() => {})
  window.__roomImageBytesUsed = usedBytes + (uploaded.bytes || compressed.compressedSize)
  return imageUrl
}

function DocsLoading() {
  return (
    <div className="w-full h-full flex items-center justify-center text-text-dim text-xs font-[lixFont]">
      <i className="bx bx-loader-alt animate-spin mr-2" /> Loading editor…
    </div>
  )
}

export default function DocsPanel() {
  const layoutMode = useSketchStore((s) => s.layoutMode)
  const visible = layoutMode === 'split' || layoutMode === 'docs'
  const editorRef = useRef(null)
  const docHostRef = useRef(null)
  const focusedForDocsRef = useRef(false)
  const bypassLinkedDeleteRef = useRef(false)
  const [editorReady, setEditorReady] = useState(false)
  const [pendingLinkedDelete, setPendingLinkedDelete] = useState(null)
  // Controlled-mode theme: pass the canvas theme straight through to the
  // editor. Available since @elixpo/lixeditor@2.6.7 — replaces the prior
  // `defaultTheme` + manual `localStorage.setItem` workaround that was
  // needed because the storage-overrides-default precedence pinned the
  // editor to whatever theme was saved in a previous session.
  const canvasTheme = useUIStore((s) => s.theme)
  const docTheme = canvasTheme === 'dark' ? 'dark' : 'light'

  const { initialContent, ready } = useDocAutoSave(visible)

  useEffect(() => {
    if (!visible) setEditorReady(false)
  }, [visible])

  useEffect(() => {
    if (!editorReady) return undefined
    const editor = editorRef.current?.getEditor?.()
    if (!editor?.onBeforeChange) return undefined
    return editor.onBeforeChange(({ getChanges, tr }) => {
      if (bypassLinkedDeleteRef.current) {
        bypassLinkedDeleteRef.current = false
        return undefined
      }
      const deletedBlocks = getChanges()
        .filter((change) => change.type === 'delete' && change.source?.type !== 'remote')
        .map((change) => change.block)
        .filter((block) => block?.id && getShapesLinkedToBlock(block.id).length)
      if (!deletedBlocks.length) return undefined
      const linkCount = deletedBlocks.reduce(
        (total, block) => total + getShapesLinkedToBlock(block.id).length,
        0,
      )
      setPendingLinkedDelete({ blocks: deletedBlocks, linkCount, editor, tr })
      return false
    })
  }, [editorReady])

  useEffect(() => {
    if (!pendingLinkedDelete) return undefined
    const close = (event) => {
      if (event.key === 'Escape') setPendingLinkedDelete(null)
    }
    document.addEventListener('keydown', close, true)
    return () => document.removeEventListener('keydown', close, true)
  }, [pendingLinkedDelete])

  const confirmLinkedBlockDelete = () => {
    const pending = pendingLinkedDelete
    if (!pending) return
    for (const block of pending.blocks) unlinkBlock(block.id)
    setPendingLinkedDelete(null)
    bypassLinkedDeleteRef.current = true
    try {
      const view = pending.editor._tiptapEditor?.view
      if (!view) throw new Error('Document transaction view unavailable')
      view.dispatch(pending.tr)
    } catch {
      pending.editor.removeBlocks(pending.blocks)
    }
  }

  useEffect(() => {
    const focusBlock = (blockId) => {
      const editor = editorRef.current?.getEditor?.()
      if (!editor || !blockId) {
        window.__pendingDocBlockFocus = blockId
        return
      }
      const block = editor.getBlock?.(blockId)
      if (!block) return
      window.__pendingDocBlockFocus = null
      editor.setTextCursorPosition(block, 'start')
      editor.focus()
      requestAnimationFrame(() => {
        const escapedId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(blockId) : blockId
        docHostRef.current?.querySelector(`[data-id="${escapedId}"]`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      })
    }
    const handleFocusBlock = (event) => focusBlock(event.detail?.blockId)
    window.addEventListener(FOCUS_DOC_BLOCK_EVENT, handleFocusBlock)
    if (visible && editorReady && window.__pendingDocBlockFocus) {
      focusBlock(window.__pendingDocBlockFocus)
    }
    return () => window.removeEventListener(FOCUS_DOC_BLOCK_EVENT, handleFocusBlock)
  }, [editorReady, visible])

  useEffect(() => {
    const host = docHostRef.current
    if (!host) return undefined

    const submitEmbed = async (button, input) => {
      if (!button || !input || button.dataset.lixValidating === 'true') return
      button.dataset.lixValidating = 'true'
      const url = input.value.trim()
      const valid = await validateRemoteImage(url)
      delete button.dataset.lixValidating

      if (!valid) {
        showToast('Image URL could not be loaded', { tone: 'warn', duration: 2200 })
        input.focus()
        return
      }

      // Allow exactly one validated event through to LixEditor's handler.
      button.dataset.lixValidated = 'true'
      button.click()
    }

    const handleClick = (event) => {
      const button = event.target.closest?.('.blog-img-submit-btn')
      if (!button || !host.contains(button)) return
      if (button.dataset.lixValidated === 'true') {
        delete button.dataset.lixValidated
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const input = button.closest('.blog-img-input-row')?.querySelector('.blog-img-url-input')
      submitEmbed(button, input)
    }

    const handleKeyDown = (event) => {
      if (event.key !== 'Enter') return
      const input = event.target.closest?.('.blog-img-url-input')
      if (!input || !host.contains(input)) return
      event.preventDefault()
      event.stopPropagation()
      const button = input.closest('.blog-img-input-row')?.querySelector('.blog-img-submit-btn')
      submitEmbed(button, input)
    }

    host.addEventListener('click', handleClick, true)
    host.addEventListener('keydown', handleKeyDown, true)
    return () => {
      host.removeEventListener('click', handleClick, true)
      host.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [visible])

  useEffect(() => {
    if (layoutMode !== 'docs') {
      focusedForDocsRef.current = false
      return undefined
    }
    if (!ready || !editorReady || focusedForDocsRef.current) return undefined

    focusedForDocsRef.current = true
    const frameId = requestAnimationFrame(() => {
      const editor = editorRef.current?.getEditor?.()
      if (!editor) {
        focusedForDocsRef.current = false
        return
      }

      try {
        const documentBlocks = editor.document || []
        let target = documentBlocks[documentBlocks.length - 1]
        const content = target?.content
        const hasContent = Array.isArray(content)
          ? content.some((item) => typeof item === 'string' ? item.length > 0 : Boolean(item?.text || item?.content?.length))
          : Boolean(content)

        if (!target || target.type !== 'paragraph' || hasContent) {
          const inserted = target
            ? editor.insertBlocks([{ type: 'paragraph', content: [] }], target, 'after')
            : []
          target = inserted?.[0] || editor.document?.[editor.document.length - 1]
        }

        if (target) editor.setTextCursorPosition(target.id || target, 'end')
        editor.focus()
      } catch (error) {
        console.warn('[DocsPanel] Could not focus a new document line:', error)
      }
    })

    return () => cancelAnimationFrame(frameId)
  }, [editorReady, layoutMode, ready])

  if (!visible) return null

  return (
    <div className="w-full h-full bg-surface-dark overflow-hidden flex flex-col lix-sketch-theme">
      <div ref={docHostRef} className="flex-1 min-h-0 overflow-y-auto lix-editor-host">
        {ready ? (
          <LixThemeProvider theme={docTheme}>
            <LixEditor
              ref={editorRef}
              initialContent={initialContent}
              onReady={() => setEditorReady(true)}
              onChange={(editor) => {
                try {
                  const blocks = editor.document
                  pruneDocCanvasLinks(blocks)
                  triggerDocSync(blocks)
                } catch {}
              }}
              features={{ equations: true, mermaid: true, code: true }}
              uploadFile={uploadDocumentImage}
              acceptImageTypes={DOC_IMAGE_TYPES}
              maxFileSizeBytes={20 * 1024 * 1024}
            >
              <FormattingToolbarController
                formattingToolbar={DocumentFormattingToolbar}
                floatingUIOptions={DOC_FORMATTING_TOOLBAR_OPTIONS}
              />
              <SideMenuController
                sideMenu={DocumentBlockSideMenu}
                floatingUIOptions={DOC_SIDE_MENU_OPTIONS}
              />
            </LixEditor>
          </LixThemeProvider>
        ) : (
          <DocsLoading />
        )}
      </div>
      {pendingLinkedDelete && createPortal(
        <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/55 p-4" role="presentation">
          <div className="w-full max-w-md rounded-2xl border border-border-light bg-surface-card p-5 shadow-2xl" role="alertdialog" aria-modal="true" aria-labelledby="linked-block-delete-title">
            <h2 id="linked-block-delete-title" className="text-lg text-text-primary">Delete connected document block?</h2>
            <p className="mt-2 text-sm text-text-secondary">
              This deletion will break {pendingLinkedDelete.linkCount} canvas {pendingLinkedDelete.linkCount === 1 ? 'connection' : 'connections'}. The linked canvas shapes will not be deleted.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="px-4 py-2 rounded-lg border border-border-light text-text-primary hover:bg-surface-hover cursor-pointer" onClick={() => setPendingLinkedDelete(null)}>Cancel</button>
              <button type="button" className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 cursor-pointer" onClick={confirmLinkedBlockDelete}>Delete and break links</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
