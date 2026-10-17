// CollabDurableObject — Yjs CRDT sync hub using CF Hibernatable WebSockets
// One instance per blog. Relays Yjs sync/awareness messages between clients.
// Persists Yjs state to DO Storage, periodically snapshots JSON to D1.

import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import { encoding, decoding } from 'lib0';

// Message types (matching y-websocket protocol)
const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

// Close codes that a server may legally send. 1004/1005/1006/1015 are reserved
// for "reported" statuses and make WebSocket#close() throw if echoed back.
function sendableCloseCode(code) {
  const ok = (code >= 1000 && code <= 1003)
    || (code >= 1007 && code <= 1014)
    || (code >= 3000 && code <= 4999);
  return ok ? code : 1000;
}

export class CollabDurableObject {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.blogId = null;
    this.subpageId = null;

    // Hibernatable WebSockets evict this object from memory while the sockets
    // stay open. The next event (message, close, alarm) runs on a brand-new
    // instance whose constructor has just executed, so EVERY handler must see a
    // fully hydrated doc and room identity. blockConcurrencyWhile holds all
    // incoming events until hydration finishes; if it throws, the object is
    // reset instead of continuing with an empty doc that would later be
    // persisted over the real state.
    this.ready = ctx.blockConcurrencyWhile(() => this.hydrate());
    this.ready.catch(() => {});
  }

  // Load Yjs state and room identity from DO Storage.
  async hydrate() {
    const [stored, blogId, subpageId] = await Promise.all([
      this.ctx.storage.get('yjs_state'),
      this.ctx.storage.get('blog_id'),
      this.ctx.storage.get('subpage_id'),
    ]);

    if (stored) {
      try {
        Y.applyUpdate(this.doc, new Uint8Array(stored));
      } catch (err) {
        console.error('Failed to load Yjs state:', err);
        throw err;
      }
    }

    this.blogId = blogId || null;
    this.subpageId = subpageId || null;

    // Listen for doc updates → persist (debounced via alarm). Registered after
    // the stored state is applied so loading it doesn't schedule a rewrite.
    this.doc.on('update', () => {
      this.schedulePersist();
    });
  }

  schedulePersist() {
    // Use DO alarm for debounced persistence (2 seconds)
    try {
      this.ctx.storage.setAlarm(Date.now() + 2000);
    } catch {}
  }

  async alarm() {
    await this.ready;
    await this.persistState();
  }

  async persistState() {
    try {
      const state = Y.encodeStateAsUpdate(this.doc);
      await this.ctx.storage.put('yjs_state', state.buffer);
    } catch (err) {
      console.error('Failed to persist Yjs state:', err);
    }
  }

  // Snapshot Yjs binary state to D1 — sub-page rooms persist to
  // subpage_collab_state, main rooms to blog_collab_state (#11 D).
  async snapshotToD1() {
    if (!this.env.DB) return;
    try {
      const state = Y.encodeStateAsUpdate(this.doc);
      const now = Math.floor(Date.now() / 1000);
      if (this.subpageId) {
        await this.env.DB.prepare(
          'INSERT OR REPLACE INTO subpage_collab_state (subpage_id, yjs_state, updated_at) VALUES (?, ?, ?)'
        ).bind(this.subpageId, state.buffer, now).run();
      } else if (this.blogId) {
        await this.env.DB.prepare(
          'INSERT OR REPLACE INTO blog_collab_state (blog_id, yjs_state, updated_at) VALUES (?, ?, ?)'
        ).bind(this.blogId, state.buffer, now).run();
      }
    } catch (err) {
      console.error('D1 snapshot failed:', err);
    }
  }

  async fetch(request) {
    await this.ready;

    const url = new URL(request.url);

    // blogId / subpageId come from query params set by the worker (the path can
    // be /blog/<id> or /blog/<id>/sub/<subId>, so don't infer from the path).
    const qpBlogId = url.searchParams.get('blogId');
    if (qpBlogId) {
      this.blogId = qpBlogId;
      await this.ctx.storage.put('blog_id', qpBlogId);
    }
    const qpSubpageId = url.searchParams.get('subpageId');
    if (qpSubpageId) {
      this.subpageId = qpSubpageId;
      await this.ctx.storage.put('subpage_id', qpSubpageId);
    }

    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Extract user info from query params
      const userId = url.searchParams.get('userId') || 'anonymous';
      const userName = url.searchParams.get('userName') || 'Anonymous';
      const userColor = url.searchParams.get('userColor') || '#9b7bf7';

      // Cap live editing at 5 DISTINCT users per blog (#11). Reconnects / extra
      // tabs of an already-present user don't consume a slot; a genuinely new
      // 6th user is rejected so the client can fall back to read-only.
      const MAX_ACTIVE_USERS = 5;
      const activeUsers = new Set();
      for (const s of this.ctx.getWebSockets()) {
        try { const m = s.deserializeAttachment(); if (m?.userId) activeUsers.add(m.userId); } catch {}
      }
      if (!activeUsers.has(userId) && activeUsers.size >= MAX_ACTIVE_USERS) {
        return new Response(JSON.stringify({ error: 'collab_full', max: MAX_ACTIVE_USERS }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Accept with hibernation API
      this.ctx.acceptWebSocket(server, [userId]);

      // Store user metadata on the WebSocket
      server.serializeAttachment({ userId, userName, userColor });

      // Send current Yjs state to the new client
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_SYNC);
      syncProtocol.writeSyncStep1(encoder, this.doc);
      server.send(encoding.toUint8Array(encoder));

      // Send current awareness states
      const awarenessStates = awarenessProtocol.encodeAwarenessUpdate(
        this.awareness,
        Array.from(this.awareness.getStates().keys())
      );
      if (awarenessStates.byteLength > 1) {
        const awarenessEncoder = encoding.createEncoder();
        encoding.writeVarUint(awarenessEncoder, MSG_AWARENESS);
        encoding.writeVarUint8Array(awarenessEncoder, awarenessStates);
        server.send(encoding.toUint8Array(awarenessEncoder));
      }

      // Update editing lock in D1
      this.updateEditingLock(userId);

      return new Response(null, { status: 101, webSocket: client });
    }

    // HTTP endpoint: get connected user count
    if (url.pathname.endsWith('/status')) {
      const sockets = this.ctx.getWebSockets();
      const users = [];
      for (const ws of sockets) {
        try {
          const meta = ws.deserializeAttachment();
          if (meta) users.push({ userId: meta.userId, userName: meta.userName, userColor: meta.userColor });
        } catch {}
      }
      return new Response(JSON.stringify({ users, count: users.length }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  }

  async webSocketMessage(ws, message) {
    await this.ready;

    try {
      const data = new Uint8Array(message);
      const decoder = decoding.createDecoder(data);
      const msgType = decoding.readVarUint(decoder);

      switch (msgType) {
        case MSG_SYNC: {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, MSG_SYNC);
          syncProtocol.readSyncMessage(decoder, encoder, this.doc, null);

          // If there's a response (syncStep2), send back to this client
          if (encoding.length(encoder) > 1) {
            ws.send(encoding.toUint8Array(encoder));
          }

          // Broadcast the update to all OTHER clients
          // Get the raw update from the remaining decoder bytes
          this.broadcastExcept(ws, data);
          break;
        }

        case MSG_AWARENESS: {
          const update = decoding.readVarUint8Array(decoder);
          awarenessProtocol.applyAwarenessUpdate(this.awareness, update, null);
          // Broadcast awareness to all other clients
          this.broadcastExcept(ws, data);
          break;
        }
      }
    } catch (err) {
      console.error('WebSocket message error:', err);
    }
  }

  async webSocketClose(ws, code, reason) {
    // After hibernation this may be the first event on a fresh instance.
    // Without hydration the doc below would be empty and persistState() would
    // overwrite the stored document with it.
    await this.ready;

    // Clean up awareness for disconnected client
    try {
      const meta = ws.deserializeAttachment();
      if (meta?.userId) {
        // Remove awareness state for this client
        const states = this.awareness.getStates();
        for (const [clientId, state] of states) {
          if (state?.user?.id === meta.userId) {
            awarenessProtocol.removeAwarenessStates(this.awareness, [clientId], 'disconnect');
          }
        }
      }
    } catch {}

    // Echoing a reserved code (1005 "no status", 1006 abnormal) throws and
    // would skip the persistence below, so normalise it first.
    try {
      ws.close(sendableCloseCode(code), reason);
    } catch {}

    // If no more clients, persist and snapshot
    const remaining = this.ctx.getWebSockets().filter((s) => s !== ws);
    if (remaining.length === 0) {
      await this.persistState();
      await this.snapshotToD1();
      // Clear editing lock
      await this.clearEditingLock();
    }
  }

  webSocketError(ws, error) {
    console.error('WebSocket error:', error);
    try {
      ws.close(1011, 'Internal error');
    } catch {}
  }

  broadcastExcept(sender, data) {
    const sockets = this.ctx.getWebSockets();
    for (const ws of sockets) {
      if (ws !== sender) {
        try {
          ws.send(data);
        } catch {}
      }
    }
  }

  async updateEditingLock(userId) {
    if (!this.blogId || !this.env.DB) return;
    try {
      const now = Math.floor(Date.now() / 1000);
      await this.env.DB.prepare(
        'UPDATE blogs SET editing_by = ?, editing_since = ? WHERE id = ?'
      ).bind(userId, now, this.blogId).run();
    } catch {}
  }

  async clearEditingLock() {
    if (!this.blogId || !this.env.DB) return;
    try {
      await this.env.DB.prepare(
        'UPDATE blogs SET editing_by = NULL, editing_since = NULL WHERE id = ?'
      ).bind(this.blogId).run();
    } catch {}
  }
}
