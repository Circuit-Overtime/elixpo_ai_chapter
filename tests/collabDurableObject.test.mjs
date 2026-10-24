import test from 'node:test';
import assert from 'node:assert/strict';

// The Durable Object depends on yjs / y-protocols / lib0. Skip (rather than
// fail) in environments where those packages are not installed.
let Y;
let CollabDurableObject;
try {
  Y = await import('yjs');
  ({ CollabDurableObject } = await import('../worker/collab/src/collab-do.js'));
} catch {
  // handled via the skip flag below
}
const skip = !CollabDurableObject && 'yjs / y-protocols / lib0 not installed';

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    async get(key) { return data.get(key); },
    async put(key, value) { data.set(key, value); },
    async setAlarm() {},
  };
}

function fakeCtx(storage, sockets = []) {
  return {
    storage,
    blockConcurrencyWhile: (fn) => fn(),
    getWebSockets: () => sockets,
  };
}

function fakeDb() {
  const writes = [];
  return {
    writes,
    prepare(sql) {
      return {
        bind(...params) {
          return { async run() { writes.push({ sql, params }); } };
        },
      };
    },
  };
}

function fakeSocket() {
  return {
    closed: null,
    close(code, reason) {
      // Mirrors the Workers runtime: reserved codes throw.
      if (code === 1005 || code === 1006 || code === 1015) {
        throw new TypeError('Invalid WebSocket close code');
      }
      this.closed = { code, reason };
    },
    deserializeAttachment() { return { userId: 'user-1' }; },
  };
}

function encodedDocWithText(text) {
  const doc = new Y.Doc();
  doc.getText('body').insert(0, text);
  return Y.encodeStateAsUpdate(doc);
}

function decodeText(buffer) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(buffer));
  return doc.getText('body').toString();
}

function destroyRoom(t, room) {
  t.after(() => {
    room.awareness.destroy();
    room.doc.destroy();
  });
}

test('last socket closing after hibernation keeps the stored document', { skip }, async (t) => {
  const state = encodedDocWithText('hello collab');
  const storage = fakeStorage({ yjs_state: state.buffer, blog_id: 'blog-1' });
  const db = fakeDb();

  // A fresh instance == the object waking up from hibernation. The first event
  // it sees is the close of the final client, with a reserved close code.
  const room = new CollabDurableObject(fakeCtx(storage), { DB: db });
  destroyRoom(t, room);
  await room.webSocketClose(fakeSocket(), 1005, '');

  assert.equal(decodeText(storage.data.get('yjs_state')), 'hello collab');
  const snapshot = db.writes.find((w) => w.sql.includes('blog_collab_state'));
  assert.ok(snapshot, 'main room snapshot should be written for blog-1');
  assert.equal(snapshot.params[0], 'blog-1');
  assert.equal(decodeText(snapshot.params[1]), 'hello collab');
});

test('sub-page rooms keep snapshotting to subpage_collab_state after hibernation', { skip }, async (t) => {
  const state = encodedDocWithText('sub-page draft');
  const storage = fakeStorage({
    yjs_state: state.buffer,
    blog_id: 'blog-1',
    subpage_id: 'sub-9',
  });
  const db = fakeDb();

  const room = new CollabDurableObject(fakeCtx(storage), { DB: db });
  destroyRoom(t, room);
  await room.webSocketClose(fakeSocket(), 1001, 'going away');

  assert.equal(
    db.writes.some((w) => w.sql.includes('INTO blog_collab_state')),
    false,
    'sub-page state must never overwrite the parent blog row',
  );
  const snapshot = db.writes.find((w) => w.sql.includes('INTO subpage_collab_state'));
  assert.ok(snapshot);
  assert.equal(snapshot.params[0], 'sub-9');
});

test('alarm after wake-up persists the hydrated document, not an empty one', { skip }, async (t) => {
  const state = encodedDocWithText('draft in progress');
  const storage = fakeStorage({ yjs_state: state.buffer, blog_id: 'blog-1' });

  const room = new CollabDurableObject(fakeCtx(storage), { DB: fakeDb() });
  destroyRoom(t, room);
  await room.alarm();

  assert.equal(decodeText(storage.data.get('yjs_state')), 'draft in progress');
});

test('a failed hydrate never persists an empty document', { skip }, async (t) => {
  const storage = fakeStorage({ blog_id: 'blog-1' });
  storage.get = async () => { throw new Error('storage unavailable'); };
  const ctx = fakeCtx(storage);
  ctx.blockConcurrencyWhile = (fn) => fn();

  const room = new CollabDurableObject(ctx, { DB: fakeDb() });
  destroyRoom(t, room);
  await assert.rejects(room.alarm(), /storage unavailable/);
  assert.equal(storage.data.has('yjs_state'), false);
});

test('a malformed stored update never gets replaced with an empty document', { skip }, async (t) => {
  const malformed = new Uint8Array([255, 255, 255]).buffer;
  const storage = fakeStorage({ yjs_state: malformed, blog_id: 'blog-1' });
  const room = new CollabDurableObject(fakeCtx(storage), { DB: fakeDb() });
  destroyRoom(t, room);

  await assert.rejects(room.alarm());
  assert.equal(storage.data.get('yjs_state'), malformed);
});
