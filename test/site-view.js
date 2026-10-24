// Serves site/ locally and screenshots the homepage (desktop + mobile) and the versions page.
const { chromium } = require('playwright'); const path = require('path'); const { spawn } = require('child_process');
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8765', '-d', path.join(__dirname, '../site')], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(1200);
  const pi = await p.$('.popup-frame img'); await pi.scrollIntoViewIfNeeded(); await p.waitForTimeout(1200);
  console.log('popup img:', await pi.evaluate(i => [i.complete, i.naturalWidth, Math.round(i.getBoundingClientRect().height)]));
  await p.screenshot({ path: path.join(__dirname, 'shots/site-popup.png') });
  await p.evaluate(() => document.querySelectorAll('img[loading=lazy]').forEach(i => i.loading = 'eager')); await p.waitForTimeout(1500);
  console.log('download href:', await p.getAttribute('.nav a.dl', 'href'), '| label:', await p.textContent('.nav a.dl'));
  await p.screenshot({ path: path.join(__dirname, 'shots/site-full.png'), fullPage: true });
  await p.goto('http://localhost:8765/changelog.html'); await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(__dirname, 'shots/site-changelog.png'), fullPage: true });
  const m = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await m.goto('http://localhost:8765/'); await m.waitForTimeout(900);
  await m.screenshot({ path: path.join(__dirname, 'shots/site-mobile.png') });
  await b.close(); srv.kill();
})();
