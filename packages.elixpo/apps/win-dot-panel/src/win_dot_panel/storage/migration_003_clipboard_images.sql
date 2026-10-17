ALTER TABLE clipboard_items ADD COLUMN image_content BLOB;
ALTER TABLE clipboard_items ADD COLUMN thumbnail_content BLOB;
UPDATE metadata SET value = '3' WHERE key = 'schema_version';
