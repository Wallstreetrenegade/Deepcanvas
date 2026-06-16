#!/bin/sh
set -e

# Generate URL Replacement Manifest
# This script runs at BUILD TIME to create a list of files that contain placeholder URLs
# This eliminates the need to scan all files at container startup

APP_NAME=$1
APP_DIR=$2

if [ -z "$APP_NAME" ] || [ -z "$APP_DIR" ]; then
  echo "Usage: $0 <app_name> <app_dir>"
  echo "Example: $0 web /app/apps/web"
  exit 1
fi

echo "🔍 Generating URL manifest for $APP_NAME..."

# Define placeholder URLs that will be replaced at runtime
PLACEHOLDER_API="https://next-api.useplunk.com"
PLACEHOLDER_DASHBOARD="https://next-app.useplunk.com"
PLACEHOLDER_LANDING="https://www.useplunk.com"
PLACEHOLDER_WIKI="https://docs.useplunk.com"

# Output manifest file
MANIFEST_FILE="$APP_DIR/.next/url-manifest.txt"

# At build time, Next.js creates:
# - .next/static/* - Static assets (copied separately to standalone in Dockerfile)
# - .next/standalone/apps/<app>/.next/* - Server files
# 
# We need to scan BOTH and store paths relative to where they'll be at runtime:
# Runtime location: /app/apps/<app>/.next/standalone/apps/<app>/

# Clear manifest file
> "$MANIFEST_FILE"

# 1. Scan static assets (these will be copied to standalone/.next/static at runtime)
if [ -d "$APP_DIR/.next/static" ]; then
  echo "   Scanning .next/static directory..."
  find "$APP_DIR/.next/static" -type f \( -name "*.js" -o -name "*.json" -o -name "*.html" \) \
    -exec grep -l -E "$PLACEHOLDER_API|$PLACEHOLDER_DASHBOARD|$PLACEHOLDER_LANDING|$PLACEHOLDER_WIKI" {} \; \
    2>/dev/null | sed "s|$APP_DIR/||g" >> "$MANIFEST_FILE" || true
fi

# 2. Scan standalone server files  
STANDALONE_DIR="$APP_DIR/.next/standalone/apps/$APP_NAME"
if [ -d "$STANDALONE_DIR/.next" ]; then
  echo "   Scanning standalone directory..."
  find "$STANDALONE_DIR/.next" -type f \( -name "*.js" -o -name "*.json" -o -name "*.html" -o -name "*.rsc" \) \
    -exec grep -l -E "$PLACEHOLDER_API|$PLACEHOLDER_DASHBOARD|$PLACEHOLDER_LANDING|$PLACEHOLDER_WIKI" {} \; \
    2>/dev/null | sed "s|$STANDALONE_DIR/||g" >> "$MANIFEST_FILE" || true
fi

# Count files
FILE_COUNT=$(wc -l < "$MANIFEST_FILE" | tr -d ' ')

echo "✅ Generated manifest for $APP_NAME: $FILE_COUNT files need URL replacement"
echo "   Manifest saved to: $MANIFEST_FILE"

# Also generate manifest for sitemap/robots files in standalone public directory
SITEMAP_MANIFEST_FILE="$APP_DIR/.next/sitemap-manifest.txt"

# Scan public directory (will be copied to standalone/public at runtime)
if [ -d "$APP_DIR/public" ]; then
  find "$APP_DIR/public" -type f \( -name "sitemap*.xml" -o -name "robots.txt" \) \
    2>/dev/null | sed "s|$APP_DIR/||g" > "$SITEMAP_MANIFEST_FILE" || true
else
  > "$SITEMAP_MANIFEST_FILE"
fi

SITEMAP_COUNT=$(wc -l < "$SITEMAP_MANIFEST_FILE" | tr -d ' ')
echo "✅ Generated sitemap manifest for $APP_NAME: $SITEMAP_COUNT files"

exit 0
