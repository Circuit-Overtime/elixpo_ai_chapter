-- Add role column to blog_co_authors (viewer / editor / admin)
ALTER TABLE blog_co_authors ADD COLUMN role TEXT NOT NULL DEFAULT 'editor';
