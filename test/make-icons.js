// Renders the Tab Butler app icon (ink tile, gold stacked tabs) at all sizes + site assets.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e1c26"/><stop offset="1" stop-color="#0b0b0f"/></linearGradient>
    <linearGradient id="au" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbe39a"/><stop offset=".5" stop-color="#f0b93f"/><stop offset="1" stop-color="#c07f2c"/></linearGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7d774" stop-opacity=".6"/><stop offset="1" stop-color="#f7d774" stop-opacity="0"/></linearGradient>
  </defs>
  <rect x="2" y="2" width="124" height="124" rx="30" fill="url(#bg)"/>
  <rect x="2.75" y="2.75" width="122.5" height="122.5" rx="29.25" fill="none" stroke="url(#rim)" stroke-width="1.5"/>
  <path d="M22 34a7 7 0 0 1 7-7h20a7 7 0 0 1 7 7v3H22z" fill="#f0b93f" opacity=".28"/>
  <path d="M60 34a7 7 0 0 1 7-7h32a7 7 0 0 1 7 7v3H60z" fill="#f0b93f" opacity=".16"/>
  <path d="M40 54 L54 44 V100 M74 54 L88 44 V100" fill="none" stroke="url(#au)" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const s of [16, 32, 48, 128]) {
    await p.setViewportSize({ width: s, height: s });
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${s}" height="${s}" `)}</body></html>`);
    await p.screenshot({ path: path.join(__dirname, '../extension/icons', `${s}.png`), omitBackground: true });
  }
  fs.writeFileSync(path.join(__dirname, '../site/icon.svg'), svg);
  await b.close();
  console.log('icons done');
})();
