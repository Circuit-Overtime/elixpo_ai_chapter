-- mail.elixpo — per-template email background colour.
--
-- The rendered email wraps the content in a light "canvas" behind a white card
-- (so it reads like a real inbox). That canvas colour was hard-coded; make it a
-- per-template setting so users control exactly how the email looks in the
-- recipient's inbox. NULL → the default (#f4f4f7).

ALTER TABLE templates ADD COLUMN bg_color TEXT;
