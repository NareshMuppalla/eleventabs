// Renders the ElevenTabs app icon (indigo tile, bookmark over stacked tabs) at all sizes + site assets.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9a8cff"/><stop offset=".55" stop-color="#6a5cff"/><stop offset="1" stop-color="#3b2bd1"/></linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>
  <rect x="2" y="2" width="124" height="124" rx="30" fill="url(#bg)"/>
  <rect x="2" y="2" width="124" height="62" rx="30" fill="url(#shine)"/>
  <path d="M25 40a9 9 0 0 1 9-9h16a9 9 0 0 1 9 9v6H25z" fill="#fff" opacity=".42"/>
  <rect x="25" y="44" width="40" height="56" rx="9" fill="#fff" opacity=".42"/>
  <path d="M60 24h42a8 8 0 0 1 8 8v78a3 3 0 0 1-4.7 2.5L81 99.7l-24.3 12.8A3 3 0 0 1 52 110V32a8 8 0 0 1 8-8z" fill="#fff"/>
  <path d="M69 52l7 7 13-14" fill="none" stroke="#4636e0" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const s of [16, 32, 48, 128]) {
    await p.setViewportSize({ width: s, height: s });
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${s}" height="${s}" `)}</body></html>`);
    await p.screenshot({ path: path.join(__dirname, '../extension/icons', `${s}.png`), omitBackground: true });
  }
  await p.setViewportSize({ width: 256, height: 256 });
  await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', '<svg width="256" height="256" ')}</body></html>`);
  await p.screenshot({ path: path.join(__dirname, '../site/logo.png'), omitBackground: true });
  fs.writeFileSync(path.join(__dirname, '../site/icon.svg'), svg);
  await b.close();
  console.log('icons done');
})();
