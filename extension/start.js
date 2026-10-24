import { getConfig, saveConfig, categorize, hostOf, isWebUrl, isPrivate, faviconUrl, normUrl, todayKey, COLORS } from './lib/config.js';
import { THEMES, applyTheme, resolveTheme } from './lib/themes.js';
import { hydrateIcons, icon } from './lib/icons.js';

hydrateIcons();
const $ = id => document.getElementById(id);
const send = (type, payload) => chrome.runtime.sendMessage({ type, payload });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const col = c => COLORS.includes(c) ? c : 'grey';
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
function dur(s) { s = Math.round(s || 0); if (s < 60) return '0m'; const m = Math.round(s / 60); if (m < 60) return m + 'm'; return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm'; }
function ago(t) { const m = Math.round((Date.now() - t) / 60000); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; const h = Math.round(m / 60); if (h < 24) return plural(h, 'hour') + ' ago'; return plural(Math.round(h / 24), 'day') + ' ago'; }
let tt;
function toast(msg, ic = 'check') { const t = $('toast'); t.innerHTML = icon(ic, 15); t.append(msg); t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2600); }
const VERSION = chrome.runtime.getManifest().version;
$('ver').textContent = 'v' + VERSION; $('ver-foot').textContent = 'ElevenTabs v' + VERSION;

let cfg;

function greet() {
  const now = new Date(), h = now.getHours();
  const part = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 21 ? 'Good evening' : 'Good night';
  const name = cfg.settings.userName;
  $('greet').innerHTML = `${esc(part)}${name ? `, <em class="gold">${esc(name)}</em>` : ''}.`;
  $('clock').textContent = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) + ' · ' + now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

// ---------- search ----------
$('search-form').onsubmit = e => {
  e.preventDefault();
  const q = $('q').value.trim(); if (!q) return;
  const looksLikeUrl = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/i.test(q) && !/\s/.test(q);
  if (looksLikeUrl) location.href = /^https?:\/\//i.test(q) ? q : 'https://' + q;
  else chrome.search.query({ text: q, disposition: 'CURRENT_TAB' });
};

const label = h => { const p = h.split('.'); return p.length > 2 ? p.slice(0, -1).join('.') : p[0]; };
// ---------- quick links: your most-used sites (from local time stats) ----------
async function quick() {
  const { time = {} } = await chrome.storage.local.get('time');
  const by = {};
  for (const d of Object.keys(time).sort().slice(-14)) for (const [h, s] of Object.entries(time[d])) if (!isPrivate('https://' + h + '/', cfg.settings)) by[h] = (by[h] || 0) + s;
  const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 8);
  $('quick').innerHTML = top.map(([h]) => `<a href="https://${esc(h)}/"><span class="q"><img src="${esc(faviconUrl('https://' + h + '/'))}" alt=""></span><span class="n">${esc(label(h))}</span></a>`).join('');
}

