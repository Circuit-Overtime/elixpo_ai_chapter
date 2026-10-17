#!/bin/bash

# Script to initialize Cloudflare D1 database
# Usage: ./scripts/init-db.sh

set -e

echo "🚀 Initializing Cloudflare D1 Database..."

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ wrangler not found. Install it with: npm install -g wrangler"
    exit 1
fi

# Read database name from wrangler.toml
DB_NAME=$(grep 'database_name' wrangler.toml | head -1 | cut -d'"' -f2)
echo "📦 Database: $DB_NAME"

# Execute schema
echo "📝 Executing schema..."
wrangler d1 execute $DB_NAME --file src/workers/schema.sql

echo "✅ Database initialized successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Update .env.local with your Cloudflare D1 database ID"
echo "2. Update OAuth provider credentials in .env.local"
echo "3. Update wrangler.toml with your Cloudflare IDs"
echo "4. Deploy: npm run deploy"
