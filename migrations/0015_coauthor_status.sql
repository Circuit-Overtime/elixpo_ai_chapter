-- Track invite status for blog co-authors
ALTER TABLE blog_co_authors ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