// ---------- pick up where you left off ----------
async function resume() {
  const { previousSession } = await chrome.storage.local.get('previousSession');
  const el = $('resume');
  if (!previousSession?.windows?.length) {
    el.innerHTML = `<span class="eyebrow">Pick up where you left off</span><h2>We'll remember your tabs from now on.</h2><p class="muted">Next time you open Chrome, this card shows what you had open, grouped the way you left it, with one-click restore.</p>`;
    return;
  }
  const open = new Set((await chrome.tabs.query({})).map(t => normUrl(t.url || '')));
  const all = previousSession.windows.flatMap((w, wi) => w.tabs.map(t => ({ ...t, wi })));
  const missing = all.filter(t => !open.has(normUrl(t.url)));
  const groups = {};
  for (const t of all) { const k = t.group?.title || ''; if (!k) continue; (groups[k] = groups[k] || { g: t.group, n: 0, miss: 0 }).n++; if (!open.has(normUrl(t.url))) groups[k].miss++; }
  const recent = [...all].sort((a, b) => (b.last || 0) - (a.last || 0)).slice(0, 6);
  const priv = t => isPrivate(t.url, cfg.settings);
  el.innerHTML = `<div class="row"><span class="eyebrow">Pick up where you left off</span><span class="grow"></span><span class="chip">${esc(ago(previousSession.at))}</span></div>
    <h2>${plural(all.length, 'tab')} across ${plural(previousSession.windows.length, 'window')}</h2>
    <p class="muted" style="margin:0">${missing.length ? `${plural(missing.length, 'tab')} from last time ${missing.length === 1 ? "isn't" : "aren't"} open right now.` : 'Everything from last time is open again.'}</p>
    ${Object.keys(groups).length ? `<div class="groups">${Object.entries(groups).map(([k, v]) => `<button class="gchip" data-group="${esc(k)}" ${v.miss ? '' : 'disabled style="opacity:.55;cursor:default"'}><span class="dot d-${col(v.g.color)}"></span>${esc(k)}<span class="c">${v.n}</span></button>`).join('')}</div>` : ''}
    <div class="tabs">${recent.map(t => `<div class="list-row" data-url="${esc(t.url)}"><img class="favicon" src="${esc(faviconUrl(t.url))}" alt="">${priv(t) ? `<span class="grow ellipsis t">${icon('lock', 13)} Private site</span>` : `<span class="grow ellipsis t">${esc(t.title || t.url)}</span>`}<span class="h ellipsis">${esc(hostOf(t.url))}</span></div>`).join('')}</div>
    <div class="row wrap" style="margin-top:16px">${missing.length ? `<button class="btn btn-gold" id="restore-all">${icon('archive-restore', 16)}Restore ${plural(missing.length, 'tab')}</button>` : `<span class="done">${icon('check', 16)}You're all caught up</span>`}<a class="btn btn-quiet" href="dashboard.html#sessions">${icon('save', 15)}Saved sessions</a></div>`;
  el.onclick = async e => {
    const g = e.target.closest('[data-group]'), row = e.target.closest('[data-url]'), all = e.target.closest('#restore-all');
    if (all) { const r = await send('restorePrevious', {}); toast(`Restored ${plural(r.restored, 'tab')}`); setTimeout(resume, 800); }
    if (g && !g.disabled) { const r = await send('restorePrevious', { groupTitle: g.dataset.group }); toast(`Reopened ${plural(r.restored, 'tab')} from ${g.dataset.group}`); setTimeout(resume, 800); }
    if (row) chrome.tabs.create({ url: row.dataset.url });
  };
}

