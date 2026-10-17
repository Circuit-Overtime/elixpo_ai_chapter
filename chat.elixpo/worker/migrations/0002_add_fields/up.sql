-- Add thumbnail_url and music_url to podcasts
ALTER TABLE podcasts ADD COLUMN podcast_thumbnail_url TEXT;
ALTER TABLE podcasts ADD COLUMN podcast_music_url TEXT;
