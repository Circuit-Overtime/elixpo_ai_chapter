export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { isSafePreviewUrl, resolvePreviewAsset } from '../../../lib/linkPreviewUrl';

const MAX_REDIRECTS = 5;

// Simple meta tag extractor — no DOM parser needed on edge
function extractMeta(html, property) {
  // Match <meta property="og:..." content="..."> or <meta name="..." content="...">
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1];
  }
  return '';
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : '';
}

function extractFavicon(html, documentUrl) {
  // Look for <link rel="icon" href="..."> or <link rel="shortcut icon" href="...">
  const m = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i)
    || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i);
  if (m) {
    return resolvePreviewAsset(m[1], documentUrl);
  }
  // Fallback to Google's favicon service
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(documentUrl).hostname)}&sz=32`;
}

async function fetchPreview(startUrl, options) {
  let currentUrl = startUrl;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    if (!isSafePreviewUrl(currentUrl)) throw new Error('Unsafe preview URL');

    const response = await fetch(currentUrl.href, { ...options, redirect: 'manual' });
    if (response.status < 300 || response.status >= 400) {
      return { response, finalUrl: currentUrl };
    }

    const location = response.headers.get('location');
    if (!location || redirects === MAX_REDIRECTS) throw new Error('Invalid preview redirect');
    response.body?.cancel();
    currentUrl = new URL(location, currentUrl);
  }

  throw new Error('Too many preview redirects');
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  // Validate URL
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }
  if (!isSafePreviewUrl(parsed)) {
    return NextResponse.json({ error: 'Unsupported URL' }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const { response: res, finalUrl } = await fetchPreview(parsed, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'LixBlogs-LinkPreview/1.0',
        'Accept': 'text/html',
      },
    });

    if (!res.ok) {
      clearTimeout(timeout);
      return NextResponse.json({
        title: finalUrl.hostname,
        description: '',
        image: '',
        favicon: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(finalUrl.hostname)}&sz=32`,
        domain: finalUrl.hostname,
      }, {
        headers: { 'Cache-Control': 'public, max-age=3600' },
      });
    }

    // Only read first 50KB to avoid downloading huge pages
    const reader = res.body?.getReader();
    if (!reader) throw new Error('Preview response has no body');
    const decoder = new TextDecoder();
    let html = '';
    let bytesRead = 0;
    const maxBytes = 50000;

    while (bytesRead < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      bytesRead += value.length;
    }
    reader.cancel();
    clearTimeout(timeout);

    const ogTitle = extractMeta(html, 'og:title');
    const ogDesc = extractMeta(html, 'og:description') || extractMeta(html, 'description');
    const ogImage = extractMeta(html, 'og:image');
    const title = ogTitle || extractTitle(html) || finalUrl.hostname;
    const favicon = extractFavicon(html, finalUrl);

    // Resolve relative og:image
    const image = resolvePreviewAsset(ogImage, finalUrl);

    return NextResponse.json({
      title,
      description: ogDesc || '',
      image: image || '',
      favicon,
      domain: finalUrl.hostname,
    }, {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  } catch (err) {
    // On timeout or fetch error, return minimal data
    return NextResponse.json({
      title: parsed.hostname,
      description: '',
      image: '',
      favicon: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=32`,
      domain: parsed.hostname,
    }, {
      headers: { 'Cache-Control': 'public, max-age=600' },
    });
  }
}
