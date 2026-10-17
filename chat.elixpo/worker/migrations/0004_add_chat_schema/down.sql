-- Rollback: drop chat schema tables
DROP TABLE IF EXISTS conversation_pins;
DROP TABLE IF EXISTS image_generations;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS users;
