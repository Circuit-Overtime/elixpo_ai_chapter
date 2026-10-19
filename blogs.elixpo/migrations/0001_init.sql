-- Users (identity from Elixpo Accounts)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  bio TEXT,
  avatar_r2_key TEXT,
  banner_r2_key TEXT,
  owned_org_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Organizations
CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  logo_r2_key TEXT,
  banner_r2_key TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id),
  visibility TEXT NOT NULL DEFAULT 'public',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Org members
CREATE TABLE IF NOT EXISTS org_members (
  org_id TEXT NOT NULL REFERENCES orgs(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member',
  joined_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (org_id, user_id)
);

-- Blogs
CREATE TABLE IF NOT EXISTS blogs (
  id TEXT PRIMARY KEY,
  slugid TEXT,
  slug TEXT NOT NULL,
  title TEXT,
  subtitle TEXT,
  page_emoji TEXT,
  content TEXT,
  cover_image_r2_key TEXT,
  author_id TEXT NOT NULL REFERENCES users(id),
  published_as TEXT NOT NULL DEFAULT 'personal',
  status TEXT NOT NULL DEFAULT 'draft',
  read_time_minutes INTEGER DEFAULT 0,
  allow_comments INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  published_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_blogs_author ON blogs(author_id);
CREATE INDEX IF NOT EXISTS idx_blogs_slug ON blogs(slug);
CREATE INDEX IF NOT EXISTS idx_blogs_status ON blogs(status);

-- Blog co-authors
CREATE TABLE IF NOT EXISTS blog_co_authors (
  blog_id TEXT NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  added_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (blog_id, user_id)
);

-- Blog tags
CREATE TABLE IF NOT EXISTS blog_tags (
  blog_id TEXT NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (blog_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_blog_tags_tag ON blog_tags(tag);

-- Comments
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  blog_id TEXT NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  parent_id TEXT REFERENCES comments(id),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_comments_blog ON comments(blog_id);

-- Likes
CREATE TABLE IF NOT EXISTS likes (
  blog_id TEXT NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (blog_id, user_id)
);

-- Bookmarks
CREATE TABLE IF NOT EXISTS bookmarks (
  user_id TEXT NOT NULL REFERENCES users(id),
  blog_id TEXT NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  collection TEXT NOT NULL DEFAULT 'default',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, blog_id)
);

-- Follows
CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL REFERENCES users(id),
  following_id TEXT NOT NULL,
  following_type TEXT NOT NULL DEFAULT 'user',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (follower_id, following_id, following_type)
);

-- Read history
CREATE TABLE IF NOT EXISTS read_history (
  user_id TEXT NOT NULL REFERENCES users(id),
  blog_id TEXT NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  read_at INTEGER NOT NULL DEFAULT (unixepoch()),
  read_progress REAL NOT NULL DEFAULT 0.0,
  PRIMARY KEY (user_id, blog_id)
);
