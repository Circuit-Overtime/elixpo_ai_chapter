"use client"

import useSketchStore, { TOOLS } from '@/store/useSketchStore'
import ShapeSidebar, { ToolbarButton, Divider, LayerControls } from './ShapeSidebar'
import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from '@/hooks/useTranslation'
import useUIStore from '@/store/useUIStore'

const TEXT_COLORS = ['#000000', '#ffffff', '#FF8383', '#3A994C', '#56A2E8', '#FFD700', '#FF69B4', '#A855F7']

const FONTS = [
  { value: 'lixFont', label: 'Lix' },
  { value: 'lixCode', label: 'Code' },
  { value: 'lixDefault', label: 'Default' },
  { value: 'lixFancy', label: 'Fancy' },
]

const SIZE_MAP = { S: '20px', M: '30px', L: '48px', XL: '72px' }

const LANGUAGES = [
  'javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'csharp',
  'go', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'html', 'css',
  'sql', 'bash', 'json', 'yaml', 'markdown',
]

export default function TextSidebar() {
  const { t } = useTranslation()
  const activeTool = useSketchStore((s) => s.activeTool)
  const selectedShapeSidebar = useSketchStore((s) => s.selectedShapeSidebar)
  const resolvedTheme = useUIStore((s) => s.resolvedTheme)
  const [textColor, setTextColor] = useState(null)
  const displayedTextColor = textColor ?? (resolvedTheme === 'light' ? '#000000' : '#ffffff')
  const [fontSize, setFontSize] = useState('S')
  const [font, setFont] = useState('lixFont')
  const [codeMode, setCodeMode] = useState(false)
  const [language, setLanguage] = useState('javascript')

  // Sync code mode state from engine when a shape is selected
  useEffect(() => {
    window.__onCodeModeChanged = (isCode) => {
      setCodeMode(isCode)
      window.isTextInCodeMode = isCode
    }
    return () => { window.__onCodeModeChanged = null }
  }, [])

  const updateColor = useCallback((c) => {
    setTextColor(c)
    if (window.updateSelectedTextStyle) window.updateSelectedTextStyle({ color: c })
  }, [])

  const updateFont = useCallback((f) => {
    setFont(f)
    if (window.updateSelectedTextStyle) window.updateSelectedTextStyle({ font: f })
  }, [])

  const updateSize = useCallback((s) => {
    setFontSize(s)
    if (window.updateSelectedTextStyle) window.updateSelectedTextStyle({ fontSize: SIZE_MAP[s] })
  }, [])

  const toggleCodeMode = useCallback(() => {
    const next = !codeMode
    setCodeMode(next)
    window.isTextInCodeMode = next
    if (next) {
      // Convert selected text → code
      if (window.__convertTextToCode) window.__convertTextToCode()
    } else {
      // Convert selected code → text
      if (window.__convertCodeToText) window.__convertCodeToText()
    }
  }, [codeMode])

  const updateLanguage = useCallback((lang) => {
    setLanguage(lang)
    if (window.__setCodeLanguage) window.__setCodeLanguage(lang)
  }, [])

  const visible = activeTool === TOOLS.TEXT || activeTool === TOOLS.CODE || selectedShapeSidebar === 'text'

  return (
    <>
    <ShapeSidebar visible={visible}>
      {/* Color */}
      <ToolbarButton tooltip={t('sidebar.textColor')}
        preview={<span className="w-4 h-4 rounded-md border border-border-light" style={{ backgroundColor: displayedTextColor }} />}
      >
        <p className="text-xs text-text-muted uppercase tracking-wider mb-2">{t('sidebar.color')}</p>
        <div className="grid grid-cols-4 gap-1.5">
          {TEXT_COLORS.map((c) => (
            <button key={c} onClick={() => updateColor(c)}
              className={`w-7 h-7 rounded-md border-[1.5px] transition-all duration-100 ${displayedTextColor.toLowerCase() === c.toLowerCase() ? 'border-[#7667a8] scale-110' : 'border-border-light hover:border-text-dim'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </ToolbarButton>

      {!codeMode && (
        <>
          <Divider />

          {/* Font */}
          <ToolbarButton icon="bxs-font-family" tooltip={t('sidebar.font')}>
            <p className="text-xs text-text-muted uppercase tracking-wider mb-2">{t('sidebar.font')}</p>
            <div className="flex flex-col gap-0.5">
              {FONTS.map((f) => (
                <button key={f.value} onClick={() => updateFont(f.value)}
                  className={`flex items-center px-2.5 py-1.5 rounded-lg text-xs transition-all duration-100 ${font === f.value ? 'bg-[#7667a8] text-white' : 'text-text-secondary hover:bg-surface-hover'}`}
                  style={{ fontFamily: f.value }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </ToolbarButton>
        </>
      )}

      <Divider />

      {/* Size */}
      <ToolbarButton icon="bxs-chevrons-up" tooltip={t('sidebar.size')}>
        <p className="text-xs text-text-muted uppercase tracking-wider mb-2">{t('sidebar.size')}</p>
        <div className="flex items-center gap-1">
          {['S', 'M', 'L', 'XL'].map((s) => (
            <button key={s} onClick={() => updateSize(s)}
              className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs transition-all duration-100 ${fontSize === s ? 'bg-[#7667a8]/20 text-[#7667a8]' : 'text-text-muted hover:bg-surface-hover'}`}
            >{s}</button>
          ))}
        </div>
      </ToolbarButton>

      <Divider />

      {/* Code mode */}
      <ToolbarButton icon="bxs-terminal" tooltip={t('sidebar.codeMode')}>
        <p className="text-xs text-text-muted uppercase tracking-wider mb-2">{t('sidebar.code')}</p>
        <div className="flex flex-col gap-2">
          <button onClick={toggleCodeMode}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-100 ${codeMode ? 'bg-[#7667a8] text-white' : 'text-text-secondary hover:bg-surface-hover'}`}
          >
            <div className={`w-6 h-3 rounded-full transition-all duration-150 relative ${codeMode ? 'bg-white/30' : 'bg-white/10'}`}>
              <div className={`absolute top-0.5 w-2 h-2 rounded-full bg-white transition-all duration-150 ${codeMode ? 'left-3.5' : 'left-0.5'}`} />
            </div>
            {codeMode ? t('sidebar.on') : t('sidebar.off')}
          </button>
          {codeMode && (
            <div className="flex flex-wrap gap-1 max-w-[180px]">
              {LANGUAGES.map((lang) => (
                <button key={lang} onClick={() => updateLanguage(lang)}
                  className={`px-1.5 py-0.5 rounded text-[9px] transition-all duration-100 ${language === lang ? 'bg-[#7667a8]/20 text-[#7667a8]' : 'text-text-dim hover:bg-surface-hover hover:text-text-secondary'}`}
                >{lang}</button>
              ))}
            </div>
          )}
        </div>
      </ToolbarButton>
      <Divider />
      <LayerControls />
    </ShapeSidebar>

    {/* Keyboard shortcut hint — positioned below the property bar */}
    <div
      className={`absolute bottom-7 left-1/2 -translate-x-1/2 z-[998] font-[lixFont] transition-all duration-200 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 pointer-events-none translate-y-2'
      }`}
    >
      <p className="text-[10px] text-text-dim leading-relaxed text-center whitespace-nowrap">
        <span className="text-text-muted">Ctrl+Enter</span> / <span className="text-text-muted">Enter</span> — {t('sidebar.renderText')} &nbsp;&nbsp;
        <span className="text-text-muted">Shift+Enter</span> — {t('sidebar.newLine')}
      </p>
    </div>
    </>
  )
}
