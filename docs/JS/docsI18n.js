let translations = {};
let currentLang = localStorage.getItem('lix_ui_prefs') 
  ? JSON.parse(localStorage.getItem('lix_ui_prefs')).language || 'en'
  : 'en';

async function loadTranslations(lang) {
  try {
    const response = await fetch(`/locales/${lang}.json`);
    translations = await response.json();
    applyTranslations();
  } catch (error) {
    console.error('Failed to load translations', error);
  }
}

window.t = function(key) {
  const keys = key.split('.');
  let value = translations;
  for (const k of keys) {
    if (value && value[k]) {
      value = value[k];
    } else {
      return key; // Fallback to key if not found
    }
  }
  return value;
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.setAttribute('placeholder', t(key));
  });

  // Dispatch event so other scripts can update their labels
  window.dispatchEvent(new Event('docs-translations-loaded'));
}

document.addEventListener('DOMContentLoaded', () => {
  loadTranslations(currentLang);
});

window.addEventListener('lix-language-changed', (e) => {
  if (e.detail && e.detail.language) {
    currentLang = e.detail.language;
    loadTranslations(currentLang);
  }
});
