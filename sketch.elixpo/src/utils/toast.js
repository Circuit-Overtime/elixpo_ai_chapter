// Minimal transient toast helper.
// Imperative on purpose — fires from non-React code paths (engine
// keyboard handlers, store actions) without a React provider.
//
//   showToast('Grouped')
//   showToast('Saved', { tone: 'success', duration: 1500 })
//
// Multiple toasts are queued in a single host element; calling again
// before the previous fades out replaces the message and resets the
// fade timer.

const HOST_ID = 'lixsketch-toast-host'

function ensureHost() {
  if (typeof document === 'undefined') return null
  let host = document.getElementById(HOST_ID)
  if (host) return host
  host = document.createElement('div')
  host.id = HOST_ID
  host.style.cssText = [
    'position:fixed',
    'left:50%',
    'bottom:80px',
    'transform:translateX(-50%)',
    'z-index:99999',
    'pointer-events:none',
    'font-family:lixFont, system-ui, sans-serif',
  ].join(';')
  document.body.appendChild(host)
  return host
}

const TONE_STYLES = {
  default: { bg: 'rgba(35,35,41,0.85)', fg: '#e8e8ee', icon: 'bx-info-circle', iconColor: '#9ba8b9' },
  success: { bg: 'rgba(35,35,41,0.85)', fg: '#e8e8ee', icon: 'bx-check', iconColor: '#4ade80' },
  warn: { bg: 'rgba(35,35,41,0.85)', fg: '#e8e8ee', icon: 'bx-error', iconColor: '#fbbf24' },
}

export function showToast(message, options = {}) {
  const host = ensureHost()
  if (!host) return
  const { tone = 'default', duration = 1400 } = options
  const style = TONE_STYLES[tone] || TONE_STYLES.default

  host.innerHTML = ''
  const el = document.createElement('div')
  el.style.cssText = [
    `background:${style.bg}`,
    `color:${style.fg}`,
    'backdrop-filter:blur(8px)',
    '-webkit-backdrop-filter:blur(8px)',
    'border:1px solid rgba(255,255,255,0.08)',
    'border-radius:12px',
    'padding:8px 14px',
    'font-size:12px',
    'display:flex',
    'align-items:center',
    'gap:8px',
    'box-shadow:0 8px 28px rgba(0,0,0,0.35)',
    'opacity:0',
    'transform:translateY(8px)',
    'transition:opacity 150ms ease, transform 150ms ease',
  ].join(';')
  el.innerHTML = `<i class="bx ${style.icon}" style="color:${style.iconColor};font-size:14px"></i><span>${message.replace(/[<>]/g, '')}</span>`
  host.appendChild(el)

  // Fade-in
  requestAnimationFrame(() => {
    el.style.opacity = '1'
    el.style.transform = 'translateY(0)'
  })

  // Fade-out + remove
  clearTimeout(host._fadeTimer)
  host._fadeTimer = setTimeout(() => {
    el.style.opacity = '0'
    el.style.transform = 'translateY(8px)'
    setTimeout(() => {
      try { host.removeChild(el) } catch {}
    }, 200)
  }, duration)
}

// Make available to non-React engine code (keyboard handlers etc.)
if (typeof window !== 'undefined') {
  window.__showToast = showToast
}
