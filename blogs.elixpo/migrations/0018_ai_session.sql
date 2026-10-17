-- Store lixsearch AI session ID per blog for persistent AI conversation context.
ALTER TABLE blogs ADD COLUMN ai_session_id TEXT;
