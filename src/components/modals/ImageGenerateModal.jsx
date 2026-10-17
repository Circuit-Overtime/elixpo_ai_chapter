"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import useAuthStore from '@/store/useAuthStore'
import useUIStore from '@/store/useUIStore'

const MODELS = [
  { id: 'flux', label: 'Flux', desc: 'Detailed and artistic', cost: '0.002 Pollen / image' },
  { id: 'klein', label: 'Klein', desc: 'Clean and precise', cost: '0.005 Pollen / image' },
]

const SIZES = [
  { label: '768×768', w: 768, h: 768 },
  { label: '768×512', w: 768, h: 512 },
  { label: '512×768', w: 512, h: 768 },
  { label: '512×512', w: 512, h: 512 },
]

function LoadingAnimation() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 text-center">
      <div className="relative h-16 w-16">
        <div className="absolute inset-0 animate-pulse rounded-2xl bg-accent/20 blur-xl" />
        <div className="absolute inset-2 flex animate-pulse items-center justify-center rounded-xl border border-accent/30 bg-accent/10">
          <i className="bx bx-image-alt text-2xl text-accent" />
        </div>
      </div>
      <div>
        <p className="text-sm text-text-muted">Generating with Pollinations…</p>
        <p className="mt-1 text-[10px] text-text-dim">This can take up to 15 seconds</p>
      </div>
    </div>
  )
}

