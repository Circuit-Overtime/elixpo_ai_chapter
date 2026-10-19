-- Real-time collaboration support: editing locks + Yjs state persistence

-- Editing lock columns on blogs
ALTER TABLE blogs ADD COLUMN editing_by TEXT;          -- user ID currently editing
ALTER TABLE blogs ADD COLUMN editing_since INTEGER;    -- unix timestamp of lock acquisition

-- Persistent Yjs CRDT state for collaborative editing
CREATE TABLE IF NOT EXISTS blog_collab_state (
  blog_id TEXT PRIMARY KEY,
  yjs_state BLOB,             -- Y.encodeStateAsUpdate() binary
  updated_at INTEGER
);