// ---------- today, streak, yesterday ----------
async function today() {
  await send('flush');
  const { time = {}, slept = {} } = await chrome.storage.local.get(['time', 'slept']);
  const s = await send('stats');
  const visible = h => !isPrivate('https://' + h + '/', cfg.settings);
  const sum = d => Object.entries(time[d] || {}).filter(([h]) => visible(h)).reduce((a, [, v]) => a + v, 0);
  const d0 = todayKey();
  $('today-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'short' });
  $('m-time').textContent = dur(sum(d0));
  $('m-tabs').textContent = s?.tabs ?? '–';
  $('m-sleep').textContent = s?.sleeping ?? '–';
  const mb = (slept[d0] || 0) * 90; // rough average memory per background tab
  $('m-mem').textContent = mb >= 1000 ? '≈' + (mb / 1000).toFixed(1) + ' GB' : '≈' + mb + ' MB';
  // streak = consecutive days with browsing, counting back from today (or yesterday)
  const day = n => todayKey(new Date(Date.now() - n * 864e5));
  let n = 0, i = sum(day(0)) > 0 ? 0 : 1;
  while (sum(day(i)) > 0) { n++; i++; }
  $('streak-n').textContent = n;
  $('streak-t').textContent = n === 1 ? 'day streak' : 'day streak';
  $('streak').innerHTML = [...Array(7)].map((_, k) => `<i class="${sum(day(6 - k)) > 0 ? 'on' : ''}" title="${esc(day(6 - k))}"></i>`).join('');
  // yesterday by category
  const yd = day(1), by = {};
  for (const [h, sec] of Object.entries(time[yd] || {})) { if (!visible(h)) continue; const c = categorize('https://' + h + '/', cfg.categories) || { name: 'Other', color: 'grey' }; (by[c.name] = by[c.name] || { c, s: 0 }).s += sec; }
  const rows = Object.values(by).sort((a, b) => b.s - a.s).slice(0, 4);
  const max = rows[0]?.s || 1;
  $('y-total').textContent = rows.length ? dur(sum(yd)) : '';
  $('yesterday').innerHTML = rows.length ? rows.map(({ c, s }) => `<div class="row" style="padding:6px 0"><span class="dot d-${col(c.color)}"></span><span style="width:110px" class="ellipsis small">${esc(c.name)}</span><div class="track grow"><span style="width:${(s / max * 100).toFixed(1)}%;background:var(--g-${col(c.color)})"></span></div><span class="mono tiny muted" style="width:56px;text-align:right">${dur(s)}</span></div>`).join('')
    : `<p class="small muted" style="margin:0">No browsing recorded yesterday.</p>`;
}

// ---------- saved sessions ----------
async function sessions() {
  const { sessions = [] } = await chrome.storage.local.get('sessions');
  $('sessions-card').hidden = !sessions.length;
  $('sessions').innerHTML = sessions.slice(0, 3).map(s => `<div class="list-row"><span class="grow"><b>${esc(s.name)}</b><div class="tiny muted">${plural(s.tabs.length, 'tab')} · ${esc(ago(s.created))}</div></span><button class="btn btn-sm" data-open="${esc(s.id)}">${icon('external-link', 14)}Open</button></div>`).join('');
  $('sessions').onclick = async e => { const b = e.target.closest('[data-open]'); if (b) { const r = await send('restoreSession', { id: b.dataset.open }); toast(`Opened ${plural(r.restored, 'tab')}`); } };
}

// ---------- theme switcher ----------
function themes() {
  const cur = resolveTheme(cfg.settings).id;
  const mode = cfg.settings.themeMode;
  const items = [['auto', 'Auto (changes with the time of day)', 'conic-gradient(#f6d36b, #5b9cf0, #ff8a5c, #0b0b0f, #f6d36b)'],
    ...Object.entries(THEMES).map(([id, t]) => [id, t.name, `linear-gradient(135deg, ${t.bg} 0 45%, ${t.accent[1]} 45% 100%)`])];
  $('themes').innerHTML = items.map(([id, name, bg]) => `<span class="sw ${(mode === 'auto' ? id === 'auto' : mode === 'fixed' && id === cur) ? 'on' : ''}" data-t="${id}" title="${esc(name)}" style="background:${bg}"></span>`).join('') + `<a class="small" href="dashboard.html#appearance" style="margin-left:6px">More…</a>`;
  $('theme-name').textContent = mode === 'auto' ? 'Auto · ' + (THEMES[cur]?.name || cur) : mode === 'system' ? 'Follows system' : (THEMES[cur]?.name || 'Custom');
  $('themes').onclick = async e => {
    const sw = e.target.closest('[data-t]'); if (!sw) return;
    if (sw.dataset.t === 'auto') cfg.settings.themeMode = 'auto';
    else { cfg.settings.themeMode = 'fixed'; cfg.settings.themeId = sw.dataset.t; }
    await saveConfig({ settings: cfg.settings });
    applyTheme(cfg.settings); themes();
  };
}

(async () => {
  cfg = await getConfig();
  applyTheme(cfg.settings);
  greet(); setInterval(() => { greet(); if (cfg.settings.themeMode === 'auto') applyTheme(cfg.settings); }, 30000);
  $('on-launch').checked = cfg.settings.startOnLaunch;
  $('on-launch').onchange = async () => { cfg.settings.startOnLaunch = $('on-launch').checked; await saveConfig({ settings: cfg.settings }); toast(cfg.settings.startOnLaunch ? 'Will open when Chrome starts' : "Won't open on start"); };
  themes();
  await Promise.all([quick(), resume(), today(), sessions()]);
  $('q').focus();
})();

// Keep every open ElevenTabs page in sync when the theme changes anywhere.
chrome.storage.onChanged.addListener(async (ch, area) => {
  if (area === 'local' && ch.settings) { const { settings } = await getConfig(); applyTheme(settings); }
});
