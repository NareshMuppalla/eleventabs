# Tab Butler

A free, private Chrome extension that keeps your browser tidy.

- **Auto tab groups.** New tabs go into colour groups: Mail & Chat, Work & Docs, Dev, AI, Jobs, Social, Video & Music, Shopping, Money, News. Groups you make yourself are left alone.
- **Sleep idle tabs.** Tabs you haven't opened for 30 minutes are put to sleep to free memory. You can list sites that should never sleep.
- **Close duplicates.** Do it with one click, or have Tab Butler stop a duplicate from opening at all.
- **Sessions.** Save a window, close it, and restore it later with its groups.
- **Bookmark tidy-up.** Builds a sorted *copy* of your bookmarks by category and counts duplicates. It also exports a backup HTML you can import again. Your original bookmarks are never moved or deleted.
- **Dashboard.** Shows time per category and per site, daily charts, your most-visited sites, and a junk-history clean-up (login pages, redirects, OTP pages).
- **Fully configurable.** You can edit categories, colours, site patterns and their order, and export or import your settings.

Everything is stored in `chrome.storage.local`. There's no server, no analytics and no network calls, except Google's favicon service for the small site icons.

## Install (unpacked)

1. Download `tab-butler.zip` from the website, or use the `extension/` folder from this repo.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the folder.

## Develop

```
cd test && NODE_ENV=development npm i --include=dev
node e2e.js          # loads the extension in Chromium and tests every feature
node site-shots.js   # regenerates website screenshots
node make-icons.js   # regenerates icons
../scripts/build.sh  # builds site/tab-butler.zip
```

## Layout

- `extension/` holds the MV3 extension: `background.js` (service worker), `popup.*`, `dashboard.*`, and `lib/config.js` (categories and matching).
- `site/` is the static landing page, deployed on Vercel.
- `test/` contains the Playwright end-to-end tests and the screenshot scripts.

MIT licensed.
