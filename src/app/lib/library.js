const LIBRARY_KEY = 'elixpo_library';
const MAX_ITEMS = 200;

export function getLibrary() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveToLibrary(item) {
  const library = getLibrary();

  // Don't duplicate
  const exists = library.findIndex((i) => i.sessionId === item.sessionId);
  if (exists >= 0) {
    library[exists] = { ...library[exists], ...item, updatedAt: Date.now() };
  } else {
    library.unshift({
      ...item,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  // Cap at MAX_ITEMS
  if (library.length > MAX_ITEMS) library.length = MAX_ITEMS;

  localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
  return library;
}

export function removeFromLibrary(sessionId) {
  const library = getLibrary().filter((i) => i.sessionId !== sessionId);
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
  return library;
}

export function clearLibrary() {
  localStorage.removeItem(LIBRARY_KEY);
}

export function getLibraryItem(sessionId) {
  return getLibrary().find((i) => i.sessionId === sessionId) || null;
}
