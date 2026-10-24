#!/bin/bash

# Script to set up Cloudflare Secrets
# Usage: ./scripts/setup-secrets.sh

set -e

echo "🔐 Setting up Cloudflare Secrets..."

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ wrangler not found. Install it with: npm install -g wrangler"
    exit 1
fi

# Read from .env.local and set secrets
echo "Setting JWT_SECRET..."
JWT_SECRET=$(grep '^JWT_SECRET=' .env.local | cut -d'=' -f2)
echo "$JWT_SECRET" | wrangler secret put JWT_SECRET

echo "Setting GOOGLE_CLIENT_SECRET..."
GOOGLE_SECRET=$(grep '^GOOGLE_CLIENT_SECRET=' .env.local | cut -d'=' -f2)
[ -n "$GOOGLE_SECRET" ] && echo "$GOOGLE_SECRET" | wrangler secret put GOOGLE_CLIENT_SECRET

echo "Setting GITHUB_CLIENT_SECRET..."
GITHUB_SECRET=$(grep '^GITHUB_CLIENT_SECRET=' .env.local | cut -d'=' -f2)
[ -n "$GITHUB_SECRET" ] && echo "$GITHUB_SECRET" | wrangler secret put GITHUB_CLIENT_SECRET

echo "✅ Secrets configured!"
