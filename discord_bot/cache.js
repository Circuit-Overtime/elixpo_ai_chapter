
import { CACHE_DURATION } from './config.js';

const imageCache = new Map();

/**
 * Stores image data in the cache.
 * @param {string} interactionId - The interaction ID.
 * @param {object} data - Object containing the data array and timestamp { data: Array<{attachment: AttachmentBuilder, url: string}>, timestamp: number }.
 */
export function setCache(interactionId, data) {
    // Assuming 'data' here is already the object { data: actual_array, timestamp: ... }
    // If it's just the array being passed, the setCache call in the bot code should be fixed.
    // Based on the observed nesting, the bot code is already passing the correct object structure.
    imageCache.set(interactionId, data);
}

/**
 * Retrieves image data from the cache.
 * @param {string} interactionId - The interaction ID.
 * @returns {object|null} - The cached entry { data: Array, timestamp: number } or null if not found/expired.
 */
export function getCache(interactionId) {
    const entry = imageCache.get(interactionId);
    if (!entry) return null;
    // Validate the structure slightly for safety, though the bot code should handle full validation.
    if (!entry.data || typeof entry.timestamp !== 'number') {
        imageCache.delete(interactionId); // Remove malformed data
        return null;
    }
    if (Date.now() - entry.timestamp > CACHE_DURATION) {
        imageCache.delete(interactionId);
        return null;
    }
    return entry;
}

/**
 * Deletes a cache entry.
 * @param {string} interactionId - The interaction ID.
 */
export function deleteCache(interactionId) {
    imageCache.delete(interactionId);
}

/**
 * Cleans up expired cache entries.
 */
export function cleanupCache() {
    const now = Date.now();
    for (const [key, value] of imageCache) {
         // Basic validation before checking timestamp
        if (!value || !value.data || typeof value.timestamp !== 'number' || now - value.timestamp > CACHE_DURATION) {
            imageCache.delete(key);
        }
    }
    // console.log(`Cache cleanup finished. Current cache size: ${imageCache.size}`); // Optional: for monitoring
}

export {
    imageCache
};