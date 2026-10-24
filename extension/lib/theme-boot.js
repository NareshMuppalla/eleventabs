// Runs before first paint: applies the cached theme so pages never flash the wrong colours.
(() => {
  try {
    const c = JSON.parse(localStorage.getItem('et-theme') || 'null');
    const r = document.documentElement;
    if (c && c.vars) { for (const k in c.vars) r.style.setProperty(k, c.vars[k]); r.dataset.theme = c.base; return; }
    r.dataset.theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {}
})();
