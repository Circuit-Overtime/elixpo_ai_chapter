// Shared Pollinations API config — used by all API routes
export const POLLI_TOKEN = process.env.POLLINATIONS_API_TOKEN || process.env.NEXT_PUBLIC_POLLINATIONS_API_IMAGE;
export const POLLI_BASE = 'https://gen.pollinations.ai';
export const MEDIA_BASE = 'https://media.pollinations.ai';
export const TEXT_BASE = 'https://text.pollinations.ai';

export function polliHeaders(json = true) {
  const headers = {};
  if (json) headers['Content-Type'] = 'application/json';
  if (POLLI_TOKEN) headers['Authorization'] = `Bearer ${POLLI_TOKEN}`;
  return headers;
}
