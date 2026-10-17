CREATE TABLE metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT INTO metadata (key, value) VALUES ('schema_version', '1');

CREATE TABLE clipboard_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_type TEXT NOT NULL DEFAULT 'text',
    text_content TEXT NOT NULL,
    content_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL,
    use_count INTEGER NOT NULL DEFAULT 1,
    is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1))
);

CREATE INDEX idx_clipboard_last_used ON clipboard_items(last_used_at DESC);
CREATE INDEX idx_clipboard_pinned_last_used
    ON clipboard_items(is_pinned DESC, last_used_at DESC);

CREATE TABLE emoji (
    id INTEGER PRIMARY KEY,
    emoji TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT,
    subcategory TEXT,
    keywords TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE emoji_usage (
    emoji_id INTEGER PRIMARY KEY,
    use_count INTEGER NOT NULL DEFAULT 0,
    last_used_at INTEGER,
    FOREIGN KEY (emoji_id) REFERENCES emoji(id) ON DELETE CASCADE
);

CREATE INDEX idx_emoji_usage_recent ON emoji_usage(last_used_at DESC);

CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
