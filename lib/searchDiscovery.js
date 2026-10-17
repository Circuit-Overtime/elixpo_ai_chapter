const SITE_ORIGIN = 'https://blogs.elixpo.com';
const SITE_HOST = 'blogs.elixpo.com';
const INDEXNOW_KEY = '4f8c62a19d7e43a1b65f92c88db734ae';
const INDEXNOW_KEY_LOCATION = `${SITE_ORIGIN}/${INDEXNOW_KEY}.txt`;
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const WEBSUB_HUB = 'https://pubsubhubbub.appspot.com/';
const FEED_URL = `${SITE_ORIGIN}/feed.xml`;

export function publicDiscoveryUrls(urls) {
  return [...new Set((Array.isArray(urls) ? urls : [urls]).flatMap((value) => {
    try {
      const raw = String(value || '').trim();
      if (!raw.startsWith('/') && !raw.startsWith(`${SITE_ORIGIN}/`)) return [];
      const url = new URL(raw, SITE_ORIGIN);
      return url.protocol === 'https:' && url.host === SITE_HOST ? [url.toString()] : [];
    } catch {
      return [];
    }
  }))];
}

export function indexNowPayload(urls) {
  return {
    host: SITE_HOST,
    key: INDEXNOW_KEY,
    keyLocation: INDEXNOW_KEY_LOCATION,
    urlList: publicDiscoveryUrls(urls),
  };
}

async function sendDiscoveryNotifications(urls) {
  const payload = indexNowPayload(urls);
  if (!payload.urlList.length) return;

  await Promise.allSettled([
    fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    }),
    fetch(WEBSUB_HUB, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ 'hub.mode': 'publish', 'hub.url': FEED_URL }),
    }),
  ]);
}

// Search notifications are advisory and must never delay or fail publication.
// Cloudflare keeps the request alive for delivery; local development falls back
// to a detached best-effort promise.
export function notifySearchDiscovery(urls) {
  const work = sendDiscoveryNotifications(urls).catch((error) => {
    console.error('[search-discovery] notification failed:', error?.message || error);
  });
  // Keep the Cloudflare-only module out of the Node test/import path. In the
  // Worker it is resolved immediately and registers the already-started work.
  import('@cloudflare/next-on-pages')
    .then(({ getRequestContext }) => getRequestContext().ctx.waitUntil(work))
    .catch(() => {});
}
