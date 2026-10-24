-- Migration 0009: Add bio column to users table
ALTER TABLE users ADD COLUMN bio TEXT;
