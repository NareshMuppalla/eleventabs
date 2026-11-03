import { getConfig, saveConfig, faviconUrl, hostOf, isWebUrl } from './lib/config.js';
import { loadLib, saveItem, saveMany, patchItems, removeItems, addCat, findByUrl, suggestCat } from './lib/library.js';
import { hydrateIcons, icon } from './lib/icons.js';
import { applyTheme } from './lib/themes.js';

hydrateIcons();
const $ = id => document.getElementById(id);
const send = (type, payload) => chrome.runtime.sendMessage({ type, payload });
let tt;
function toast(msg) { const t = $('toast'); t.innerHTML = icon('check', 15); t.append(msg); t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2400); }
if (!/Mac/i.test(navigator.platform)) document.querySelectorAll('kbd[data-k]').forEach(k => { k.textContent = 'Alt+Shift+' + k.dataset.k; });

async function refresh() {
  const s = await send('stats');
  if (!s?.ok) return;
  $('s-tabs').textContent = s.tabs; $('s-wins').textContent = s.windows;
  $('s-sleep').textContent = s.sleeping; $('s-dupes').textContent = s.duplicates;
  $('dupe-stat').classList.toggle('hot', s.duplicates > 0);
  $('dupes').disabled = !s.duplicates;
  $('dupes-sub').textContent = s.duplicates ? `${s.duplicates} duplicate${s.duplicates === 1 ? '' : 's'} open right now` : 'No duplicates open';
}

async function run(btn, type, payload, fmt) {
  btn.disabled = true;
  const r = await send(type, payload);
  btn.disabled = false;
  toast(r?.ok ? fmt(r) : 'Something went wrong: ' + (r?.error || 'unknown'));
  refresh();
}
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
$('group').onclick = e => run(e.currentTarget, 'groupAll', {}, r => r.grouped ? `Sorted ${plural(r.grouped, 'tab')} into groups` : 'Nothing to sort yet');
$('dupes').onclick = e => run(e.currentTarget, 'closeDuplicates', {}, r => `Closed ${plural(r.closed, 'duplicate')}`);
$('sleep').onclick = e => run(e.currentTarget, 'sleepNow', {}, r => `${plural(r.slept, 'tab')} asleep`);
$('ungroup').onclick = e => run(e.currentTarget, 'ungroupAll', {}, r => `Ungrouped ${plural(r.ungrouped, 'tab')}`);
$('save').onclick = async e => {
  const btn = e.currentTarget;
  const win = await chrome.windows.getCurrent();
  run(btn, 'saveSession', { name: $('sess-name').value.trim(), windowId: win.id, closeAfter: $('sess-close').checked }, r => r.saved ? `Saved ${plural(r.saved, 'tab')}` : 'No web pages to save');
  $('sess-name').value = '';
};
$('sess-name').onkeydown = e => { if (e.key === 'Enter') $('save').click(); };
const openPage = hash => { chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html' + hash) }); window.close(); };
$('open-dash').onclick = () => openPage('#overview');
$('welcome').onclick = async () => { await send('openStart'); window.close(); };
$('open-new').textContent = 'v' + chrome.runtime.getManifest().version;
$('open-new').onclick = e => { e.preventDefault(); openPage('#whatsnew'); };
$('open-settings').onclick = e => { e.preventDefault(); openPage('#settings'); };

(async () => {
  const { settings } = await getConfig();
  applyTheme(settings);
  $('t-auto').checked = settings.autoGroup;
  $('t-sleep').checked = settings.sleepEnabled;
  $('t-min').textContent = settings.sleepMinutes;
  const flip = (key, el, on, off) => async () => { const c = await getConfig(); c.settings[key] = el.checked; await saveConfig({ settings: c.settings }); toast(el.checked ? on : off); };
  $('t-auto').onchange = flip('autoGroup', $('t-auto'), 'Auto-sort is on', 'Auto-sort is off');
  $('t-sleep').onchange = flip('sleepEnabled', $('t-sleep'), 'Auto-sleep is on', 'Auto-sleep is off');
  refresh();
})();

// Keep every open ElevenTabs page in sync when the theme changes anywhere.
chrome.storage.onChanged.addListener(async (ch, area) => {
  if (area === 'local' && ch.settings) { const { settings } = await getConfig(); applyTheme(settings); }
});

// ---------- Saved (own bookmarks, sorted into categories) ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const col = c => ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'].includes(c) ? c : 'grey';
let showAllCats = false, cur = null, lib = null, chosen = '', suggested = '', fav = false, existing = null;

function showPane(name) {
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.p === name));
  $('pane-tabs').classList.toggle('on', name === 'tabs'); $('pane-saved').classList.toggle('on', name === 'saved');
  chrome.storage.local.set({ popupPane: name });
  if (name === 'saved') loadSaved();
}
document.querySelector('.tabbar').onclick = e => { const b = e.target.closest('button'); if (b) showPane(b.dataset.p); };

