// Checks the real build (optional permissions NOT granted): gates show, core works, manifest is minimal.
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
const EXT = process.env.EXT || path.join(__dirname, '../extension');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const m = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json')));
  ok(!m.host_permissions && !m.content_scripts && !m.externally_connectable && !m.web_accessible_resources, 'no host access, content scripts, external messaging or web-accessible files');
  ok(!m.permissions.includes('history') && !m.permissions.includes('bookmarks'), 'history/bookmarks are optional, not install-time');
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'tbg-')), { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  const errors = []; ctx.on('weberror', e => (e.page()?.url() || '').startsWith('chrome-extension://') && errors.push(String(e.error())));
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = sw.url().split('/')[2];
  const d = await ctx.newPage();
  await d.goto(`chrome-extension://${id}/dashboard.html#history`); await sleep(800);
  ok((await d.textContent('#h-gate')).includes('Allow history access'), 'history page asks for permission first');
  await d.goto(`chrome-extension://${id}/dashboard.html#bookmarks`); await sleep(800);
  ok((await d.textContent('#b-gate')).includes('Allow bookmarks access'), 'bookmarks page asks for permission first');
  await d.goto(`chrome-extension://${id}/dashboard.html#overview`); await sleep(1200);
  ok((await d.textContent('#o-visits')).includes('Allow history access'), 'overview shows history gate');
  await d.goto(`chrome-extension://${id}/dashboard.html#privacy`); await sleep(800);
  ok((await d.textContent('#p-history')).includes('Allow'), 'privacy page shows history not granted');
  // a normal web page cannot message the extension
  await ctx.route(/^https?:\/\//, r => r.fulfill({ contentType: 'text/html', body: '<title>x</title>' }));
  const w = await ctx.newPage(); await w.goto('https://evil.test/');
  const reach = await w.evaluate((id) => { try { return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage ? 'api-present' : 'no-api'; } catch { return 'no-api'; } }, id);
  ok(reach === 'no-api', 'web pages have no way to message Tab Butler: ' + reach);
  ok(errors.length === 0, 'no page errors ' + errors.join(' | '));
  await ctx.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
