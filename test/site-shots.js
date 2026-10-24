// Generates clean marketing screenshots for the website.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const SRC = path.join(__dirname, '../extension');
const EXT = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'tb-ext-'));
fs.cpSync(SRC, EXT, { recursive: true });
{ const m = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8')); m.permissions.push(...(m.optional_permissions || [])); delete m.optional_permissions; fs.writeFileSync(path.join(EXT, 'manifest.json'), JSON.stringify(m)); }
const SCHEME = process.env.SCHEME || 'dark';
const SUFFIX = process.env.SUFFIX || '';
const IMG = path.join(__dirname, '../site/img'); fs.mkdirSync(IMG, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'tbs-')), { channel: 'chromium', headless: true, colorScheme: SCHEME, deviceScaleFactor: 2, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  await ctx.route(/^https?:\/\//, r => {
    if (r.request().url().includes('/s2/favicons')) return r.continue();
    const u = new URL(r.request().url());
    // real favicon so Chrome caches it for the local _favicon API
    return r.fulfill({ contentType: 'text/html', body: `<title>${u.hostname}</title><link rel="icon" href="https://www.google.com/s2/favicons?sz=64&domain=${u.hostname}">` });
  });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = sw.url().split('/')[2];
  for (const u of ['https://mail.google.com/', 'https://github.com/x', 'https://vercel.com/', 'https://claude.ai/', 'https://chatgpt.com/', 'https://www.linkedin.com/jobs/', 'https://www.naukri.com/', 'https://www.youtube.com/', 'https://docs.google.com/d', 'https://github.com/x', 'https://www.amazon.in/']) { const p = await ctx.newPage(); await p.goto(u); }
  await sw.evaluate(async () => {
    const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
    const mk = (a) => Object.fromEntries(a);
    await chrome.storage.local.set({ time: {
      [day(6)]: mk([['github.com', 5200], ['claude.ai', 2600], ['mail.google.com', 1900], ['youtube.com', 1500], ['linkedin.com', 900]]),
      [day(5)]: mk([['github.com', 4100], ['docs.google.com', 2800], ['chatgpt.com', 2100], ['mail.google.com', 1500], ['naukri.com', 1200]]),
      [day(4)]: mk([['vercel.com', 2500], ['claude.ai', 3900], ['mail.google.com', 2200], ['youtube.com', 2400]]),
      [day(3)]: mk([['github.com', 6100], ['linkedin.com', 2600], ['naukri.com', 1800], ['amazon.in', 900]]),
      [day(2)]: mk([['docs.google.com', 3300], ['claude.ai', 3100], ['mail.google.com', 2500], ['youtube.com', 1100]]),
      [day(1)]: mk([['github.com', 3000], ['chatgpt.com', 1900], ['linkedin.com', 2200], ['instagram.com', 1600]]),
      [day(0)]: mk([['claude.ai', 2700], ['github.com', 2400], ['mail.google.com', 1300], ['naukri.com', 1000]])
    } });
    const visits = { 'https://github.com/': 48, 'https://mail.google.com/': 41, 'https://claude.ai/': 36, 'https://www.linkedin.com/jobs/': 22, 'https://docs.google.com/': 19, 'https://www.youtube.com/': 17, 'https://chatgpt.com/': 14, 'https://www.naukri.com/': 11, 'https://vercel.com/': 9, 'https://www.amazon.in/': 6 };
    for (const [u, n] of Object.entries(visits)) for (let i = 0; i < n; i++) await chrome.history.addUrl({ url: u + '?v=' + i });
  });
  await sleep(1500);
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`); await sleep(500);
  await popup.fill('#sess-name', 'Job hunt'); await popup.click('#save'); await sleep(800);
  await popup.setViewportSize({ width: 368, height: 600 });
  await popup.goto(`chrome-extension://${id}/popup.html`); await sleep(800);
  await popup.click('#group'); await sleep(1500);
  await popup.reload(); await sleep(800);
  await popup.screenshot({ path: path.join(IMG, `popup${SUFFIX}.png`), fullPage: true });
  const d = await ctx.newPage();
  await d.setViewportSize({ width: 1280, height: 800 });
  const THEME = process.env.THEME || 'gold';
  await sw.evaluate(async (THEME) => {
    const { settings = {} } = await chrome.storage.local.get('settings');
    const tabs = (await chrome.tabs.query({})).filter(t => t.url.startsWith('http'));
    const gs = Object.fromEntries((await chrome.tabGroups.query({})).map(g => [g.id, { title: g.title, color: g.color }]));
    const prev = tabs.map((t, i) => ({ url: t.url, title: ({ 'mail.google.com': 'Inbox (3) – Gmail', 'github.com': 'NareshMuppalla/tab-butler · GitHub', 'vercel.com': 'Deployments – Vercel', 'claude.ai': 'Planning the ElevenTabs launch – Claude', 'chatgpt.com': 'ChatGPT', 'www.linkedin.com': 'Customer Success Manager jobs | LinkedIn', 'www.naukri.com': 'CSM jobs in Bengaluru – Naukri', 'www.youtube.com': 'YouTube', 'docs.google.com': 'Launch plan – Google Docs', 'www.amazon.in': 'Amazon.in' })[new URL(t.url).hostname] || t.title, group: gs[t.groupId] || null, last: Date.now() - i * 600e3 }));
    prev.push({ url: 'https://www.notion.so/roadmap', title: 'Q4 roadmap – Notion', group: { title: 'Work & Docs', color: 'blue' }, last: Date.now() - 200e3 });
    prev.push({ url: 'https://www.figma.com/file/x', title: 'ElevenTabs – store listing – Figma', group: { title: 'Work & Docs', color: 'blue' }, last: Date.now() - 100e3 });
    prev.push({ url: 'https://wellfound.com/jobs', title: 'Customer Success roles – Wellfound', group: { title: 'Jobs', color: 'green' }, last: Date.now() - 50e3 });
    await chrome.storage.local.set({ previousSession: { at: Date.now() - 9 * 3600e3, windows: [{ tabs: prev }] }, slept: { [new Date().toISOString().slice(0, 10)]: 14 },
      settings: { ...settings, userName: 'Naresh', themeMode: 'fixed', themeId: THEME } });
  }, THEME);
  for (const s of ['overview', 'tabs', 'settings', 'privacy', 'welcome', 'sessions', 'appearance', 'whatsnew']) { await d.goto(`chrome-extension://${id}/dashboard.html#${s}`); await d.reload(); await sleep(1800); await d.screenshot({ path: path.join(IMG, s + SUFFIX + '.png') }); }
  const st = await ctx.newPage(); await st.setViewportSize({ width: 1280, height: 900 });
  await st.goto(`chrome-extension://${id}/start.html`); await sleep(2200);
  await st.screenshot({ path: path.join(IMG, 'start' + SUFFIX + '.png') });
  await popup.reload(); await sleep(800);
  await popup.screenshot({ path: path.join(IMG, `popup${SUFFIX}.png`), fullPage: true });
  await ctx.close(); console.log('shots done');
})();
