-- Co-authors choose whether an accepted co-authored post shows on their profile
-- (cross-post). Default 1 = visible, matching prior behavior.
ALTER TABLE blog_co_authors ADD COLUMN show_on_profile INTEGER NOT NULL DEFAULT 1;
