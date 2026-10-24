-- Persist the blog cover image framing (drag-to-reposition + zoom).
ALTER TABLE blogs ADD COLUMN cover_pos_x REAL NOT NULL DEFAULT 50;
ALTER TABLE blogs ADD COLUMN cover_pos_y REAL NOT NULL DEFAULT 50;
ALTER TABLE blogs ADD COLUMN cover_zoom REAL NOT NULL DEFAULT 1;
