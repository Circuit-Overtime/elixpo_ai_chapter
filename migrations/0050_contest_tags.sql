-- Public discovery tags are separate from topics required on submitted blogs.
ALTER TABLE contests ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
