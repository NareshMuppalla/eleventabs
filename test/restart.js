// Real restart test: browse, quit Chrome, start it again -> Welcome back opens and remembers the tabs.
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
const EXT = process.env.EXT || path.join(__dirname, '../extension');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'etr-'));
const launch = () => chromium.launchPersistentContext(dir, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
const stub = ctx => ctx.route(/^https?:\/\//, r => { const u = new URL(r.request().url()); return r.fulfill({ contentType: 'text/html', body: `<title>${u.hostname}${u.pathname}</title>` }); });
(async () => {
  let ctx = await launch(); await stub(ctx);
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  for (const u of ['https://github.com/me/repo', 'https://claude.ai/chat/1', 'https://www.linkedin.com/jobs/view/42', 'https://docs.google.com/document/d/abc']) { const p = await ctx.newPage(); await p.goto(u); }
  await sleep(6500); // auto-group + snapshot debounce
  const snap = await sw.evaluate(async () => (await chrome.storage.local.get('lastState')).lastState);
  ok(snap && snap.windows[0].tabs.length >= 4, 'snapshot saved while browsing');
  await ctx.close();
  ctx = await launch(); await stub(ctx);
  await sleep(3000);
  let [sw2] = ctx.serviceWorkers(); if (!sw2) sw2 = await ctx.waitForEvent('serviceworker');
  console.log('  after relaunch:', JSON.stringify(await sw2.evaluate(async () => { const x = await chrome.storage.local.get(null); return { keys: Object.keys(x), prev: !!x.previousSession, booted: (await chrome.storage.session.get('booted')).booted || null }; })));
  const pages = ctx.pages().map(p => p.url());
  ok(pages.some(u => u.endsWith('/start.html')), 'Welcome back opens when Chrome starts: ' + pages.join(', '));
  const start = ctx.pages().find(p => p.url().endsWith('/start.html'));
  if (start) {
    await sleep(1000);
    const txt = await start.textContent('#resume');
    ok(/4 tabs across 1 window/.test(txt) && /4 tabs from last time/.test(txt), 'remembers what was open last time: ' + txt.slice(0, 120).replace(/\s+/g, ' '));
    await start.click('#restore-all'); await sleep(3000);
    const open = await start.evaluate(async () => (await chrome.tabs.query({})).map(t => t.url).filter(u => u.startsWith('http')).length);
    ok(open === 4, 'one click restores all 4 tabs (' + open + ')');
  }
  await ctx.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
