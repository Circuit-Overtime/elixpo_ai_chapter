const DEFAULT_MARKETPLACE_URL = 'https://sketch.elixpo.com';

function decodeBase64Url(value) {
  const base64 = String(value).replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function decryptPublicTemplate(ciphertext, keyValue) {
  const keyBytes = decodeBase64Url(keyValue);
  if (keyBytes.byteLength !== 32) throw new Error('Template key is not AES-256');
  const combined = decodeBase64Url(ciphertext);
  if (combined.byteLength < 28) throw new Error('Template ciphertext is invalid');
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: combined.slice(0, 12) }, key, combined.slice(12));
  return JSON.parse(new TextDecoder().decode(plaintext));
}

export class MarketplaceTemplateProvider {
  constructor({ baseUrl = DEFAULT_MARKETPLACE_URL, fetchImpl = globalThis.fetch } = {}) {
    if (typeof fetchImpl !== 'function') throw new Error('MarketplaceTemplateProvider requires fetch');
    this.baseUrl = String(baseUrl).replace(/\/$/, '');
    this.fetch = fetchImpl;
  }

  async search({ query = '', tag = '', limit = 12 } = {}) {
    const url = new URL('/api/templates', this.baseUrl);
    if (query) url.searchParams.set('q', String(query).slice(0, 80));
    if (tag) url.searchParams.set('tag', String(tag).slice(0, 24));
    url.searchParams.set('limit', String(Math.min(24, Math.max(1, Number(limit) || 12))));
    const response = await this.fetch(url, { headers: { accept: 'application/json' } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || `Marketplace request failed (${response.status})`);
    return body.templates || [];
  }

  async load(slug) {
    const safeSlug = String(slug || '').trim();
    if (!/^[a-z0-9-]{1,80}$/.test(safeSlug)) throw new Error('Template slug is invalid');
    const url = new URL(`/api/templates/${encodeURIComponent(safeSlug)}`, this.baseUrl);
    url.searchParams.set('snapshot', '1');
    const response = await this.fetch(url, { headers: { accept: 'application/json' } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || `Template request failed (${response.status})`);
    const template = body.template;
    if (!template?.encryptedData || !template?.publicKey) throw new Error('Template snapshot is unavailable');
    return { metadata: { ...template, encryptedData: undefined, publicKey: undefined, encryptedDocData: undefined }, scene: await decryptPublicTemplate(template.encryptedData, template.publicKey) };
  }
}

