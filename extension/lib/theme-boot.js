// Runs before first paint so pages open in the right theme (no flash).
(() => {
  const t = localStorage.getItem('tb-theme') || 'system';
  document.documentElement.dataset.theme = t === 'dark' || t === 'light' ? t : (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
})();
