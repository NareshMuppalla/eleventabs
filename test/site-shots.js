// Generates clean marketing screenshots for the website.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const EXT = path.join(__dirname, '../extension');
const IMG = path.join(__dirname, '../site/img'); fs.mkdirSync(IMG, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'tbs-')), { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  await ctx.route(/^https?:\/\//, r => {
    const u = new URL(r.request().url());
    if (u.pathname.includes('/s2/favicons')) return r.continue();
    return r.fulfill({ contentType: 'text/html', body: `<title>${u.hostname}</title>` });
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
  const popup = await ctx.newPage();
  await popup.setViewportSize({ width: 340, height: 545 });
  await popup.goto(`chrome-extension://${id}/popup.html`); await sleep(800);
  await popup.click('#group'); await sleep(1500);
  await popup.reload(); await sleep(800);
  await popup.screenshot({ path: path.join(IMG, 'popup.png'), fullPage: true });
  const d = await ctx.newPage();
  await d.setViewportSize({ width: 1280, height: 800 });
  for (const s of ['overview', 'tabs', 'settings']) { await d.goto(`chrome-extension://${id}/dashboard.html#${s}`); await sleep(2500); await d.screenshot({ path: path.join(IMG, s + '.png') }); }
  await ctx.close(); console.log('shots done');
})();
