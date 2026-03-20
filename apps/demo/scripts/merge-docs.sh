#!/bin/bash
# Merge VitePress docs output into the Nitro static directory.
# Nitro outputs to .vercel/output/static on Vercel, .output/public locally.
set -euo pipefail

DOCS_DIST="../docs/.vitepress/dist"

if [ -d ".vercel/output/static" ]; then
  STATIC=".vercel/output/static"
elif [ -d ".output/public" ]; then
  STATIC=".output/public"
else
  echo "Error: no static output directory found" >&2
  exit 1
fi

# Move demo client assets under /demo/ subdirectory
mkdir -p "$STATIC/demo"
if [ -d "$STATIC/assets" ]; then
  mv "$STATIC/assets" "$STATIC/demo/assets"
fi

# Copy VitePress docs to the static root
cp -r "$DOCS_DIST"/* "$STATIC/"

echo "Merged docs into $STATIC"
