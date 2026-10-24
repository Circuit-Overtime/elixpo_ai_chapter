// Collab Worker — routes WebSocket connections to the CollabDurableObject
// Deployed as a separate CF Worker (Durable Objects require a dedicated worker)

import { CollabDurableObject } from './collab-do.js';

export { CollabDurableObject };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isWebSocketUpgrade = request.headers.get('Upgrade')?.toLowerCase() === 'websocket';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(request),
      });
    }

    // Routes (room name mirrors the client's y-websocket room):
    //   /blog/:blogId                       — main content WS
    //   /blog/:blogId/sub/:subpageId        — sub-page WS (#11 D)
    //   …/status                            — HTTP connected-user count
    const match = url.pathname.match(/^\/blog\/([a-zA-Z0-9_-]+)(?:\/sub\/([a-zA-Z0-9_-]+))?(\/status)?$/);
    if (!match) {
      return new Response('Not found', { status: 404 });
    }

    const blogId = match[1];
    const subpageId = match[2] || null;
    const isStatus = !!match[3];
    // One Durable Object per editing surface — main vs each sub-page.
    const roomKey = subpageId ? `${blogId}:sub:${subpageId}` : blogId;

    // Authenticate using a blog-scoped token. Cookie auth remains supported
    // for a future same-site custom domain, but workers.dev cannot receive the
    // blogs.elixpo.com session cookie.
    const session = await validateSession(request, env, blogId);
    if (!session) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
      });
    }

    // Check the user has edit access to this blog
    const hasAccess = await checkEditAccess(env.DB, blogId, session.userId, env);
    if (!hasAccess) {
      return new Response(JSON.stringify({ error: 'Not authorized' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
      });
    }

    // Get the Durable Object for this editing surface (main or sub-page)
    const doId = env.COLLAB_DO.idFromName(roomKey);
    const doStub = env.COLLAB_DO.get(doId);

    // Add user + room info to the URL for the DO
    url.searchParams.set('blogId', blogId);
    if (subpageId) url.searchParams.set('subpageId', subpageId);
    url.searchParams.delete('token');
    url.searchParams.set('userId', session.userId);
    url.searchParams.set('userName', session.displayName || session.username || 'Anonymous');
    url.searchParams.set('userColor', generateColor(session.userId));

    // Forward to DO
    const doResponse = await doStub.fetch(new Request(url.toString(), request));

    // A WebSocket upgrade response carries Cloudflare's non-standard
    // `webSocket` attachment. Reconstructing it with `new Response()` drops
    // that attachment and interrupts every otherwise-authorized connection.
    // Upgrade responses must be returned from the Durable Object untouched.
    if (isWebSocketUpgrade) {
      return doResponse;
    }

    // Add CORS headers to the response
    const response = new Response(doResponse.body, doResponse);
    for (const [key, value] of Object.entries(corsHeaders(request))) {
      response.headers.set(key, value);
    }
    return response;
  },
};

// Validate the HMAC-signed session cookie — mirrors lib/auth.js in the main app.
// Cookie format: base64url(payloadJSON) + "." + base64url(hmacSHA256(payload)).
// Requires SESSION_SECRET in the worker env (pushed by deploy.sh secrets).
function b64urlToBytes(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function validateSession(request, env, expectedBlogId) {
  try {
    const url = new URL(request.url);
    const cookie = request.headers.get('Cookie') || '';
    const m = cookie.match(/lixblogs_session=([^;]+)/);
    const queryToken = url.searchParams.get('token');
    if ((!queryToken && !m) || !env.SESSION_SECRET) return null;

    const raw = queryToken || decodeURIComponent(m[1]);
    const dot = raw.indexOf('.');
    if (dot <= 0) return null;

    const payloadBytes = b64urlToBytes(raw.slice(0, dot));
    const sigBytes = b64urlToBytes(raw.slice(dot + 1));

    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(env.SESSION_SECRET),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
    );
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, payloadBytes);
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (!payload?.userId) return null;

    // Query-string credentials are deliberately narrower than the normal app
    // session: one blog, one purpose, and a fixed expiry.
    if (queryToken) {
      const now = Math.floor(Date.now() / 1000);
      if (
        payload.purpose !== 'collab'
        || payload.blogId !== expectedBlogId
        || !Number.isFinite(payload.exp)
        || payload.exp < now
      ) return null;
    }

    return {
      userId: payload.userId,
      username: payload.username || payload.profile?.username,
      displayName: payload.displayName || payload.profile?.display_name,
    };
  } catch {
    return null;
  }
}

// Check if user can edit this blog (author or co-author with write access)
async function checkEditAccess(db, blogId, userId, env) {
  // Fail closed without a database binding. Local dev can opt into the
  // permissive path explicitly with ALLOW_NO_DB_DEV=1.
  if (!db) return env?.ALLOW_NO_DB_DEV === '1';
  try {
    // Check if author
    const blog = await db.prepare(
      'SELECT author_id, published_as FROM blogs WHERE id = ?'
    ).bind(blogId).first();

    if (!blog) return false;
    if (blog.author_id === userId) return true;

    // Check co-author
    const coAuthor = await db.prepare(
      "SELECT user_id FROM blog_co_authors WHERE blog_id = ? AND user_id = ? AND status = 'accepted' AND role IN ('editor','admin')"
    ).bind(blogId, userId).first();
    if (coAuthor) return true;

    // Check org member with write access
    if (blog.published_as?.startsWith('org:')) {
      const orgId = blog.published_as.replace('org:', '');
      const member = await db.prepare(
        "SELECT role FROM org_members WHERE org_id = ? AND user_id = ? AND role IN ('admin','maintain','write')"
      ).bind(orgId, userId).first();
      if (member) return true;
    }

    return false;
  } catch (error) {
    console.error('Collaboration access check failed:', error);
    return false;
  }
}

function generateColor(userId) {
  // Deterministic color from userId
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 60%)`;
}

const ALLOWED_ORIGINS = new Set(['https://blogs.elixpo.com', 'http://localhost:3000']);

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : 'https://blogs.elixpo.com';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  };
}
