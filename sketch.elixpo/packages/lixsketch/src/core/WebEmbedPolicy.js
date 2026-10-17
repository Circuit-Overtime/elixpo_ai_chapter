/* eslint-disable */

const ALLOWED_HOSTS = [
    'youtube.com', 'youtu.be', 'vimeo.com', 'codepen.io', 'codesandbox.io',
    'stackblitz.com', 'figma.com', 'docs.google.com', 'github.com', 'gist.github.com',
];

function hostMatches(hostname, allowed) {
    return hostname === allowed || hostname.endsWith(`.${allowed}`);
}

export function normalizeWebEmbedUrl(value) {
    let parsed;
    try { parsed = new URL(String(value || '').trim()); } catch { return null; }
    if (parsed.protocol !== 'https:') return null;

    const host = parsed.hostname.toLowerCase();
    const isElixpo = host === 'elixpo.com' || host.endsWith('.elixpo.com');
    if (!isElixpo && !ALLOWED_HOSTS.some((allowed) => hostMatches(host, allowed))) return null;

    if (hostMatches(host, 'youtube.com')) {
        const id = parsed.pathname.startsWith('/embed/')
            ? parsed.pathname.split('/')[2]
            : parsed.searchParams.get('v');
        if (id) return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
    }
    if (host === 'youtu.be') {
        const id = parsed.pathname.split('/').filter(Boolean)[0];
        if (id) return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
    }
    if (hostMatches(host, 'vimeo.com') && host !== 'player.vimeo.com') {
        const id = parsed.pathname.split('/').filter(Boolean)[0];
        if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
    return parsed.toString();
}

export function isAllowedWebEmbedUrl(value) {
    return normalizeWebEmbedUrl(value) !== null;
}

