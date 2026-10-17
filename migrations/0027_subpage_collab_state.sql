-- Persisted Yjs CRDT state per sub-page, mirroring blog_collab_state for the
-- main blog (#11 D). Snapshotted by the collab Durable Object on last-disconnect.
CREATE TABLE IF NOT EXISTS subpage_collab_state (
  subpage_id TEXT PRIMARY KEY,
  yjs_state BLOB,
  updated_at INTEGER
);
