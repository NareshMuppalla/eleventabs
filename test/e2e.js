// End-to-end test: loads the unpacked extension in Chromium and exercises every feature.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const EXT = process.env.EXT || path.join(__dirname, '../extension');
const OUT = path.join(__dirname, 'shots'); fs.mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const userDir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'tb-'));
  const ctx = await chromium.launchPersistentContext(userDir, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  // Serve fake pages for any site so the test is fast and offline.
  await ctx.route(/^https?:\/\//, r => {
    const u = new URL(r.request().url());
    if (u.hostname.includes('google.com') && u.pathname.includes('favicons')) return r.fulfill({ status: 204 });
    return r.fulfill({ contentType: 'text/html', body: `<title>${u.hostname}${u.pathname}</title><h1>${u.href}</h1>` });
  });
  const errors = [];
  ctx.on('weberror', e => (e.page()?.url() || '').startsWith('chrome-extension://') && errors.push((e.page()?.url() || '?') + ' ' + String(e.error())));
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = sw.url().split('/')[2];
  ok(!!id, 'extension loaded, id ' + id);
  await sleep(1500);
  // welcome page opened on install
  ok(ctx.pages().some(p => p.url().includes('dashboard.html#welcome')), 'welcome page opens on install');

  const urls = ['https://github.com/a', 'https://github.com/b', 'https://www.youtube.com/watch?v=1', 'https://claude.ai/new', 'https://www.linkedin.com/jobs/view/1', 'https://www.linkedin.com/feed', 'https://example.com/', 'https://github.com/a#readme', 'https://mail.google.com/mail/u/0', 'https://site.test/login?next=/', 'https://www.amazon.in/dp/x'];
  for (const u of urls) { const p = await ctx.newPage(); await p.goto(u); }
  await sleep(2500); // auto-group debounce

  const groups = await sw.evaluate(async () => (await chrome.tabGroups.query({})).map(g => g.title + ':' + g.color));
  console.log('  auto groups:', groups.join(', '));
  ok(groups.includes('Dev:grey') && groups.includes('AI:purple') && groups.includes('Jobs:green') && groups.includes('Social:pink'), 'auto-grouping creates category groups (incl. linkedin.com/jobs → Jobs, linkedin feed → Social)');
  const tabInfo = await sw.evaluate(async () => { const tabs = await chrome.tabs.query({}); const gs = await chrome.tabGroups.query({}); const m = Object.fromEntries(gs.map(g => [g.id, g.title])); return tabs.map(t => [t.url, m[t.groupId] || null]); });
  ok(tabInfo.find(t => t[0].startsWith('https://example.com'))[1] === null, 'unmatched site stays loose');

  // user-made group must be left alone
  await sw.evaluate(async () => { const [t] = await chrome.tabs.query({ url: 'https://www.amazon.in/*' }); await chrome.tabs.ungroup(t.id).catch(()=>{}); const g = await chrome.tabs.group({ tabIds: [t.id] }); await chrome.tabGroups.update(g, { title: 'My stuff', color: 'blue' }); });

  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await sleep(600);
  const dupesShown = await popup.textContent('#s-dupes');
  ok(dupesShown === '1', 'popup shows 1 duplicate (github.com/a and #readme), got ' + dupesShown);
  await popup.click('#group'); await sleep(1200);
  ok((await popup.textContent('#toast')).startsWith('Sorted'), 'Sort button: ' + await popup.textContent('#toast'));
  const amazon = await sw.evaluate(async () => { const [t] = await chrome.tabs.query({ url: 'https://www.amazon.in/*' }); return (await chrome.tabGroups.get(t.groupId)).title; });
  ok(amazon === 'My stuff', 'user-created group left untouched by Sort');
  const order = await sw.evaluate(async () => { const w = await chrome.windows.getLastFocused(); const tabs = await chrome.tabs.query({ windowId: w.id }); const gs = Object.fromEntries((await chrome.tabGroups.query({ windowId: w.id })).map(g => [g.id, g.title])); const seq = []; for (const t of tabs) { const n = gs[t.groupId]; if (n && seq[seq.length - 1] !== n) seq.push(n); } return seq; });
  console.log('  group order:', order.join(' > '));
  ok(order.indexOf('Mail & Chat') < order.indexOf('Dev') && order.indexOf('Dev') < order.indexOf('AI'), 'groups ordered as in settings');

  await popup.click('#dupes'); await sleep(800);
  ok((await popup.textContent('#toast')).includes('Closed 1 duplicate'), 'Close duplicates: ' + await popup.textContent('#toast'));

  await popup.click('#sleep'); await sleep(1500);
  const slept = await sw.evaluate(async () => (await chrome.tabs.query({ discarded: true })).map(t => t.url));
  ok(slept.length >= 5, `Sleep: ${slept.length} tabs discarded`);
  ok(!slept.some(u => u.includes('mail.google.com')), 'never-sleep list respected (Gmail awake)');

  await popup.fill('#sess-name', 'Test session');
  await popup.click('#save');
  await popup.waitForFunction(() => document.querySelector('#toast').textContent.startsWith('Saved') || document.querySelector('#toast').textContent.startsWith('No web'), null, { timeout: 8000 }).catch(() => {});
  console.log('  sessions stored:', await sw.evaluate(async () => ((await chrome.storage.local.get('sessions')).sessions || []).map(s => s.name + ':' + s.tabs.length).join(',')));
  ok((await popup.textContent('#toast')).startsWith('Saved'), 'Save session: ' + await popup.textContent('#toast'));

  // Seed some time data + bookmarks
  await sw.evaluate(async () => {
    const d = new Date().toISOString().slice(0, 10);
    const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    await chrome.storage.local.set({ time: { [d]: { 'github.com': 3600, 'claude.ai': 1800, 'youtube.com': 900, 'mail.google.com': 1200 }, [y]: { 'linkedin.com': 2400, 'naukri.com': 1500, 'github.com': 600 } } });
    const f = await chrome.bookmarks.create({ parentId: '1', title: 'Random' });
    for (const u of ['https://github.com/x', 'https://github.com/x', 'https://chatgpt.com/', 'https://naukri.com/', 'https://unknown.example/']) await chrome.bookmarks.create({ parentId: f.id, title: u, url: u });
  });

  const dash = await ctx.newPage();
  dash.on('dialog', d => d.accept());
  dash.on('pageerror', e => errors.push('dash: ' + e.message));
  await dash.setViewportSize({ width: 1280, height: 900 });
  await dash.goto(`chrome-extension://${id}/dashboard.html#overview`); await sleep(1500);
  ok((await dash.textContent('#o-cats')).includes('Dev'), 'overview: time by category renders');
  ok((await dash.textContent('#o-visits')).includes('github.com'), 'overview: most visited from history renders');
  await dash.screenshot({ path: path.join(OUT, 'overview.png'), fullPage: true });

  await dash.goto(`chrome-extension://${id}/dashboard.html#tabs`); await sleep(800);
  ok((await dash.textContent('#t-list')).includes('AI'), 'open tabs view lists categories');
  await dash.screenshot({ path: path.join(OUT, 'tabs.png'), fullPage: true });

  await dash.goto(`chrome-extension://${id}/dashboard.html#sessions`); await sleep(600);
  ok((await dash.textContent('#s-list')).includes('Test session'), 'sessions list shows saved session');
  const before = (await ctx.pages()).length;
  await dash.click('[data-restore]'); await sleep(2500);
  const restoredGroups = await sw.evaluate(async () => { const ws = await chrome.windows.getAll({ populate: true }); const w = ws.sort((a, b) => b.id - a.id)[0]; return { n: w.tabs.length, g: (await chrome.tabGroups.query({ windowId: w.id })).map(g => g.title) }; });
  ok(restoredGroups.n >= 8 && restoredGroups.g.includes('Dev'), `restore session reopens tabs with groups (${restoredGroups.n} tabs, groups ${restoredGroups.g.join(',')})`);

  await dash.goto(`chrome-extension://${id}/dashboard.html#bookmarks`); await sleep(800);
  ok((await dash.textContent('#b-dupes')) === '1', 'bookmarks: duplicate count = 1');
  const [dl] = await Promise.all([dash.waitForEvent('download'), dash.click('#b-backup')]);
  const bpath = path.join(OUT, 'bm.html'); await dl.saveAs(bpath);
  ok(fs.readFileSync(bpath, 'utf8').includes('NETSCAPE-Bookmark-file-1') && fs.readFileSync(bpath, 'utf8').includes('chatgpt.com'), 'bookmark backup is a valid Netscape HTML export');
  await dash.click('#b-sort'); await sleep(1500);
  const sorted = await sw.evaluate(async () => { const r = (await chrome.bookmarks.search({ title: 'Tab Butler – Sorted' }))[0] || (await chrome.bookmarks.getTree()) && null; const all = await chrome.bookmarks.getTree(); const find = n => n.title?.startsWith('Tab Butler – Sorted') ? n : (n.children || []).map(find).find(Boolean); const f = find(all[0]); const orig = (await chrome.bookmarks.search({ title: 'Random' }))[0]; const origKids = await chrome.bookmarks.getChildren(orig.id); return { folders: (f?.children || []).map(c => c.title + ':' + c.children.length), orig: origKids.length }; });
  ok(sorted.folders.length >= 3 && sorted.orig === 5, `sorted copy created (${sorted.folders.join(', ')}); originals untouched (${sorted.orig})`);
  await dash.screenshot({ path: path.join(OUT, 'bookmarks.png'), fullPage: true });

  await dash.goto(`chrome-extension://${id}/dashboard.html#history`); await sleep(500);
  await dash.click('#h-scan'); await sleep(1200);
  const hc = await dash.textContent('#h-count');
  ok(/^[1-9]\d* junk/.test(hc) && (await dash.textContent('#h-list')).includes('site.test'), 'history scan finds /login page: ' + hc);
  await dash.click('#h-del'); await sleep(1200);
  const left = await sw.evaluate(async () => (await chrome.history.search({ text: 'site.test', startTime: 0 })).length);
  ok(left === 0, 'junk history deleted');
  await dash.screenshot({ path: path.join(OUT, 'history.png'), fullPage: true });

  await dash.goto(`chrome-extension://${id}/dashboard.html#settings`); await sleep(600);
  await dash.fill('.catedit[data-i="0"] [data-f=name]', 'Inbox');
  await dash.fill('[data-k=sleepMinutes]', '45');
  await dash.click('#c-save'); await sleep(500);
  const cfg = await sw.evaluate(async () => (await chrome.storage.local.get(['categories', 'settings'])));
  ok(cfg.categories[0].name === 'Inbox' && cfg.settings.sleepMinutes === 45, 'settings save (rename category, sleep minutes)');
  await dash.screenshot({ path: path.join(OUT, 'settings.png'), fullPage: true });
  await dash.goto(`chrome-extension://${id}/dashboard.html#welcome`); await sleep(400);
  await dash.screenshot({ path: path.join(OUT, 'welcome.png') });

  await popup.setViewportSize({ width: 340, height: 560 });
  await popup.reload(); await sleep(700);
  await popup.screenshot({ path: path.join(OUT, 'popup.png'), fullPage: true });

  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
