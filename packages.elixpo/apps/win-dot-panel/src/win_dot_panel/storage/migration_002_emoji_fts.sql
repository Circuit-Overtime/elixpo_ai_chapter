CREATE VIRTUAL TABLE emoji_search USING fts5(
    emoji,
    name,
    keywords,
    content = 'emoji',
    content_rowid = 'id'
);

CREATE TRIGGER emoji_after_insert AFTER INSERT ON emoji BEGIN
    INSERT INTO emoji_search(rowid, emoji, name, keywords)
    VALUES (new.id, new.emoji, new.name, new.keywords);
END;

CREATE TRIGGER emoji_after_delete AFTER DELETE ON emoji BEGIN
    INSERT INTO emoji_search(emoji_search, rowid, emoji, name, keywords)
    VALUES ('delete', old.id, old.emoji, old.name, old.keywords);
END;

CREATE TRIGGER emoji_after_update AFTER UPDATE ON emoji BEGIN
    INSERT INTO emoji_search(emoji_search, rowid, emoji, name, keywords)
    VALUES ('delete', old.id, old.emoji, old.name, old.keywords);
    INSERT INTO emoji_search(rowid, emoji, name, keywords)
    VALUES (new.id, new.emoji, new.name, new.keywords);
END;

INSERT INTO emoji_search(emoji_search) VALUES ('rebuild');
UPDATE metadata SET value = '2' WHERE key = 'schema_version';
