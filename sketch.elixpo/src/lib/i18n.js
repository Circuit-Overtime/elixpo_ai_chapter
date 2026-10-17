import en from '../locales/en.json'
import bg from '../locales/bg.json'
import de from '../locales/de.json'
import hi from '../locales/hi.json'
import useUIStore from '../store/useUIStore'

const locales = {
  en,
  bg,
  de,
  hi
}

/**
 * Get a nested value from an object using a dot-path.
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((acc, part) => acc && acc[part], obj)
}

/**
 * Main translation function.
 * It resolves the current language from useUIStore, looks up the key in the corresponding locale file,
 * and falls back to English if the key is missing.
 */
export function t(key, variables = {}) {
  // Always safely get the store state, fallback to English
  const state = typeof useUIStore.getState === 'function' ? useUIStore.getState() : {}
  const lang = state.language || 'en'
  
  const currentLocale = locales[lang] || locales.en
  let translation = getNestedValue(currentLocale, key)

  // Fallback to English
  if (translation === undefined) {
    translation = getNestedValue(locales.en, key)
  }

  // If still not found, return the key itself
  if (translation === undefined) {
    return key
  }

  // Replace variables
  Object.keys(variables).forEach((varKey) => {
    translation = translation.replace(new RegExp(`{${varKey}}`, 'g'), variables[varKey])
  })

  return translation
}

/**
 * Initialize language from localStorage on app start (for non-React envs if needed).
 */
export function initI18n() {
  if (typeof window !== 'undefined') {
    const prefs = localStorage.getItem('lix_ui_prefs')
    if (prefs) {
      try {
        const parsed = JSON.parse(prefs)
        if (parsed.language && locales[parsed.language]) {
          useUIStore.getState().setLanguage(parsed.language)
        }
      } catch (e) {
        // ignore JSON parse error
      }
    }
  }
}

/**
 * Vanilla JS binding to update data-i18n elements
 */
export function updateDOMTranslations() {
  if (typeof window === 'undefined') return
  
  const elements = document.querySelectorAll('[data-i18n]')
  elements.forEach((el) => {
    const key = el.getAttribute('data-i18n')
    if (key) {
      el.textContent = t(key)
    }
    
    // Also handle placeholders if needed
    const placeholderKey = el.getAttribute('data-i18n-placeholder')
    if (placeholderKey) {
      el.setAttribute('placeholder', t(placeholderKey))
    }
    
    const titleKey = el.getAttribute('data-i18n-title')
    if (titleKey) {
      el.setAttribute('title', t(titleKey))
    }
  })
}
