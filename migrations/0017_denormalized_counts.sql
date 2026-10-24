-- Denormalized interaction counts on blogs table.
-- Eliminates correlated COUNT subqueries in feed/trending queries.
ALTER TABLE blogs ADD COLUMN like_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE blogs ADD COLUMN clap_total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE blogs ADD COLUMN comment_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE blogs ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;

-- Backfill from existing data
UPDATE blogs SET like_count = (SELECT COUNT(*) FROM likes WHERE blog_id = blogs.id);
UPDATE blogs SET comment_count = (SELECT COUNT(*) FROM comments WHERE blog_id = blogs.id);
UPDATE blogs SET view_count = (SELECT COUNT(*) FROM blog_views WHERE blog_id = blogs.id);
UPDATE blogs SET clap_total = (SELECT COALESCE(SUM(count), 0) FROM claps WHERE blog_id = blogs.id);

-- Composite indexes for feed queries
CREATE INDEX IF NOT EXISTS idx_blogs_feed ON blogs(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blogs_org_feed ON blogs(published_as, status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id, following_type, following_id);
