-- Elixpo Chat D1 Schema
-- Replaces Firebase Firestore collections

-- gen_stats: stores metadata pointers (replaces genStats collection)
CREATE TABLE IF NOT EXISTS gen_stats (
  key TEXT PRIMARY KEY,
  data TEXT NOT NULL
);

-- news: stores news items (replaces news collection)
CREATE TABLE IF NOT EXISTS news (
  id TEXT PRIMARY KEY,
  items TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- podcasts: stores podcast entries (replaces podcasts collection)
CREATE TABLE IF NOT EXISTS podcasts (
  id TEXT PRIMARY KEY,
  podcast_name TEXT NOT NULL,
  podcast_audio_url TEXT NOT NULL,
  topic_source TEXT,
  podcast_banner_url TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
