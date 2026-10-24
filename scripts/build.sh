#!/bin/sh
# Builds site/tab-butler.zip containing a "tab-butler" folder with the extension.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
cp -R "$ROOT/extension" "$TMP/tab-butler"
rm -f "$ROOT/site/tab-butler.zip"
(cd "$TMP" && zip -qr "$ROOT/site/tab-butler.zip" tab-butler -x '*.DS_Store')
rm -rf "$TMP"
echo "built $ROOT/site/tab-butler.zip ($(du -h "$ROOT/site/tab-butler.zip" | cut -f1))"