function renderCats() {
  const use = id => lib.items.filter(i => i.cat === id).length;
  const ranked = [...lib.cats].sort((a, b) => (b.id === chosen) - (a.id === chosen) || (b.id === suggested) - (a.id === suggested) || use(b.id) - use(a.id));
  const shown = showAllCats ? ranked : ranked.slice(0, 6);
  if (!showAllCats && chosen && !shown.some(c => c.id === chosen) && lib.cats.some(c => c.id === chosen)) shown.push(lib.cats.find(c => c.id === chosen));
  const chips = shown.map(c => `<button class="cc ${chosen === c.id ? 'on' : ''} ${suggested === c.id && !existing ? 'sug' : ''}" data-c="${esc(c.id)}"><span class="dot d-${col(c.color)}"></span>${esc(c.name)}</button>`).join('');
  const more = ranked.length > 6 ? `<button class="cc add" id="cc-more">${showAllCats ? 'Fewer' : `+${ranked.length - 6} more`}</button>` : '';
  $('cats').innerHTML = chips + `<button class="cc ${chosen === '' ? 'on' : ''}" data-c=""><span class="dot" style="background:var(--faint)"></span>Unsorted</button>` + more + `<button class="cc add" id="cc-add">${icon('plus', 12)}New</button>`;
  $('cat-hint').textContent = suggested && !existing ? 'auto-picked for this site' : '';
}
function renderSaveState() {
  $('already').classList.toggle('on', !!existing);
  if (existing) { const c = lib.cats.find(x => x.id === existing.cat); $('already-t').textContent = 'Saved' + (c ? ' in ' + c.name : '') + ' · you can change it below'; }
  $('save-label').textContent = existing ? 'Update' : 'Save this page';
  $('remove-saved').hidden = !existing;
  $('cur-star').classList.toggle('on', fav);
  $('cur-star').innerHTML = icon('star', 18);
}
async function loadSaved() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  cur = tab && isWebUrl(tab.url) ? tab : null;
  lib = await loadLib(); const cfg = await getConfig();
  $('mirror').checked = !!cfg.settings.mirrorChrome && await chrome.permissions.contains({ permissions: ['bookmarks'] });
  $('saved-cnt').textContent = lib.items.length; $('lib-n').textContent = lib.items.length;
  $('save-page').disabled = !cur;
  if (cur) {
    $('cur-fav').src = faviconUrl(cur.url); $('cur-title').textContent = cur.title || hostOf(cur.url); $('cur-host').textContent = hostOf(cur.url);
    existing = findByUrl(lib, cur.url);
    suggested = suggestCat(cur.url, lib, cfg.categories);
    chosen = existing ? existing.cat : suggested; fav = existing ? existing.fav : false;
    $('note').value = existing?.note || '';
  } else {
    $('cur-fav').removeAttribute('src'); $('cur-title').textContent = 'This page can\u2019t be saved'; $('cur-host').textContent = 'Only web pages (http/https)';
    existing = null; suggested = ''; chosen = ''; fav = false;
  }
  renderCats(); renderSaveState(); search();
}
$('cats').onclick = async e => {
  const b = e.target.closest('.cc'); if (!b) return;
  if (b.id === 'cc-more') { showAllCats = !showAllCats; renderCats(); return; }
  if (b.id === 'cc-add') { $('newcat').classList.add('on'); $('newcat-in').focus(); return; }
  chosen = b.dataset.c; renderCats();
};
const addNewCat = async () => {
  const n = $('newcat-in').value.trim(); if (!n) return;
  const c = await addCat(n); lib = await loadLib(); chosen = c?.id || ''; $('newcat-in').value = ''; $('newcat').classList.remove('on'); renderCats();
};
$('newcat-ok').onclick = addNewCat; $('newcat-in').onkeydown = e => { if (e.key === 'Enter') addNewCat(); };
$('cur-star').onclick = () => { fav = !fav; renderSaveState(); };
$('mirror').onchange = async () => {
  const c = await getConfig();
  if ($('mirror').checked) {
    const ok = await chrome.permissions.request({ permissions: ['bookmarks'] }).catch(() => false);
    if (!ok) { $('mirror').checked = false; toast('Permission not granted'); return; }
  }
  c.settings.mirrorChrome = $('mirror').checked; await saveConfig({ settings: c.settings });
  toast($('mirror').checked ? 'New saves also go to Chrome bookmarks' : 'Saving only inside ElevenTabs');
};
$('save-page').onclick = async () => {
  if (!cur) return;
  const r = await saveItem({ url: cur.url, title: cur.title, cat: chosen, note: $('note').value.trim(), fav }, { mirror: $('mirror').checked });
  const name = lib.cats.find(c => c.id === chosen)?.name || 'Unsorted';
  toast(r.status === 'added' ? `Saved to ${name}` : 'Updated'); loadSaved();
};
$('save-all').onclick = async () => {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const r = await saveMany(tabs, { mirror: $('mirror').checked });
  toast(r.added ? `Saved ${plural(r.added, 'page')}${r.existed ? ` · ${r.existed} already saved` : ''}` : 'Everything here is already saved'); loadSaved();
};
$('remove-saved').onclick = async () => { if (existing) { await removeItems([existing.id]); toast('Removed from Saved'); loadSaved(); } };
$('note').onkeydown = e => { if (e.key === 'Enter') $('save-page').click(); };
async function search() {
  const q = $('find').value.trim().toLowerCase();
  const items = (q ? lib.items.filter(i => (i.title + ' ' + i.url + ' ' + i.note).toLowerCase().includes(q)) : [...lib.items.filter(i => i.fav), ...lib.items.filter(i => !i.fav)]).slice(0, 4);
  $('hits').innerHTML = items.length ? items.map(i => { const c = lib.cats.find(x => x.id === i.cat); return `<a class="hit" href="${esc(i.url)}" data-u="${esc(i.url)}"><img src="${esc(faviconUrl(i.url))}" alt=""><span class="grow"><div class="tt ellipsis">${esc(i.title)}</div><div class="hh ellipsis">${esc(hostOf(i.url))}${i.fav ? ' · ★' : ''}</div></span>${c ? `<span class="dot d-${col(c.color)}" title="${esc(c.name)}"></span>` : ''}</a>`; }).join('') : `<div class="tiny muted" style="padding:10px 8px">${q ? 'Nothing matches.' : 'Nothing saved yet. Save this page to start.'}</div>`;
}
$('find').oninput = search;
$('hits').onclick = e => { const a = e.target.closest('.hit'); if (!a) return; e.preventDefault(); chrome.tabs.create({ url: a.dataset.u }); window.close(); };
$('open-lib').onclick = () => openPage('#library');
chrome.storage.local.get('popupPane').then(({ popupPane }) => { lib0(); if (popupPane === 'saved') showPane('saved'); });
async function lib0() { const l = await loadLib(); $('saved-cnt').textContent = l.items.length; }
