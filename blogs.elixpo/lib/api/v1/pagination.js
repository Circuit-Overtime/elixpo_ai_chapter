function toBase64Url(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeCursor(row) {
  return toBase64Url(JSON.stringify({ updatedAt: row.updated_at, id: row.id }));
}

export function decodeCursor(value) {
  if (!value) return null;
  if (value.length > 512) throw new Error('invalid_cursor');
  try {
    const cursor = JSON.parse(fromBase64Url(value));
    if (!Number.isFinite(cursor.updatedAt) || typeof cursor.id !== 'string' || !cursor.id) throw new Error();
    return cursor;
  } catch {
    throw new Error('invalid_cursor');
  }
}

export function parsePage(searchParams) {
  const requested = Number.parseInt(searchParams.get('limit') || '20', 10);
  if (!Number.isFinite(requested) || requested < 1) throw new Error('invalid_limit');
  return { limit: Math.min(requested, 100), cursor: decodeCursor(searchParams.get('cursor')) };
}
