// Lightweight i18n stub for the offline package. Converts dotted keys
// into readable labels so consumers don't have to ship a full translation
// table just to get nice button names. A real `t()` from the host can be
// passed in via `options.t` if needed (LixSketchCanvas can wire it up
// later).
//
//   t('sidebar.sectionHeader.stroke')           → 'Stroke'
//   t('sidebar.bringForward')                   → 'Bring forward'
//   t('menu.canvasBackground')                  → 'Canvas background'
//   t('shortcuts.deselect', 'Deselect')         → 'Deselect' (fallback wins)

// Hand-written overrides for keys that don't reduce cleanly from the
// last segment alone (acronyms, hyphens, multi-word phrases).
const OVERRIDES = {
  'sidebar.sectionHeader.stroke': 'Stroke',
  'sidebar.sectionHeader.fill': 'Fill',
  'sidebar.sectionHeader.background': 'Background',
  'sidebar.sectionHeader.backgroundImage': 'Background image',
  'sidebar.sectionHeader.width': 'Width',
  'sidebar.sectionHeader.edge': 'Edge style',
  'sidebar.sectionHeader.head': 'Arrow head',
  'sidebar.sectionHeader.type': 'Type',
  'sidebar.sectionHeader.name': 'Name',
  'sidebar.sectionHeader.color': 'Color',
  'sidebar.sectionHeader.fit': 'Fit',
  'sidebar.sectionHeader.roughness': 'Roughness',
  'sidebar.sectionHeader.sloppiness': 'Sloppiness',
  'sidebar.sectionHeader.taper': 'Taper',
  'menu.canvasBackground': 'Canvas background',
  'menu.canvasProperties': 'Canvas properties',
  'menu.exportImage': 'Export as image',
  'menu.findText': 'Find text',
  'menu.quickSave': 'Quick save',
  'menu.resetCanvas': 'Reset canvas',
  'menu.saveShare': 'Save & share',
  'menu.showGrid': 'Show grid',
  'menu.signIn': 'Sign in',
  'menu.signOut': 'Sign out',
  'prefs.toolLock': 'Tool lock',
  'prefs.toggleGrid': 'Toggle grid',
  'prefs.snapObjects': 'Snap to objects',
  'prefs.snapMidpoints': 'Snap to midpoints',
  'prefs.zenMode': 'Zen mode',
  'prefs.viewMode': 'View mode',
  'prefs.canvasShapeProps': 'Canvas & shape properties',
  'prefs.arrowBinding': 'Arrow binding',
  'prefs.language': 'Language',
  'sidebar.bringForward': 'Bring forward',
  'sidebar.bringToFront': 'Bring to front',
  'sidebar.sendBackward': 'Send backward',
  'sidebar.sendToBack': 'Send to back',
  'sidebar.fillColor': 'Fill color',
  'sidebar.strokeColor': 'Stroke color',
  'sidebar.codeMode': 'Code mode',
  'sidebar.renderText': 'Render text',
  'sidebar.newLine': 'New line',
};

function camelToWords(s) {
  return s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/-/g, ' ');
}

function autoFormat(key) {
  const last = key.split('.').pop() || key;
  const words = camelToWords(last);
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function tImpl(key, fallbackOrOpts) {
  if (typeof key !== 'string') return fallbackOrOpts ?? '';
  // The product calls t() with various signatures: (key), (key, fallback),
  // (key, { defaultValue }). Handle all of them.
  let fallback = '';
  if (typeof fallbackOrOpts === 'string') {
    fallback = fallbackOrOpts;
  } else if (fallbackOrOpts && typeof fallbackOrOpts === 'object') {
    fallback = fallbackOrOpts.defaultValue || '';
  }
  if (fallback) return fallback;
  if (OVERRIDES[key]) return OVERRIDES[key];
  return autoFormat(key);
}

export function useTranslation() {
  return {
    t: tImpl,
    locale: 'en',
    setLocale: () => {},
  };
}

export default useTranslation;
