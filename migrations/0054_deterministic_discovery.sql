-- Explicit discovery metadata keeps recommendation behavior explainable and
-- independent of content parsing. Existing content remains globally eligible.
ALTER TABLE blogs ADD COLUMN language TEXT NOT NULL DEFAULT 'und';
ALTER TABLE blogs ADD COLUMN region TEXT NOT NULL DEFAULT 'global';
ALTER TABLE contests ADD COLUMN language TEXT NOT NULL DEFAULT 'und';
ALTER TABLE contests ADD COLUMN region TEXT NOT NULL DEFAULT 'global';

-- Use the author's account locale as the safest available backfill. A missing
-- country never excludes a story: "global" is a neutral ranking value.
UPDATE blogs
SET language = COALESCE((
  SELECT NULLIF(LOWER(SUBSTR(REPLACE(u.locale, '_', '-'), 1,
    CASE
      WHEN INSTR(REPLACE(u.locale, '_', '-'), '-') > 0
      THEN INSTR(REPLACE(u.locale, '_', '-'), '-') - 1
      ELSE LENGTH(REPLACE(u.locale, '_', '-'))
    END)), '')
  FROM users u WHERE u.id = blogs.author_id
), 'und')
WHERE language = 'und';

UPDATE contests
SET language = COALESCE((
  SELECT NULLIF(LOWER(SUBSTR(REPLACE(u.locale, '_', '-'), 1,
    CASE
      WHEN INSTR(REPLACE(u.locale, '_', '-'), '-') > 0
      THEN INSTR(REPLACE(u.locale, '_', '-'), '-') - 1
      ELSE LENGTH(REPLACE(u.locale, '_', '-'))
    END)), '')
  FROM users u WHERE u.id = contests.organizer_id
), 'und')
WHERE language = 'und';

CREATE INDEX IF NOT EXISTS idx_blogs_discovery_language
  ON blogs(status, language, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blogs_discovery_region
  ON blogs(status, region, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_contests_discovery_language
  ON contests(status, language, starts_at);
CREATE INDEX IF NOT EXISTS idx_contests_discovery_region
  ON contests(status, region, starts_at);
