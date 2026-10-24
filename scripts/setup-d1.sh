#!/bin/bash

# Cloudflare D1 Setup Helper Script
# This script automates the D1 database setup process

set -e

echo "🚀 Elixpo Accounts - Cloudflare D1 Setup"
echo "=========================================="
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Installing..."
    npm install -D wrangler
fi

# Step 1: Check authentication
echo "📋 Step 1: Checking Cloudflare authentication..."
if ! wrangler whoami &> /dev/null; then
    echo "⚠️  Not authenticated. Please login to Cloudflare"
    wrangler login
fi

ACCOUNT_ID=$(wrangler whoami | grep "Account ID:" | awk '{print $3}' | tr -d '[]')
echo "✅ Authenticated as Account ID: $ACCOUNT_ID"
echo ""

# Step 2: Check if database exists
echo "📋 Step 2: Checking for existing databases..."
DB_LIST=$(wrangler d1 list | grep "elixpo_auth" || true)

if [ -z "$DB_LIST" ]; then
    echo "🏗️  Creating D1 database 'elixpo_auth'..."
    wrangler d1 create elixpo_auth
    
    # Extract DB ID from output
    DB_RESPONSE=$(wrangler d1 info elixpo_auth 2>&1)
    DB_ID=$(echo "$DB_RESPONSE" | grep -i "database id:" | awk '{print $4}' | head -1)
    
    if [ -z "$DB_ID" ]; then
        echo "❌ Failed to create database. Please check your Cloudflare account."
        exit 1
    fi
else
    echo "✅ Database 'elixpo_auth' already exists"
    DB_ID=$(wrangler d1 info elixpo_auth | grep -i "database id:" | awk '{print $4}' | head -1)
fi

echo ""
echo "Database ID: $DB_ID"
echo ""

# Step 3: Update wrangler.toml
echo "📝 Step 3: Updating wrangler.toml..."
if grep -q "database_id = \"your-d1-id-here\"" wrangler.toml; then
    sed -i "s/database_id = \"your-d1-id-here\"/database_id = \"$DB_ID\"/g" wrangler.toml
    echo "✅ Updated database_id in wrangler.toml"
else
    echo "ℹ️  wrangler.toml already configured"
fi

echo ""

# Step 4: Apply migrations
echo "📋 Step 4: Applying migrations..."
if [ -f "src/workers/migrations/0001_init_schema.sql" ]; then
    echo "🔄 Applying schema migration to remote database..."
    wrangler d1 execute elixpo_auth --remote < src/workers/migrations/0001_init_schema.sql
    echo "✅ Migration applied successfully"
else
    echo "⚠️  Migration file not found at src/workers/migrations/0001_init_schema.sql"
fi

echo ""

# Step 5: Verify database
echo "📋 Step 5: Verifying database..."
TABLES=$(wrangler d1 execute elixpo_auth "SELECT name FROM sqlite_master WHERE type='table';" --remote 2>&1 | grep -c "users" || true)

if [ "$TABLES" -gt 0 ]; then
    echo "✅ Database tables created successfully"
    echo ""
    echo "📊 Tables in database:"
    wrangler d1 execute elixpo_auth "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;" --remote
else
    echo "⚠️  Could not verify tables. Running manual check..."
    wrangler d1 info elixpo_auth
fi

echo ""

# Step 6: Environment setup
echo "📝 Step 6: Environment configuration..."
if [ ! -f ".env.local" ]; then
    echo "📋 Creating .env.local from template..."
    cp .env.example .env.local
    
    # Update with actual values
    sed -i "s/your-account-id-here/$ACCOUNT_ID/g" .env.local
    sed -i "s/your-d1-database-id-here/$DB_ID/g" .env.local
    
    echo "✅ Created .env.local with your credentials"
    echo "⚠️  Please update the remaining values in .env.local:"
    echo "   - JWT_SECRET"
    echo "   - OAuth credentials (Google, GitHub)"
    echo "   - Email configuration (SMTP)"
else
    echo "ℹ️  .env.local already exists"
fi

echo ""
echo "========================================"
echo "✅ D1 Setup Complete!"
echo "========================================"
echo ""
echo "🎯 Next Steps:"
echo "1. Update .env.local with your configuration"
echo "2. Run 'npm run dev' to start development server"
echo "3. Test database connection at http://localhost:3000/api/test-db"
echo ""
echo "📚 Useful Commands:"
echo "   npm run db:info        - View database information"
echo "   npm run db:tables      - List all tables"
echo "   npm run db:query       - Execute a query"
echo "   npm run db:query:remote- Execute a remote query"
echo ""
echo "📖 Full documentation: See D1_SETUP.md"
echo ""
