import { validateScene } from './scene.js';

function decodeBase64Url(value) {
  const base64 = String(value).replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function importWorkspaceKey(keyValue, usages) {
  const bytes = decodeBase64Url(keyValue);
  if (bytes.byteLength !== 32) throw new Error('The workspace encryption key is not AES-256');
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM', length: 256 }, false, usages);
}

export async function decryptRemoteScene(ciphertext, keyValue) {
  const combined = decodeBase64Url(ciphertext);
  if (combined.byteLength < 28) throw new Error('The encrypted workspace payload is invalid');
  const key = await importWorkspaceKey(keyValue, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: combined.slice(0, 12) }, key, combined.slice(12));
  return JSON.parse(new TextDecoder().decode(plaintext));
}

export async function encryptRemoteScene(scene, keyValue) {
  const key = await importWorkspaceKey(keyValue, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(scene));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv);
  combined.set(ciphertext, iv.byteLength);
  return encodeBase64Url(combined);
}

export class RemoteSceneStore {
  constructor({ baseUrl = 'https://sketch.elixpo.com', workspaceId, token, encryptionKey, fetchImpl = globalThis.fetch } = {}) {
    if (!workspaceId) throw new Error('RemoteSceneStore requires workspaceId');
    if (!token) throw new Error('RemoteSceneStore requires an agent grant token');
    if (!encryptionKey) throw new Error('RemoteSceneStore requires the workspace encryption key');
    if (typeof fetchImpl !== 'function') throw new Error('RemoteSceneStore requires fetch');
    this.url = new URL(`/api/mcp/workspaces/${encodeURIComponent(workspaceId)}`, String(baseUrl).replace(/\/$/, ''));
    this.workspaceId = workspaceId;
    this.token = token;
    this.encryptionKey = encryptionKey;
    this.fetch = fetchImpl;
    this.remoteRevision = null;
  }

  async read() {
    const response = await this.fetch(this.url, { headers: this.headers(), cache: 'no-store' });
    const body = await readJson(response);
    if (!response.ok) throw remoteError(response, body);
    const scene = await decryptRemoteScene(body.encryptedData, this.encryptionKey);
    const validation = validateScene(scene);
    if (!validation.valid) throw new Error(`Remote workspace is invalid: ${validation.errors.join('; ')}`);
    this.remoteRevision = Number(body.revision || 0);
    scene.mcpRevision = this.remoteRevision;
    return scene;
  }

  async write(scene) {
    const validation = validateScene(scene);
    if (!validation.valid) throw new Error(`Refusing to store invalid remote scene: ${validation.errors.join('; ')}`);
    if (!Number.isInteger(this.remoteRevision)) throw new Error('Read the remote workspace before writing it');
    const encryptedData = await encryptRemoteScene(scene, this.encryptionKey);
    const response = await this.fetch(this.url, {
      method: 'PUT',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ encryptedData, expectedRevision: this.remoteRevision, workspaceName: scene.name }),
    });
    const body = await readJson(response);
    if (!response.ok) throw remoteError(response, body);
    this.remoteRevision = Number(body.revision);
    return structuredClone({ ...scene, mcpRevision: this.remoteRevision });
  }

  headers() {
    return { Accept: 'application/json', Authorization: `Bearer ${this.token}` };
  }
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

function remoteError(response, body) {
  const error = new Error(body.error === 'REVISION_CONFLICT'
    ? `Revision conflict: expected ${body.expectedRevision}, current ${body.currentRevision}`
    : body.error || `Remote workspace request failed (${response.status})`);
  error.status = response.status;
  error.details = body;
  return error;
}