function ConnectorGate({ status, loading, isAuthenticated, onSignIn, onEnable, enabling }) {
  if (loading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <i className="bx bx-loader-alt animate-spin text-lg text-accent" />
          Checking Pollinations connection…
        </div>
      </div>
    )
  }

  const expired = Boolean(status?.expired)
  const disabled = Boolean(status?.connected && !status?.usePersonalPollen && !expired)
  const message = !isAuthenticated
    ? 'Sign in before connecting your Pollinations account.'
    : expired
      ? 'Your Pollinations authorization expired. Reconnect to continue.'
      : disabled
        ? 'Personal Pollen is connected but disabled for image generation.'
        : 'Connect Pollinations to generate images with Flux and Klein.'

  return (
    <div className="flex min-h-[360px] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-accent/25 bg-accent/5 p-7 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-accent/25 bg-accent/10">
          <i className="bx bx-plug text-2xl text-accent" />
        </div>
        <h3 className="mt-4 text-lg text-text-primary">Pollinations connection required</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-text-muted">{message}</p>
        <p className="mt-3 text-[11px] text-text-dim">Your personal Pollen balance is used. LixSketch never exposes your connector key to the browser.</p>
        <div className="mt-5 flex justify-center gap-2">
          {!isAuthenticated ? (
            <button onClick={onSignIn} className="cursor-pointer rounded-xl bg-accent px-5 py-2.5 text-sm text-white transition hover:bg-accent/85">Sign in</button>
          ) : disabled ? (
            <button disabled={enabling} onClick={onEnable} className="cursor-pointer rounded-xl bg-accent px-5 py-2.5 text-sm text-white transition hover:bg-accent/85 disabled:cursor-wait disabled:opacity-60">
              {enabling ? 'Enabling…' : 'Enable personal Pollen'}
            </button>
          ) : (
            <a href="/api/integrations/pollinations/connect" className="cursor-pointer rounded-xl bg-accent px-5 py-2.5 text-sm text-white transition hover:bg-accent/85">
              {expired ? 'Reconnect Pollinations' : 'Connect Pollinations'}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ImageGenerateModal() {
  const isOpen = useUIStore((state) => state.imageGenerateModalOpen)
  const closeModal = useUIStore((state) => state.closeImageGenerateModal)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const login = useAuthStore((state) => state.login)
  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [model, setModel] = useState('flux')
  const [sizeIdx, setSizeIdx] = useState(0)
  const [seed, setSeed] = useState(-1)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedImage, setGeneratedImage] = useState(null)
  const [error, setError] = useState('')
  const [connector, setConnector] = useState(null)
  const [connectorLoading, setConnectorLoading] = useState(false)
  const [enabling, setEnabling] = useState(false)
  const abortRef = useRef(null)

  const connectorReady = Boolean(isAuthenticated && connector?.connected && connector?.usePersonalPollen && !connector?.expired)

  const loadConnector = useCallback(async () => {
    if (!isAuthenticated) {
      setConnector(null)
      setConnectorLoading(false)
      return
    }
    setConnectorLoading(true)
    try {
      const response = await fetch('/api/integrations/pollinations?includeUsage=1', { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      setConnector(response.ok ? data : { connected: false, error: data.error })
    } catch {
      setConnector({ connected: false, error: 'Could not check Pollinations status.' })
    } finally {
      setConnectorLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (isOpen) loadConnector()
  }, [isOpen, loadConnector])

  useEffect(() => () => {
    abortRef.current?.abort()
  }, [])

  const handleClose = useCallback(() => {
    closeModal()
  }, [closeModal])

  const handleEnable = useCallback(async () => {
    setEnabling(true)
    try {
      const response = await fetch('/api/integrations/pollinations', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usePersonalPollen: true }),
      })
      if (!response.ok) throw new Error('enable failed')
      await loadConnector()
    } catch {
      setError('Could not enable personal Pollen. Open Integrations and reconnect Pollinations.')
    } finally {
      setEnabling(false)
    }
  }, [loadConnector])

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating || !connectorReady) return
    setIsGenerating(true)
    setGeneratedImage(null)
    setError('')
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const size = SIZES[sizeIdx]
      const body = { prompt: prompt.trim(), model, width: size.w, height: size.h, seed }
      if (negativePrompt.trim()) body.negative_prompt = negativePrompt.trim()
      const response = await fetch('/api/ai/image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal,
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.imageUrl) {
        if (data.connectorRequired) await loadConnector()
        throw new Error(data.error || 'Image generation failed.')
      }
      setGeneratedImage({ imageUrl: data.imageUrl, width: data.width, height: data.height, model: data.model })
      setPrompt('')
      loadConnector()
    } catch (generationError) {
      if (generationError.name !== 'AbortError') setError(generationError.message || 'Connection failed. Please try again.')
    } finally {
      setIsGenerating(false)
      abortRef.current = null
    }
  }, [connectorReady, isGenerating, loadConnector, model, negativePrompt, prompt, seed, sizeIdx])

  const handlePlace = useCallback(() => {
    if (!generatedImage || !window.svg || !window.ImageShape) return
    const viewBox = window.currentViewBox || { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }
    const centerX = viewBox.x + viewBox.width / 2
    const centerY = viewBox.y + viewBox.height / 2
    const width = Math.min(400, generatedImage.width)
    const height = width * (generatedImage.height / generatedImage.width)
    const x = centerX - width / 2
    const y = centerY - height / 2
    const element = document.createElementNS('http://www.w3.org/2000/svg', 'image')
    element.setAttribute('href', generatedImage.imageUrl)
    element.setAttribute('x', x)
    element.setAttribute('y', y)
    element.setAttribute('width', width)
    element.setAttribute('height', height)
    element.setAttribute('data-shape-x', x)
    element.setAttribute('data-shape-y', y)
    element.setAttribute('data-shape-width', width)
    element.setAttribute('data-shape-height', height)
    element.setAttribute('type', 'image')
    element.setAttribute('data-ai-generated', 'true')
    element.setAttribute('data-ai-model', generatedImage.model || model)
    const imageShape = new window.ImageShape(element)
    window.shapes.push(imageShape)
    window.pushCreateAction?.(imageShape)
    window.uploadImageToCloudinary?.(imageShape)
    setGeneratedImage(null)
    handleClose()
  }, [generatedImage, handleClose])

  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Escape') handleClose()
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      if (generatedImage) handlePlace()
      else handleGenerate()
    }
  }, [generatedImage, handleClose, handleGenerate, handlePlace])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center font-[lixFont]" onClick={handleClose} onKeyDown={handleKeyDown}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <section className="relative mx-3 max-h-[88vh] w-[92vw] max-w-[900px] overflow-y-auto rounded-2xl border border-border-light bg-surface-card p-5 shadow-2xl sm:p-6" onClick={(event) => event.stopPropagation()}>
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2.5 text-lg font-medium text-text-primary"><i className="bx bx-image-alt text-xl text-accent" />AI Image Generator</h2>
            <p className="mt-1 text-[11px] text-text-dim">Image generation only · powered by your Pollinations connector</p>
          </div>
          <div className="flex items-center gap-2">
            {connectorReady && (
              <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] text-emerald-300">
                <i className="bx bx-check-circle mr-1" />Pollinations connected
                {Number.isFinite(connector?.account?.balance) ? ` · ${connector.account.balance.toFixed(3)} Pollen` : ''}
              </span>
            )}
            <button onClick={handleClose} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-text-muted transition hover:bg-surface-hover hover:text-text-primary" aria-label="Close image generator"><i className="bx bx-x text-2xl" /></button>
          </div>
        </header>

        {!connectorReady ? (
          <>
            <ConnectorGate status={connector} loading={connectorLoading} isAuthenticated={isAuthenticated} onSignIn={() => login(`${window.location.pathname}${window.location.search}`)} onEnable={handleEnable} enabling={enabling} />
            {error && <p className="mt-3 text-center text-sm text-red-400">{error}</p>}
          </>
        ) : (
          <div className="flex gap-5 max-md:flex-col">
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div>
                <label className="mb-2 block text-xs uppercase tracking-wider text-text-muted">Describe your image</label>
                <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder='e.g. "A calm hand-drawn product planning workshop in lavender tones"' className="h-28 w-full resize-none rounded-xl border border-border bg-surface-dark px-4 py-3 text-sm leading-relaxed text-text-primary placeholder:text-text-dim focus:border-accent focus:outline-none" disabled={isGenerating} autoFocus />
              </div>
              <div>
                <p className="mb-2 text-xs uppercase tracking-wider text-text-muted">Model</p>
                <div className="flex gap-2">
                  {MODELS.map((item) => (
                    <button key={item.id} onClick={() => setModel(item.id)} className={`flex-1 cursor-pointer rounded-xl border px-3 py-2 text-sm transition ${model === item.id ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border bg-surface-dark text-text-muted hover:border-border-light'}`}>
                      <span className="flex items-center justify-between gap-2 text-xs font-medium"><span>{item.label}</span><span className="text-[9px] font-normal opacity-70">{item.cost}</span></span>
                      <span className="mt-0.5 block text-left text-[10px] opacity-60">{item.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs uppercase tracking-wider text-text-muted">Size</p>
                <div className="flex flex-wrap gap-1.5">
                  {SIZES.map((size, index) => (
                    <button key={size.label} onClick={() => setSizeIdx(index)} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-[11px] transition ${sizeIdx === index ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border bg-surface-dark text-text-dim hover:border-border-light'}`}>{size.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <button onClick={() => setShowAdvanced((value) => !value)} className="flex cursor-pointer items-center gap-1.5 text-xs text-text-dim transition hover:text-text-muted"><i className={`bx bx-chevron-${showAdvanced ? 'up' : 'down'} text-sm`} />Advanced</button>
                {showAdvanced && (
                  <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_100px]">
                    <div><label className="mb-1 block text-[10px] uppercase tracking-wider text-text-dim">Negative prompt</label><input value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} placeholder="What to avoid" className="w-full rounded-lg border border-border bg-surface-dark px-3 py-2 text-xs text-text-primary placeholder:text-text-dim focus:border-accent focus:outline-none" /></div>
                    <div><label className="mb-1 block text-[10px] uppercase tracking-wider text-text-dim">Seed</label><input type="number" value={seed} onChange={(event) => setSeed(Number.parseInt(event.target.value, 10) || -1)} className="w-full rounded-lg border border-border bg-surface-dark px-3 py-2 text-xs text-text-primary focus:border-accent focus:outline-none" /></div>
                  </div>
                )}
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
                <span className="text-xs text-text-dim">Ctrl + Enter to generate</span>
                {isGenerating ? (
                  <button onClick={() => abortRef.current?.abort()} className="flex cursor-pointer items-center gap-2 rounded-xl bg-red-500/80 px-5 py-2.5 text-sm text-white transition hover:bg-red-500"><i className="bx bx-stop" />Stop</button>
                ) : (
                  <button onClick={handleGenerate} disabled={!prompt.trim()} className="flex cursor-pointer items-center gap-2 rounded-xl bg-accent px-6 py-2.5 text-sm text-white transition hover:bg-accent/85 disabled:cursor-not-allowed disabled:bg-surface-hover disabled:text-text-dim"><i className="bx bx-image-alt" />Generate</button>
                )}
              </div>
            </div>

            <div className="flex w-[340px] min-w-[300px] flex-col max-md:w-full">
              <p className="mb-2 text-xs uppercase tracking-wider text-text-muted">Preview</p>
              <div className="flex min-h-[360px] flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface-dark">
                <div className="flex flex-1 items-center justify-center p-3">
                  {isGenerating ? <LoadingAnimation /> : generatedImage ? <img src={generatedImage.imageUrl} alt="Generated with Pollinations" className="max-h-[300px] max-w-full rounded-lg object-contain" /> : (
                    <div className="px-6 text-center"><i className="bx bx-image-alt mb-3 text-4xl text-text-dim/20" /><p className="text-sm text-text-dim">Your generated image will appear here</p></div>
                  )}
                </div>
                {generatedImage && !isGenerating && (
                  <div className="flex gap-1.5 border-t border-border p-2.5">
                    <button onClick={handlePlace} className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition hover:bg-accent/85"><i className="bx bx-check text-sm" />Place on Canvas</button>
                    <button onClick={() => { setGeneratedImage(null); setError('') }} className="cursor-pointer rounded-lg border border-border-light px-3 py-2 text-xs text-text-muted transition hover:bg-surface-hover hover:text-text-primary"><i className="bx bx-refresh text-sm" /> New</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
