// Renders the Tab Butler icon at all sizes.
const { chromium } = require('playwright');
const path = require('path');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f8df7"/><stop offset="1" stop-color="#1a5fd0"/></linearGradient></defs>
  <rect x="4" y="4" width="120" height="120" rx="28" fill="url(#g)"/>
  <rect x="22" y="30" width="38" height="18" rx="6" fill="#fff"/>
  <rect x="64" y="30" width="22" height="18" rx="6" fill="#ffd166"/>
  <rect x="90" y="30" width="16" height="18" rx="6" fill="#ff8fa3"/>
  <rect x="22" y="56" width="84" height="44" rx="10" fill="#fff" opacity=".95"/>
  <rect x="32" y="68" width="40" height="7" rx="3.5" fill="#1a5fd0"/>
  <rect x="32" y="82" width="58" height="7" rx="3.5" fill="#9bbcf5"/>
</svg>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const s of [16, 32, 48, 128]) {
    await p.setViewportSize({ width: s, height: s });
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${s}" height="${s}" `)}</body></html>`);
    await p.screenshot({ path: path.join(__dirname, '../extension/icons', `${s}.png`), omitBackground: true });
  }
  require('fs').writeFileSync(path.join(__dirname, '../site/icon.svg'), svg);
  await b.close();
  console.log('icons done');
})();
