// ElevenTabs theme engine: theme packs -> CSS variables. Used by every page and by theme-boot.js.
const clamp = (n, a = 0, b = 255) => Math.min(b, Math.max(a, n));
export function hexToRgb(h) {
  let s = String(h || '').replace('#', '').trim();
  if (s.length === 3) s = s.split('').map(c => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(s)) return [242, 193, 78];
  return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16));
}
const toHex = rgb => '#' + rgb.map(v => clamp(Math.round(v)).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, t) => { const x = hexToRgb(a), y = hexToRgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
const rgba = (h, a) => `rgba(${hexToRgb(h).join(', ')}, ${a})`;
const lum = h => { const [r, g, b] = hexToRgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };

// Each theme = base (dark/light), background tint and a 3-stop accent gradient.
export const THEMES = {
  gold:     { name: 'Eleven Gold', base: 'dark',  bg: '#0b0b0f', accent: ['#f8dc7c', '#f0b93f', '#c98a3b'], text: '#f3ecda' },
  midnight: { name: 'Midnight',    base: 'dark',  bg: '#090c14', accent: ['#b9d0ff', '#6d9bff', '#4a6fe0'], text: '#e8eefc' },
  aurora:   { name: 'Aurora',      base: 'dark',  bg: '#081011', accent: ['#a6f4dc', '#4fd1b5', '#3a8fd6'], text: '#e6f6f2' },
  sunset:   { name: 'Sunset',      base: 'dark',  bg: '#120c0d', accent: ['#ffc8a2', '#ff8a5c', '#e0567a'], text: '#fbe9e2' },
  forest:   { name: 'Forest',      base: 'dark',  bg: '#0a100c', accent: ['#d2eba8', '#86c983', '#3f8f6a'], text: '#e9f2e4' },
  mono:     { name: 'Graphite',    base: 'dark',  bg: '#0c0c0d', accent: ['#ffffff', '#d4d4d8', '#9a9aa3'], text: '#f1f1f3' },
  paper:    { name: 'Paper',       base: 'light', bg: '#f3f0e8', accent: ['#f6d36b', '#e7a92f', '#c07f2c'], text: '#111110' },
  rose:     { name: 'Rosé',        base: 'light', bg: '#f7f0ef', accent: ['#f7b2bf', '#e0718d', '#b84d6e'], text: '#1a1112' },
  sky:      { name: 'Sky',         base: 'light', bg: '#eef3f8', accent: ['#a9cdfb', '#5b9cf0', '#3567c9'], text: '#0e1420' }
};

// Auto mode: theme follows the time of day.
export const AUTO_SCHEDULE = [
  { from: 6, to: 11, id: 'paper', label: 'Morning' },
  { from: 11, to: 17, id: 'sky', label: 'Afternoon' },
  { from: 17, to: 20, id: 'sunset', label: 'Evening' },
  { from: 20, to: 6, id: 'gold', label: 'Night' }
];
export function autoThemeId(d = new Date()) {
  const h = d.getHours();
  const slot = AUTO_SCHEDULE.find(s => s.from < s.to ? h >= s.from && h < s.to : h >= s.from || h < s.to);
  return slot ? slot.id : 'gold';
}

export function customTheme(c = {}) {
  const base = c.base === 'light' ? 'light' : 'dark';
  const a = /^#[0-9a-f]{6}$/i.test(c.accent || '') ? c.accent : '#f0b93f';
  return { name: 'Custom', base, bg: base === 'dark' ? mix('#0b0b0f', a, .04) : mix('#f5f3ee', a, .05), accent: [mix(a, '#ffffff', .45), a, mix(a, '#000000', .28)], text: base === 'dark' ? mix('#f5f3ee', a, .06) : '#111110' };
}

export function buildVars(t) {
  const [hi, mid, lo] = t.accent;
  const dark = t.base === 'dark';
  const W = '#ffffff', K = '#000000';
  const v = dark ? {
    '--bg': t.bg, '--bg-2': mix(t.bg, W, .03), '--card': mix(t.bg, W, .05), '--card-2': mix(t.bg, W, .075), '--hover': mix(t.bg, W, .1),
    '--line': rgba(t.text, .08), '--line-2': rgba(t.text, .15),
    '--text': t.text, '--text-2': mix(t.text, t.bg, .18), '--muted': mix(t.text, t.bg, .45), '--faint': mix(t.text, t.bg, .65),
    '--gold': mid, '--gold-ink': hi, '--bronze': lo, '--gold-soft': rgba(mid, .11), '--gold-line': rgba(mid, .32),
    '--danger': '#ff8a7a', '--danger-soft': 'rgba(255, 138, 122, .1)', '--ok': '#86d6a8',
    '--shadow': '0 1px 0 rgba(255,255,255,.03) inset, 0 12px 32px -18px rgba(0,0,0,.8)',
    '--glow': `radial-gradient(600px 240px at 15% -10%, ${rgba(mid, .12)}, transparent 60%)`
  } : {
    '--bg': t.bg, '--bg-2': mix(t.bg, K, .03), '--card': mix(t.bg, W, .6), '--card-2': mix(t.bg, W, .3), '--hover': mix(t.bg, K, .025),
    '--line': rgba(t.text, .09), '--line-2': rgba(t.text, .18),
    '--text': t.text, '--text-2': mix(t.text, t.bg, .15), '--muted': mix(t.text, t.bg, .52), '--faint': mix(t.text, t.bg, .7),
    '--gold': mix(mid, K, .28), '--gold-ink': mix(mid, K, .42), '--bronze': lo, '--gold-soft': rgba(mid, .14), '--gold-line': rgba(mix(mid, K, .2), .38),
    '--danger': '#b93a0a', '--danger-soft': 'rgba(185, 58, 10, .08)', '--ok': '#2f6d58',
    '--shadow': '0 1px 0 rgba(255,255,255,.7) inset, 0 10px 30px -20px rgba(40,30,10,.35)',
    '--glow': `radial-gradient(600px 240px at 15% -10%, ${rgba(mid, .18)}, transparent 60%)`
  };
  v['--grad'] = `linear-gradient(135deg, ${hi} 0%, ${mid} 45%, ${lo} 100%)`;
  v['--on-gold'] = lum(mid) > .35 ? mix(t.bg, K, dark ? .4 : .8) : '#ffffff';
  return v;
}

// settings: { themeMode: 'fixed'|'auto'|'system', themeId, customTheme }
export function resolveTheme(settings = {}) {
  const mode = settings.themeMode || 'system';
  let id = settings.themeId || 'gold';
  if (mode === 'auto') id = autoThemeId();
  if (mode === 'system') id = matchMedia('(prefers-color-scheme: light)').matches ? 'paper' : 'gold';
  const t = id === 'custom' ? customTheme(settings.customTheme) : (THEMES[id] || THEMES.gold);
  return { id, theme: t, vars: buildVars(t) };
}

export function applyThemeVars(vars, base) {
  const r = document.documentElement;
  for (const [k, val] of Object.entries(vars)) r.style.setProperty(k, val);
  r.dataset.theme = base;
}

// Apply and cache (theme-boot.js reads the cache before first paint).
export function applyTheme(settings) {
  const { theme, vars, id } = resolveTheme(settings);
  applyThemeVars(vars, theme.base);
  try { localStorage.setItem('et-theme', JSON.stringify({ vars, base: theme.base, mode: settings.themeMode, id })); } catch {}
  return id;
}
