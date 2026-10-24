#!/bin/sh
# Builds versioned downloads for the website:
#   site/downloads/eleventabs-v<version>.zip   (kept for every release)
#   site/eleventabs-latest.zip                 (always the newest)
#   site/version.json, site/changelog.json     (read by the website)
# Every zip contains one folder called "eleventabs", so updating = replace the folder + reload.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VER="$(node -p "require('$ROOT/extension/manifest.json').version")"
TMP="$(mktemp -d)"
cp -R "$ROOT/extension" "$TMP/eleventabs"
mkdir -p "$ROOT/site/downloads"
OUT="$ROOT/site/downloads/eleventabs-v$VER.zip"
rm -f "$OUT"
(cd "$TMP" && zip -qr "$OUT" eleventabs -x '*.DS_Store')
cp "$OUT" "$ROOT/site/eleventabs-latest.zip"
rm -rf "$TMP"
node --input-type=module -e "
import { CHANGELOG } from '$ROOT/extension/lib/changelog.js';
import fs from 'fs';
if (CHANGELOG[0].version !== '$VER') { console.error('changelog top entry (' + CHANGELOG[0].version + ') does not match manifest version $VER'); process.exit(1); }
const files = fs.readdirSync('$ROOT/site/downloads').filter(f => f.endsWith('.zip'));
const rel = CHANGELOG.map(r => ({ ...r, file: files.includes('eleventabs-v' + r.version + '.zip') ? '/downloads/eleventabs-v' + r.version + '.zip' : null }));
fs.writeFileSync('$ROOT/site/changelog.json', JSON.stringify(rel, null, 2));
fs.writeFileSync('$ROOT/site/version.json', JSON.stringify({ name: 'ElevenTabs', version: '$VER', date: CHANGELOG[0].date, download: '/downloads/eleventabs-v$VER.zip', latest: '/eleventabs-latest.zip' }, null, 2));
"
echo "built ElevenTabs v$VER -> $OUT ($(du -h "$OUT" | cut -f1))"
