'use client'

import { useParams } from 'next/navigation'
import { useEffect } from 'react'
import Script from 'next/script'
import Header from '@/components/header/Header'
import useUIStore from '@/store/useUIStore'
import Toolbar from '@/components/toolbar/Toolbar'
import Footer from '@/components/footer/Footer'
import AppMenu from '@/components/menu/AppMenu'
import SaveModal from '@/components/modals/SaveModal'
import AIModal from '@/components/modals/AIModal'
import CommandPalette from '@/components/modals/CommandPalette'
import ExportImageModal from '@/components/modals/ExportImageModal'
import CanvasPropertiesModal from '@/components/modals/CanvasPropertiesModal'
import RectangleSidebar from '@/components/sidebars/RectangleSidebar'
import CircleSidebar from '@/components/sidebars/CircleSidebar'
import LineSidebar from '@/components/sidebars/LineSidebar'
import ArrowSidebar from '@/components/sidebars/ArrowSidebar'
import PaintbrushSidebar from '@/components/sidebars/PaintbrushSidebar'
import TextSidebar from '@/components/sidebars/TextSidebar'
import FrameSidebar from '@/components/sidebars/FrameSidebar'
import IconSidebar from '@/components/sidebars/IconSidebar'
import ImageSidebar from '@/components/sidebars/ImageSidebar'
import SVGCanvas from '@/components/canvas/SVGCanvas'
import MultiSelectActions from '@/components/canvas/MultiSelectActions'
import ImageSourcePicker from '@/components/canvas/ImageSourcePicker'
import ImageGenerateModal from '@/components/modals/ImageGenerateModal'
import WebEmbedModal from '@/components/modals/WebEmbedModal'
import useKeyboardShortcuts from '@/hooks/useKeyboardShortcuts'
import useGuestProfile from '@/hooks/useGuestProfile'
import useAuth from '@/hooks/useAuth'
import useCollaboration from '@/hooks/useCollaboration'
import CanvasLoadingOverlay from '@/components/canvas/CanvasLoadingOverlay'
import ContextMenu from '@/components/canvas/ContextMenu'
import FindBar from '@/components/canvas/FindBar'

export default function RoomPage() {
  const { roomId } = useParams()

  useEffect(() => {
    document.body.classList.add('canvas-mode')
    const ui = useUIStore.getState()
    ui.hydrateTheme()
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemTheme = () => useUIStore.getState().syncSystemTheme()
    media.addEventListener?.('change', handleSystemTheme)
    return () => {
      media.removeEventListener?.('change', handleSystemTheme)
      document.body.classList.remove('canvas-mode', 'theme-dark', 'theme-light')
      delete document.body.dataset.resolvedTheme
      document.documentElement.style.removeProperty('color-scheme')
    }
  }, [])

  useAuth()
  useKeyboardShortcuts()
  useGuestProfile()
  useCollaboration(roomId)

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-surface-dark">
      <Header />
      <Toolbar />

      <RectangleSidebar />
      <CircleSidebar />
      <LineSidebar />
      <ArrowSidebar />
      <PaintbrushSidebar />
      <TextSidebar />
      <FrameSidebar />
      <IconSidebar />
      <ImageSidebar />

      <SVGCanvas />

      <MultiSelectActions />
      <Footer />
      <AppMenu />
      <SaveModal />
      <AIModal />
      <CommandPalette />
      <ExportImageModal />
      <CanvasPropertiesModal />
      <ImageSourcePicker />
      <ImageGenerateModal />
      <WebEmbedModal />
      <ContextMenu />
      <FindBar />
      <CanvasLoadingOverlay />

      {/* Quick-save toast */}
      <div
        id="save-toast"
        className="hidden fixed bottom-20 left-1/2 -translate-x-1/2 z-9999 px-4 py-2 rounded-xl bg-surface/80 backdrop-blur-md border border-border-light text-text-secondary text-xs font-[lixFont] pointer-events-none animate-fade-in"
      >
        <i className="bx bx-check text-green-400 mr-1.5" />
        Saved
      </div>
    </div>
  )
}
