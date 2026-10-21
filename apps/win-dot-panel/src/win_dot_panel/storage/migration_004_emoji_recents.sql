UPDATE emoji_usage
SET last_used_at = last_used_at * 1000000000
WHERE last_used_at IS NOT NULL AND last_used_at < 100000000000;

DROP INDEX idx_emoji_usage_recent;
CREATE INDEX idx_emoji_usage_recent
    ON emoji_usage(last_used_at DESC, use_count DESC, emoji_id DESC);

UPDATE metadata SET value = '4' WHERE key = 'schema_version';
