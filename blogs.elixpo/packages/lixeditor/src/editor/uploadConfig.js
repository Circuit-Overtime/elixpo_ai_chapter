'use client';

import { createContext, useContext } from 'react';

// Host-controlled media upload. Two ways to provide it:
//  1. <LixEditor uploadFile={...} /> → set via this context (preferred, SSR-safe)
//  2. setImageUploader(fn) → module-level fallback (mirrors setLinkPreviewEndpoint)
// When neither is set, blocks fall back to base64 readAsDataURL (zero-config).

let moduleUploader = null;
export function setImageUploader(fn) { moduleUploader = typeof fn === 'function' ? fn : null; }
export function getModuleUploader() { return moduleUploader; }

export const LixUploadContext = createContext(null);

const DEFAULT_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

// Resolves the effective upload config for a block: context first, then module
// setter. `uploadFile` is null when the host hasn't configured one.
export function useUploadConfig() {
  const ctx = useContext(LixUploadContext);
  return {
    uploadFile: ctx?.uploadFile || moduleUploader || null,
    acceptImageTypes: ctx?.acceptImageTypes || DEFAULT_IMAGE_TYPES,
    maxFileSizeBytes: ctx?.maxFileSizeBytes || 0, // 0 = unlimited
    onUploadError: ctx?.onUploadError || null,
    // 'default' → in-block Upload/Embed-URL card; 'host' → no placeholder, images
    // appear only once they have a URL (host inserts via its own toolbar/picker).
    imageInsert: ctx?.imageInsert || 'default',
  };
}
