#!/bin/bash
# Fetches only the needed WPT (Web Platform Tests) directories using git sparse checkout.
# This avoids cloning the entire WPT repository (~50GB+).

set -e

WPT_DIR="wpt"
WPT_REPO="https://github.com/web-platform-tests/wpt.git"

if [ -d "$WPT_DIR" ]; then
  echo "WPT directory already exists. Updating..."
  cd "$WPT_DIR"
  git pull --depth=1
  cd ..
else
  echo "Cloning WPT with sparse checkout (only needed directories)..."
  git clone --filter=blob:none --sparse --depth=1 "$WPT_REPO" "$WPT_DIR"
  cd "$WPT_DIR"
  git sparse-checkout set \
    file-system-access/script-tests \
    file-system-access/resources \
    fs/script-tests \
    fs/resources \
    streams/resources \
    resources
  cd ..
fi

echo "WPT tests fetched successfully."
echo "Files available:"
find "$WPT_DIR/fs/script-tests" -name "*.js" 2>/dev/null | head -20
find "$WPT_DIR/file-system-access/script-tests" -name "*.js" 2>/dev/null | head -20
