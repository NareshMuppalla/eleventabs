# ElevenTabs

By YourElevens. Formerly "Tab Butler".

A free, private Chrome extension: pick up where you left off, sorted tab groups, sleeping tabs and a theme engine.

- **Auto tab groups.** New tabs go into colour groups: Mail & Chat, Work & Docs, Dev, AI, Jobs, Social, Video & Music, Shopping, Money, News. Groups you make yourself are left alone.
- **Sleep idle tabs.** Tabs you haven't opened for 30 minutes are put to sleep to free memory. You can list sites that should never sleep.
- **Close duplicates.** Do it with one click, or have Tab Butler stop a duplicate from opening at all.
- **Sessions.** Save a window, close it, and restore it later with its groups.
- **Bookmark tidy-up.** Builds a sorted *copy* of your bookmarks by category and counts duplicates. It also exports a backup HTML you can import again. Your original bookmarks are never moved or deleted.
- **Dashboard.** Shows time per category and per site, daily charts, your most-visited sites, and a junk-history clean-up (login pages, redirects, OTP pages).
- **Fully configurable.** You can edit categories, colours, site patterns and their order, and export or import your settings.

## Security model (safe for work profiles)

- **No network:** the extension-page CSP sets `connect-src 'none'`, so Chrome blocks every request, and `test/e2e.js` checks this. Icons come from Chrome's local `_favicon` cache, and fonts and icons are bundled.
- **Can't read pages:** there are no `host_permissions`, no content scripts, no `externally_connectable` and no web-accessible resources.
- **Minimal install-time permissions:** `tabs`, `tabGroups`, `storage`, `alarms`, `idle` and `favicon`. `history` and `bookmarks` are *optional* and only requested when you use those features. You can turn them off again under Privacy & security.
- **Messages accepted only from the extension's own pages**, after checking the sender id and URL. Imported settings are schema-validated, and every title or URL is HTML-escaped before rendering.
- **Private sites list:** listed sites are never timed or shown. Stats store only site name and seconds, never titles or full URLs.
- **Profile-isolated and `incognito: not_allowed`.**

Everything is stored in `chrome.storage.local` inside the current Chrome profile.

## Install (unpacked)

1. Download `eleventabs-latest.zip` (or a specific `downloads/eleventabs-vX.Y.Z.zip`) from the website, or use the `extension/` folder from this repo.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the folder.

## Develop

```
cd test && NODE_ENV=development npm i --include=dev
node e2e.js          # loads the extension in Chromium and tests every feature
node gate.js         # real build: optional-permission gates, minimal manifest, web pages can't message it
node make-icon-set.js # regenerates lib/icons.js from lucide-static
node site-shots.js   # regenerates website screenshots
node make-icons.js   # regenerates icons
../scripts/build.sh  # builds site/downloads/eleventabs-v<version>.zip + latest + version.json
```

## Layout

- `extension/` holds the MV3 extension: `background.js` (service worker), `popup.*`, `dashboard.*`, and `lib/config.js` (categories and matching).
- `site/` is the static landing page, deployed on Vercel.
- `test/` contains the Playwright end-to-end tests and the screenshot scripts.

MIT licensed.

## Releasing a new version

1. Bump `version` (and `version_name`) in `extension/manifest.json`, using semver: patch = fixes, minor = features, major = big changes.
2. Add an entry at the top of `extension/lib/changelog.js`. The build fails if it doesn't match the manifest.
3. Run `scripts/build.sh` to create `site/downloads/eleventabs-vX.Y.Z.zip`, `eleventabs-latest.zip`, `version.json` and `changelog.json`.
4. Run the tests: `node test/e2e.js && node test/gate.js && node test/restart.js`.
5. Commit and push, then `cd site && vercel deploy --prod`.

Users see their version in the popup footer, on the Welcome back page and under Dashboard → What's new. The What's new page opens automatically after a minor or major update.
