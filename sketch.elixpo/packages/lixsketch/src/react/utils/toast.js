// Lightweight toast stub for offline mode. Hosts can override by mounting
// a #lixsketch-toast container; otherwise we fall back to a console log.
export function showToast(message, options = {}) {
  const tone = options.tone || 'info';
  const root = typeof document !== 'undefined' ? document.getElementById('lixsketch-toast') : null;
  if (!root) {
    console.log(`[lixsketch:${tone}]`, message);
    return;
  }
  const el = document.createElement('div');
  el.className = `lixsketch-toast-item is-${tone}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => { el.classList.add('is-leaving'); }, 1800);
  setTimeout(() => { try { root.removeChild(el); } catch {} }, 2200);
}

export default { showToast };
