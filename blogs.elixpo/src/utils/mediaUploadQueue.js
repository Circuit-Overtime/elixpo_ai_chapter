'use client';

const DB_NAME = 'lixblogs-media-queue';
const STORE_NAME = 'uploads';
const DB_VERSION = 1;
const EVENT_NAME = 'lixblogs:media-upload';
const activeUploads = new Map();
const memoryJobs = new Map();

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Media queue database is blocked'));
  });
}

async function writeJob(job) {
  const db = await openDB();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(job);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Media queue transaction was aborted'));
    });
  } finally {
    db.close();
  }
}

async function readJob(id) {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME);
      const request = tx.objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.onabort = () => reject(tx.error || new Error('Media queue transaction was aborted'));
    });
  } finally {
    db.close();
  }
}

async function loadJob(id) {
  const inMemory = memoryJobs.get(id);
  if (inMemory) return inMemory;
  try {
    const persisted = await readJob(id);
    if (persisted) memoryJobs.set(id, persisted);
    return persisted || memoryJobs.get(id) || null;
  } catch {
    return memoryJobs.get(id) || null;
  }
}

async function persistJob(job) {
  memoryJobs.set(job.id, job);
  try {
    await writeJob(job);
    return true;
  } catch (error) {
    // Firefox can abort IndexedDB transactions during storage pressure/private
    // sessions. Durability is an enhancement; it must never cancel the active
    // upload that is still safe to complete from memory.
    console.warn('[media queue] Durable persistence unavailable:', error?.message || error);
    return false;
  }
}

function announce(job) {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, {
    detail: { id: job.id, blogId: job.blogId, type: job.type, status: job.status, result: job.result },
  }));
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForQueuedJob(id, timeoutMs = 30 * 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await loadJob(id);
    if (job) return job;
    await delay(100);
  }
  return null;
}

async function waitForSettledUpload(job, timeoutMs = 3 * 60 * 1000) {
  const deadline = Date.now() + timeoutMs;
  const url = `/api/media/upload?uploadId=${encodeURIComponent(job.id)}`;
  while (Date.now() < deadline) {
    await delay(2000);
    try {
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (response.ok) {
        const result = await response.json();
        if (result?.url) return result;
      } else if ([400, 401, 403].includes(response.status)) {
        const detail = await response.json().catch(() => ({}));
        const error = new Error(detail.error || `Upload status failed (${response.status})`);
        error.nonRetryable = true;
        throw error;
      }
    } catch (error) {
      if (error.nonRetryable) throw error;
      // A status poll can fail for the same transient reason as the upload.
      // Keep the durable job pending and try again until the settlement window.
    }
  }
  return null;
}

async function runUpload(id) {
  if (activeUploads.has(id)) return activeUploads.get(id);
  const task = (async () => {
    // A newly inserted image marks its block as uploading before client-side
    // compression has produced and persisted the upload body. The renderer's
    // reload-resume effect can arrive here during that gap; wait for enqueue
    // instead of turning the placeholder into a false error state.
    const job = await waitForQueuedJob(id);
    if (!job) throw new Error('Upload is no longer available');
    if (job.status === 'complete' && job.result) return job.result;
    job.status = 'uploading';
    job.attempts = (job.attempts || 0) + 1;
    await persistJob(job);
    announce(job);

    let data;
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const uploadBlob = job.blob?.type
          ? job.blob
          : new Blob([job.blob], { type: job.mimeType || 'image/webp' });
        // Use the same JSON transport as the rest of the Pages API. Production
        // Cloudflare rejected both multipart and raw image requests before the
        // Function ran (generic HTML 400), while JSON requests reach the route.
        const body = JSON.stringify({
          data: await blobToBase64(uploadBlob),
          mimeType: uploadBlob.type || 'image/webp',
          type: job.type,
          uploadId: job.id,
          blogId: job.blogId || '',
          orgId: job.orgId || '',
        });
        const response = await fetch('/api/media/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        const responseText = await response.text();
        try { data = responseText ? JSON.parse(responseText) : {}; } catch { data = {}; }
        if (response.ok) break;
        const isHtml = /^\s*<!doctype|^\s*<html/i.test(responseText);
        const detail = isHtml ? '' : responseText.slice(0, 300).trim();
        lastError = new Error(data.error || detail || `Upload failed (${response.status})`);
        if (![502, 503, 504].includes(response.status)) {
          lastError.nonRetryable = true;
          throw lastError;
        }
      } catch (error) {
        lastError = error;
        // Fetch aborts and connection resets are ambiguous: the Worker may still
        // finish the upload. Poll the idempotent result instead of flashing a
        // false failure and starting a duplicate Cloudinary request.
        if (!error.nonRetryable && (error?.name === 'AbortError' || error instanceof TypeError)) {
          const settled = await waitForSettledUpload(job);
          if (settled) {
            data = settled;
            break;
          }
          throw new Error('The upload did not finish. Check your connection and retry.');
        }
        if (error.nonRetryable || attempt === 2) throw error;
      }
      await delay(500 * (2 ** attempt));
    }
    if (!data?.url) throw lastError || new Error('Upload failed');
    job.status = 'complete';
    job.result = data;
    job.completedAt = Date.now();
    await persistJob(job);
    announce(job);
    return data;
  })().catch(async (error) => {
    const job = await loadJob(id);
    if (job) {
      job.status = 'error';
      job.error = error.message;
      await persistJob(job);
      announce(job);
    }
    throw error;
  }).finally(() => activeUploads.delete(id));
  activeUploads.set(id, task);
  return task;
}

export function createMediaUploadId() {
  return crypto.randomUUID();
}

export async function enqueueMediaUpload(blob, options = {}) {
  const id = options.id || createMediaUploadId();
  const existing = await loadJob(id);
  if (!existing) {
    // ArrayBuffers are consistently structured-cloneable in Firefox IndexedDB;
    // persisting a canvas-backed Blob can abort the transaction in some modes.
    const bytes = await blob.arrayBuffer();
    await persistJob({
      id,
      blob: bytes,
      mimeType: blob.type || 'image/webp',
      filename: options.filename || `image_${id}.webp`,
      blogId: options.blogId || '',
      orgId: options.orgId || '',
      type: options.type || 'image',
      status: 'queued',
      attempts: 0,
      createdAt: Date.now(),
    });
  }
  return runUpload(id);
}

export function resumeMediaUpload(id) {
  return runUpload(id);
}

export const MEDIA_UPLOAD_EVENT = EVENT_NAME;
