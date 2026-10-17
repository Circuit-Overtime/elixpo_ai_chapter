'use client';
// useCollaboration — manages Yjs doc, WebSocket provider, and editing lock
// Returns collaboration props for BlockNote's useCreateBlockNote({ collaboration })

import { useState, useEffect, useRef } from 'react';

// Collab worker URL — set this to your deployed collab worker domain
// Custom domain blog-collab.elixpo.com currently 308-loops (not bound to the
// worker); the worker is healthy on its workers.dev URL, so default there.
const COLLAB_WS_URL = process.env.NEXT_PUBLIC_COLLAB_URL || 'wss://elixpoblogs-collab.ayushbhatt633.workers.dev';

const MAX_ACTIVE_USERS = 5;
const CONNECTION_ERROR_GRACE_MS = 8000;

export function useCollaboration({ blogId, subpageId = null, user, enabled = false }) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [error, setError] = useState(null);
  const [needsSeed, setNeedsSeed] = useState(false);
  const [roomFull, setRoomFull] = useState(false); // 5-editor cap reached (#11 F)
  const ydocRef = useRef(null);
  const providerRef = useRef(null);
  const heartbeatRef = useRef(null);
  const connectionErrorTimerRef = useRef(null);

  // Collaboration config for BlockNote (null when not in collab mode)
  const [collaboration, setCollaboration] = useState(null);

  useEffect(() => {
    if (!enabled || !blogId || !user) return;

    let cancelled = false;
    const requestController = new AbortController();

    const clearConnectionErrorTimer = () => {
      if (!connectionErrorTimerRef.current) return;
      clearTimeout(connectionErrorTimerRef.current);
      connectionErrorTimerRef.current = null;
    };

    const deferConnectionError = (provider) => {
      clearConnectionErrorTimer();
      connectionErrorTimerRef.current = setTimeout(() => {
        connectionErrorTimerRef.current = null;
        if (cancelled || providerRef.current !== provider || provider.wsconnected) return;
        setError('Live collaboration is temporarily unavailable. Reconnecting automatically');
      }, CONNECTION_ERROR_GRACE_MS);
    };

    async function init() {
      try {
        setError(null);
        setRoomFull(false);
        // The collaboration worker runs on workers.dev, so the app's session
        // cookie cannot cross that domain boundary. Exchange it server-side for
        // a signed, blog-scoped token before contacting the worker.
        const tokenResponse = await fetch(`/api/collab/token?blogId=${encodeURIComponent(blogId)}`, {
          cache: 'no-store',
          signal: requestController.signal,
        });
        const tokenData = await tokenResponse.json().catch(() => ({}));
        if (!tokenResponse.ok || !tokenData.token) {
          throw new Error(tokenData.error || 'Collaboration authorization failed');
        }
        const collabToken = tokenData.token;

        // Dynamic imports — only load Yjs when collab is active
        const Y = await import('yjs');
        const { WebsocketProvider } = await import('y-websocket');

        if (cancelled) return;

        // Pre-flight the room: if 5 distinct users are already editing and we're
        // not one of them, don't connect — caller renders read-only (#11 F).
        const httpBase = COLLAB_WS_URL.replace(/^ws/, 'http');
        const path = subpageId ? `blog/${blogId}/sub/${subpageId}/status` : `blog/${blogId}/status`;
        let roomResponse;
        try {
          roomResponse = await fetch(`${httpBase}/${path}?token=${encodeURIComponent(collabToken)}`, {
            cache: 'no-store',
            referrerPolicy: 'no-referrer',
            signal: requestController.signal,
          });
        } catch {
          throw new Error('Live collaboration is temporarily unavailable');
        }
        if (!roomResponse.ok) {
          const detail = await roomResponse.json().catch(() => ({}));
          throw new Error(detail.error || `Collaboration service rejected access (${roomResponse.status})`);
        }
        const { users = [], count = 0 } = await roomResponse.json();
        const alreadyIn = users.some((u) => u.userId === user.id);
        if (!alreadyIn && count >= MAX_ACTIVE_USERS) {
          if (!cancelled) setRoomFull(true);
          return;
        }
        if (cancelled) return;

        const ydoc = new Y.Doc();
        ydocRef.current = ydoc;

        const wsUrl = COLLAB_WS_URL.replace(/^http/, 'ws');
        // Room mirrors the worker route: /blog/<id> (main) or
        // /blog/<id>/sub/<subpageId> (sub-page). Previously "blog-<id>", which
        // didn't match the worker's "/blog/<id>" route → every connect 404'd.
        const room = subpageId ? `blog/${blogId}/sub/${subpageId}` : `blog/${blogId}`;
        const provider = new WebsocketProvider(
          wsUrl,
          room,
          ydoc,
          {
            params: {
              token: collabToken,
            },
            connect: true,
            maxBackoffTime: 10000,
          }
        );
        providerRef.current = provider;

        // Set local awareness state
        provider.awareness.setLocalStateField('user', {
          id: user.id,
          name: user.display_name || user.username || 'Anonymous',
          color: generateColor(user.id),
          avatar: user.avatar_url,
        });

        // Track connection state
        provider.on('status', ({ status }) => {
          if (!cancelled) {
            setIsConnected(status === 'connected');
            if (status === 'connected') {
              clearConnectionErrorTimer();
              setError(null);
            } else if (status === 'disconnected' && provider.shouldConnect) {
              deferConnectionError(provider);
            }
          }
        });

        provider.on('connection-error', () => {
          if (!cancelled) {
            setIsConnected(false);
            // A browser can emit this while the first upgrade is interrupted or
            // the network changes. The authenticated HTTP preflight already
            // rejected permanent access errors, so keep y-websocket's bounded
            // reconnect loop alive and only surface an error after a grace period.
            deferConnectionError(provider);
          }
        });

        // After initial sync, check if the Yjs fragment is empty (needs seeding from existing content)
        provider.once('synced', () => {
          if (cancelled) return;
          const fragment = ydoc.getXmlFragment('prosemirror');
          if (fragment.length === 0) {
            setNeedsSeed(true);
          }
        });

        // Our own presence record (incl. avatar) in a field BlockNote doesn't
        // manage — BlockNote owns awareness.user for cursors (name + color).
        const myColor = generateColor(user.id);
        provider.awareness.setLocalStateField('presence', {
          id: user.id,
          name: user.display_name || user.username || 'Anonymous',
          color: myColor,
          avatar: user.avatar_url || null,
        });

        // Track connected users via awareness (dedupe by user id).
        provider.awareness.on('change', () => {
          if (cancelled) return;
          const byId = new Map();
          provider.awareness.getStates().forEach((state) => {
            const p = state.presence || (state.user ? { name: state.user.name, color: state.user.color } : null);
            if (p) byId.set(p.id || p.name, p);
          });
          setConnectedUsers([...byId.values()]);
        });

        // Set collaboration config for BlockNote (drives the colored remote cursors)
        setCollaboration({
          fragment: ydoc.getXmlFragment('prosemirror'),
          user: {
            name: user.display_name || user.username || 'Anonymous',
            color: myColor,
          },
          provider,
        });

        // Start heartbeat to keep editing lock alive
        heartbeatRef.current = setInterval(() => {
          fetch('/api/collab/heartbeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ blogId }),
          }).catch(() => {});
        }, 60000); // every 60 seconds

        // Acquire editing lock
        fetch('/api/collab/lock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blogId }),
        }).catch(() => {});

      } catch (err) {
        if (!cancelled && err?.name !== 'AbortError') setError(err.message);
      }
    }

    init();

    return () => {
      cancelled = true;
      requestController.abort();
      clearConnectionErrorTimer();

      // Cleanup
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }

      if (providerRef.current) {
        providerRef.current.disconnect();
        providerRef.current.destroy();
        providerRef.current = null;
      }
      if (ydocRef.current) {
        ydocRef.current.destroy();
        ydocRef.current = null;
      }

      setCollaboration(null);
      setIsConnected(false);
      setConnectedUsers([]);
      setNeedsSeed(false);
      setRoomFull(false);

      // Release editing lock
      fetch('/api/collab/lock', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId }),
      }).catch(() => {});
    };
  }, [enabled, blogId, subpageId, user?.id]);

  return {
    collaboration,
    isConnected,
    connectedUsers,
    roomFull,
    error,
    needsSeed,
    clearSeed: () => setNeedsSeed(false),
  };
}

function generateColor(userId) {
  let hash = 0;
  for (let i = 0; i < (userId || '').length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 60%)`;
}
