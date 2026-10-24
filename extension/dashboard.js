import { getConfig, saveConfig, sanitizeConfig, categorize, hostOf, isWebUrl, normUrl, isPrivate, faviconUrl, COLORS, DEFAULT_CATEGORIES, todayKey } from './lib/config.js';
import { hydrateIcons, icon } from './lib/icons.js';
import { THEMES, AUTO_SCHEDULE, applyTheme, resolveTheme, customTheme } from './lib/themes.js';
import { CHANGELOG } from './lib/changelog.js';

hydrateIcons();
const $ = id => document.getElementById(id);
const send = (type, payload) => chrome.runtime.sendMessage({ type, payload });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const col = c => COLORS.includes(c) ? c : 'grey';
const tone = c => `var(--g-${col(c)})`;
const fav = url => esc(faviconUrl(url));
const OTHER = { id: '__none', name: 'Uncategorised', color: 'grey' };
let tt;
function toast(msg, ic = 'check') { const t = $('toast'); t.innerHTML = icon(ic, 15); t.append(msg); t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2800); }
function dur(s) { s = Math.round(s); if (s < 60) return s ? s + 's' : '0m'; const m = Math.round(s / 60); if (m < 60) return m + 'm'; return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm'; }
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const empty = (ic, text) => `<div class="empty">${icon(ic, 22)}${esc(text)}</div>`;

// ---------- optional permissions ----------
const has = p => chrome.permissions.contains({ permissions: [p] });
async function ask(p) {
  const ok = await chrome.permissions.request({ permissions: [p] }).catch(() => false);
  if (!ok) toast('Permission not granted', 'lock');
  return ok;
}
function gateHtml(p, why) {
  return `<div class="gate">${icon('key-round', 22)}<div class="grow"><b>Allow ${p} access</b><div class="small muted">${esc(why)} Chrome will ask you to confirm. You can turn it off again under Privacy &amp; security.</div></div><button class="btn btn-gold" data-grant="${p}">${icon('check', 16)}Allow</button></div>`;
}
document.addEventListener('click', async e => {
  const g = e.target.closest('[data-grant]');
  if (g && await ask(g.dataset.grant)) { toast('Access granted'); route(); }
});

// ---------- routing ----------
const loaders = {};
function route() {
  const id = (location.hash || '#overview').slice(1) || 'overview';
  document.querySelectorAll('main > section').forEach(s => s.classList.toggle('active', s.id === id));
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('active', a.dataset.s === id));
  window.scrollTo(0, 0);
  loaders[id]?.();
}
window.addEventListener('hashchange', route);

async function act(type, fmt) {
  const r = await send(type);
  toast(r?.ok ? fmt(r) : 'Error: ' + (r?.error || 'unknown'));
  route();
}
$('w-sort').onclick = () => act('groupAll', r => `Sorted ${plural(r.grouped, 'tab')} into groups`);
$('o-sort').onclick = () => act('groupAll', r => `Sorted ${plural(r.grouped, 'tab')} into groups`);
$('o-dupes').onclick = () => act('closeDuplicates', r => `Closed ${plural(r.closed, 'duplicate')}`);
$('o-sleep').onclick = () => act('sleepNow', r => `${plural(r.slept, 'tab')} asleep`);

// ---------- overview ----------
loaders.overview = async () => {
  await send('flush');
  const { categories, settings } = await getConfig();
  const s = await send('stats');
  $('k-tabs').textContent = s.tabs; $('k-tabs-sub').textContent = `across ${plural(s.windows, 'window')}`;
  $('k-sleep').textContent = s.sleeping; $('k-dupes').textContent = s.duplicates;
  $('o-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const { time = {} } = await chrome.storage.local.get('time');
  const days = [...Array(7)].map((_, i) => todayKey(new Date(Date.now() - (6 - i) * 864e5)));
  const visible = h => !isPrivate('https://' + h + '/', settings);
  const sum = d => Object.entries(time[d] || {}).filter(([h]) => visible(h)).reduce((a, [, v]) => a + v, 0);
  $('k-today').textContent = dur(sum(days[6]));
  $('k-week').textContent = `${dur(days.reduce((a, d) => a + sum(d), 0))} this week`;
  const byCat = {}, byHost = {}, perDay = days.map(() => ({}));
  days.forEach((d, i) => {
    for (const [h, secs] of Object.entries(time[d] || {})) {
      if (!visible(h)) continue;
      const c = categorize('https://' + h + '/', categories) || OTHER;
      (byCat[c.name] = byCat[c.name] || { c, secs: 0 }).secs += secs;
      byHost[h] = (byHost[h] || 0) + secs;
      (perDay[i][c.name] = perDay[i][c.name] || { c, secs: 0 }).secs += secs;
    }
  });
  const cats = Object.values(byCat).sort((a, b) => b.secs - a.secs);
  const max = cats[0]?.secs || 1;
  $('o-cats').innerHTML = cats.length ? cats.map(({ c, secs }) => `<div class="catrow"><span class="row" style="gap:9px"><span class="dot d-${col(c.color)}"></span>${esc(c.name)}</span><div class="track"><span style="width:${(secs / max * 100).toFixed(1)}%;background:${tone(c.color)}"></span></div><span class="v">${dur(secs)}</span></div>`).join('')
    : empty('clock', 'No time recorded yet. Stats appear as you browse.');
  const dmax = Math.max(1, ...perDay.map(p => Object.values(p).reduce((a, b) => a + b.secs, 0)));
  $('o-days').innerHTML = perDay.map((p, i) => {
    const tot = Object.values(p).reduce((a, b) => a + b.secs, 0);
    const segs = Object.values(p).sort((a, b) => b.secs - a.secs).map(({ c, secs }) => `<span title="${esc(c.name)} · ${dur(secs)}" style="height:${Math.max(2, secs / dmax * 140).toFixed(1)}px;background:${tone(c.color)}"></span>`).join('');
    const label = new Date(days[i] + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' });
    return `<div class="day"><span class="tot">${tot ? dur(tot) : ''}</span><div class="stack">${segs}</div><span class="lbl">${esc(label)}</span></div>`;
  }).join('');
  const top = Object.entries(byHost).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const tmax = top[0]?.[1] || 1;
  $('o-top').innerHTML = top.length ? top.map(([h, secs]) => { const c = categorize('https://' + h + '/', categories) || OTHER; return `<div class="list-row site-row"><img class="favicon" src="${fav('https://' + h)}" alt=""><div class="grow"><div class="ellipsis">${esc(h)}</div><div class="track" style="margin-top:6px;height:4px"><span style="width:${(secs / tmax * 100).toFixed(1)}%;background:${tone(c.color)}"></span></div></div><span class="v">${dur(secs)}</span></div>`; }).join('')
    : empty('clock', 'Nothing yet.');
  if (!(await has('history'))) { $('o-visits').innerHTML = gateHtml('history', 'See your most visited sites this week.'); return; }
  const items = await chrome.history.search({ text: '', startTime: Date.now() - 7 * 864e5, maxResults: 5000 });
  const vh = {};
  for (const it of items) { if (!isWebUrl(it.url) || isPrivate(it.url, settings)) continue; const h = hostOf(it.url); if (h) vh[h] = (vh[h] || 0) + 1; }
  const vtop = Object.entries(vh).sort((a, b) => b[1] - a[1]).slice(0, 8);
  $('o-visits').innerHTML = vtop.length ? vtop.map(([h, n]) => { const c = categorize('https://' + h + '/', categories) || OTHER; return `<div class="list-row site-row"><img class="favicon" src="${fav('https://' + h)}" alt=""><span class="grow ellipsis">${esc(h)}</span><span class="chip"><span class="dot d-${col(c.color)}"></span>${esc(c.name)}</span><span class="v" style="width:70px;text-align:right">${plural(n, 'page')}</span></div>`; }).join('')
    : empty('globe', 'No history this week.');
};

// ---------- open tabs ----------
let tabGroupsCache = {};
loaders.tabs = async () => {
  const { categories } = await getConfig();
  const tabs = (await chrome.tabs.query({})).filter(t => isWebUrl(t.url));
  const q = $('t-filter').value.trim().toLowerCase();
  const groups = {};
  for (const t of tabs) {
    if (q && !((t.title || '') + ' ' + t.url).toLowerCase().includes(q)) continue;
    const c = categorize(t.url, categories) || OTHER;
    (groups[c.name] = groups[c.name] || { c, tabs: [] }).tabs.push(t);
  }
  tabGroupsCache = groups;
  const order = [...categories.map(c => c.name), OTHER.name];
  $('t-list').innerHTML = order.filter(n => groups[n]).map(n => {
    const { c, tabs } = groups[n];
    return `<div class="card tabgroup"><div class="card-head"><span class="dot d-${col(c.color)}" style="width:10px;height:10px"></span><h3>${esc(c.name)}</h3><span class="chip">${tabs.length}</span><span class="grow"></span><button class="btn btn-sm btn-quiet" data-close-cat="${esc(n)}">${icon('x', 14)}Close all</button></div>
      ${tabs.map(t => `<div class="list-row tab-row"><img class="favicon" src="${esc(t.favIconUrl && t.favIconUrl.startsWith('data:') ? t.favIconUrl : faviconUrl(t.url))}" alt=""><a href="#" class="grow ellipsis t" style="color:inherit" data-go="${t.id}" data-w="${t.windowId}">${esc(t.title || t.url)}</a>${t.discarded ? `<span class="chip">${icon('moon', 11)}asleep</span>` : ''}<span class="h ellipsis">${esc(hostOf(t.url))}</span><button class="btn btn-sm btn-quiet btn-icon x" data-close="${t.id}" title="Close tab">${icon('x', 14)}</button></div>`).join('')}</div>`;
  }).join('') || empty('search', 'No tabs match.');
};
$('t-list').onclick = async e => {
  const go = e.target.closest('[data-go]'), cl = e.target.closest('[data-close]'), cc = e.target.closest('[data-close-cat]');
  if (go) { e.preventDefault(); await chrome.tabs.update(+go.dataset.go, { active: true }); await chrome.windows.update(+go.dataset.w, { focused: true }); }
  if (cl) { await chrome.tabs.remove(+cl.dataset.close); loaders.tabs(); }
  if (cc) {
    const ids = tabGroupsCache[cc.dataset.closeCat].tabs.map(t => t.id);
    if (confirm(`Close ${plural(ids.length, 'tab')} in "${cc.dataset.closeCat}"?\n\nTip: save a session first if you may need them again.`)) { await chrome.tabs.remove(ids); loaders.tabs(); }
  }
};
$('t-filter').oninput = () => loaders.tabs();

// ---------- sessions ----------
loaders.sessions = async () => {
  const { sessions = [] } = await chrome.storage.local.get('sessions');
  $('s-list').innerHTML = sessions.length ? sessions.map(s => {
    const hosts = [...new Set(s.tabs.map(t => hostOf(t.url)))];
    return `<div class="card sess"><div class="icons">${hosts.slice(0, 6).map(h => `<img src="${fav('https://' + h)}" alt="">`).join('')}</div>
      <div class="grow"><b>${esc(s.name)}</b><div class="small muted">${esc(new Date(s.created).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }))} · ${plural(s.tabs.length, 'tab')} · ${esc(hosts.slice(0, 4).join(', '))}${hosts.length > 4 ? '…' : ''}</div></div>
      <button class="btn btn-sm btn-quiet" data-rename="${esc(s.id)}">${icon('pencil', 14)}Rename</button><button class="btn btn-sm btn-quiet btn-danger" data-del="${esc(s.id)}">${icon('trash-2', 14)}</button><button class="btn btn-sm btn-gold" data-restore="${esc(s.id)}">${icon('external-link', 14)}Open</button></div>`;
  }).join('') : empty('archive-restore', 'No saved sessions yet. Use "Save window as a session" in the toolbar popup.');
};
$('s-list').onclick = async e => {
  const r = e.target.closest('[data-restore]'), d = e.target.closest('[data-del]'), n = e.target.closest('[data-rename]');
  if (r) { const x = await send('restoreSession', { id: r.dataset.restore }); toast(`Opened ${plural(x.restored, 'tab')}`); return; }
  if (!d && !n) return;
  const id = (d || n).dataset.del || (d || n).dataset.rename;
  const { sessions = [] } = await chrome.storage.local.get('sessions');
  if (d && confirm('Delete this saved session? The tabs in it are not affected.')) await chrome.storage.local.set({ sessions: sessions.filter(s => s.id !== id) });
  if (n) { const s = sessions.find(s => s.id === id); const name = prompt('Session name', s.name); if (name) { s.name = name.slice(0, 60); await chrome.storage.local.set({ sessions }); } }
  loaders.sessions();
};

// ---------- bookmarks ----------
function flatten(nodes, path = [], out = { links: [], folders: 0 }) {
  for (const n of nodes) {
    if (n.url) out.links.push({ ...n, path: path.join(' / ') });
    else { if (path.length) out.folders++; flatten(n.children || [], n.title ? [...path, n.title] : path, out); }
  }
  return out;
}
loaders.bookmarks = async () => {
  const ok = await has('bookmarks');
  $('b-gate').innerHTML = ok ? '' : gateHtml('bookmarks', 'Needed to read your bookmarks and build the sorted copy. ElevenTabs never deletes or moves them.');
  $('b-body').hidden = !ok; $('b-backup').disabled = !ok; $('b-sort').disabled = !ok;
  if (!ok) return;
  const { categories } = await getConfig();
  const { links, folders } = flatten(await chrome.bookmarks.getTree());
  const seen = new Set(); let dupes = 0; const byCat = {};
  for (const b of links) {
    const k = normUrl(b.url); if (seen.has(k)) { dupes++; continue; } seen.add(k);
    const c = categorize(b.url, categories) || OTHER;
    (byCat[c.name] = byCat[c.name] || { c, n: 0 }).n++;
  }
  $('b-total').textContent = links.length; $('b-folders').textContent = folders; $('b-dupes').textContent = dupes; $('b-loose').textContent = byCat[OTHER.name]?.n || 0;
  const rows = Object.values(byCat).sort((a, b) => b.n - a.n); const max = rows[0]?.n || 1;
  $('b-cats').innerHTML = rows.map(({ c, n }) => `<div class="catrow"><span class="row" style="gap:9px">${icon('folder', 15)}${esc(c.name)}</span><div class="track"><span style="width:${(n / max * 100).toFixed(1)}%;background:${tone(c.color)}"></span></div><span class="v">${n}</span></div>`).join('') || empty('bookmark', 'No bookmarks yet.');
};
$('b-backup').onclick = async () => {
  const tree = await chrome.bookmarks.getTree();
  const walk = (nodes, ind) => nodes.map(n => n.url
    ? `${ind}<DT><A HREF="${esc(n.url)}" ADD_DATE="${Math.round((n.dateAdded || 0) / 1000)}">${esc(n.title)}</A>`
    : `${ind}<DT><H3>${esc(n.title)}</H3>\n${ind}<DL><p>\n${walk(n.children || [], ind + '    ')}\n${ind}</DL><p>`).join('\n');
  const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n${walk(tree[0].children || [], '    ')}\n</DL><p>\n`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  a.download = `bookmarks-backup-${todayKey()}.html`; a.click();
  toast('Backup saved to Downloads. Restore it from chrome://bookmarks → Import.', 'download');
};
$('b-sort').onclick = async () => {
  const { categories } = await getConfig();
  const { links } = flatten(await chrome.bookmarks.getTree());
  if (!confirm(`Create a new folder "ElevenTabs – Sorted" in Other bookmarks with copies of your ${links.length} bookmarks, arranged by category?\n\nYour existing bookmarks stay exactly where they are.`)) return;
  const tree = await chrome.bookmarks.getTree();
  const other = tree[0].children.find(c => c.id === '2') || tree[0].children[tree[0].children.length - 1];
  const root = await chrome.bookmarks.create({ parentId: other.id, title: `ElevenTabs – Sorted ${todayKey()}` });
  const folders = {}; const seen = new Set(); let n = 0;
  for (const b of links) {
    const k = normUrl(b.url); if (seen.has(k)) continue; seen.add(k);
    const c = categorize(b.url, categories) || OTHER;
    if (!folders[c.name]) folders[c.name] = await chrome.bookmarks.create({ parentId: root.id, title: c.name });
    await chrome.bookmarks.create({ parentId: folders[c.name].id, title: b.title, url: b.url }); n++;
  }
  toast(`Sorted copy created with ${plural(n, 'bookmark')}`, 'folder-tree');
};

// ---------- history ----------
let junk = [];
loaders.history = async () => {
  const ok = await has('history');
  $('h-gate').innerHTML = ok ? '' : gateHtml('history', 'Needed to find and delete junk pages from your history.');
  $('h-body').hidden = !ok;
};
$('h-scan').onclick = async () => {
  const { settings } = await getConfig();
  const pats = settings.junkPatterns.map(p => p.toLowerCase()).filter(Boolean);
  $('h-list').innerHTML = `<div class="empty">${icon('search', 22)}Scanning…</div>`;
  const items = await chrome.history.search({ text: '', startTime: Date.now() - 90 * 864e5, maxResults: 100000 });
  junk = items.filter(it => { const u = it.url.toLowerCase(); return pats.some(p => u.includes(p)); });
  renderJunk();
};
function renderJunk() {
  const all = $('h-all').checked;
  $('h-count').textContent = `${plural(junk.length, 'junk page')} found`;
  $('h-del').disabled = !junk.length;
  $('h-list').innerHTML = junk.length ? junk.slice(0, 2000).map((it, i) => `<label class="list-row hist-row" style="cursor:pointer"><input type="checkbox" data-i="${i}" ${all ? 'checked' : ''}><img class="favicon" src="${fav(it.url)}" alt=""><span class="grow ellipsis">${esc(it.title || it.url)}</span><span class="small muted ellipsis" style="width:200px;text-align:right">${esc(hostOf(it.url))}</span><span class="mono tiny muted" style="width:90px;text-align:right">${esc(new Date(it.lastVisitTime).toLocaleDateString())}</span></label>`).join('')
    + (junk.length > 2000 ? `<div class="small muted" style="padding:10px">…and ${junk.length - 2000} more (included when "Select all" is ticked)</div>` : '')
    : empty('sparkles', 'No junk found. Your history is clean.');
}
$('h-all').onchange = renderJunk;
$('h-del').onclick = async () => {
  const boxes = [...document.querySelectorAll('#h-list input[data-i]')];
  let picked = boxes.filter(b => b.checked).map(b => junk[+b.dataset.i]);
  if ($('h-all').checked && junk.length > 2000) picked = picked.concat(junk.slice(2000));
  if (!picked.length || !confirm(`Delete ${plural(picked.length, 'page')} from your Chrome history?\n\nThis can't be undone.`)) return;
  for (const it of picked) await chrome.history.deleteUrl({ url: it.url });
  toast(`Deleted ${plural(picked.length, 'page')} from history`, 'trash-2');
  $('h-scan').click();
};
$('h-site-del').onclick = async () => {
  const site = $('h-site').value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!site) return;
  const items = await chrome.history.search({ text: site, startTime: 0, maxResults: 100000 });
  const hits = items.filter(it => hostOf(it.url).endsWith(site));
  if (!hits.length) return toast('Nothing found for ' + site, 'search');
  if (!confirm(`Delete ${plural(hits.length, 'page')} from ${site} from your history?`)) return;
  for (const it of hits) await chrome.history.deleteUrl({ url: it.url });
  toast(`Deleted ${plural(hits.length, 'page')} from ${site}`, 'trash-2');
};

// ---------- settings (auto-saved) ----------
let draft = null;
async function fillSettings() {
  draft = await getConfig();
  document.querySelectorAll('[data-k]').forEach(el => {
    const v = draft.settings[el.dataset.k];
    if (el.type === 'checkbox') el.checked = !!v;
    else if (el.dataset.list) el.value = (v || []).join('\n');
    else el.value = v ?? '';
  });
}
function readSettings() {
  document.querySelectorAll('[data-k]').forEach(el => {
    const k = el.dataset.k;
    if (el.type === 'checkbox') draft.settings[k] = el.checked;
    else if (el.type === 'number') draft.settings[k] = +el.value;
    else if (el.dataset.list) draft.settings[k] = el.value.split('\n').map(s => s.trim()).filter(Boolean);
    else draft.settings[k] = el.value.trim();
  });
}
async function persist(msg = 'Saved') {
  readSettings(); readCats();
  const clean = sanitizeConfig(draft);
  await saveConfig(clean);
  draft = clean;
  applyTheme(clean.settings);
  toast(msg);
}
document.querySelectorAll('[data-k]').forEach(el => el.addEventListener('change', () => persist()));
loaders.settings = async () => { await fillSettings(); renderCats(); };
function renderCats() {
  $('c-list').innerHTML = draft.categories.map((c, i) => `<div class="catedit" data-i="${i}">
    <div class="mv"><button class="btn btn-sm btn-quiet" data-up="${i}" title="Move up">${icon('chevron-up', 14)}</button><button class="btn btn-sm btn-quiet" data-down="${i}" title="Move down">${icon('chevron-down', 14)}</button></div>
    <div style="position:relative"><span class="dot d-${col(c.color)}" style="position:absolute;left:12px;top:15px"></span><input type="text" data-f="name" value="${esc(c.name)}" maxlength="40" style="padding-left:28px"></div>
    <select data-f="color">${COLORS.map(x => `<option value="${x}" ${x === c.color ? 'selected' : ''}>${x[0].toUpperCase() + x.slice(1)}</option>`).join('')}</select>
    <textarea data-f="patterns" rows="2">${esc((c.patterns || []).join(', '))}</textarea>
    <button class="btn btn-sm btn-quiet btn-danger btn-icon" data-rm="${i}" title="Remove category">${icon('trash-2', 15)}</button></div>`).join('');
}
function readCats() {
  document.querySelectorAll('.catedit').forEach(row => {
    const c = draft.categories[+row.dataset.i]; if (!c) return;
    c.name = row.querySelector('[data-f=name]').value.trim() || 'Untitled';
    c.color = row.querySelector('[data-f=color]').value;
    c.patterns = row.querySelector('[data-f=patterns]').value.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  });
}
$('c-list').onclick = e => {
  const up = e.target.closest('[data-up]'), dn = e.target.closest('[data-down]'), rm = e.target.closest('[data-rm]');
  if (!up && !dn && !rm) return;
  readCats();
  const a = draft.categories;
  if (up) { const i = +up.dataset.up; if (i > 0) [a[i - 1], a[i]] = [a[i], a[i - 1]]; }
  if (dn) { const i = +dn.dataset.down; if (i < a.length - 1) [a[i + 1], a[i]] = [a[i], a[i + 1]]; }
  if (rm && confirm(`Remove the "${a[+rm.dataset.rm].name}" category?`)) a.splice(+rm.dataset.rm, 1);
  renderCats();
};
$('c-list').onchange = e => { if (e.target.dataset.f === 'color') { readCats(); renderCats(); } };
$('c-add').onclick = () => { readCats(); draft.categories.push({ id: crypto.randomUUID(), name: 'New category', color: 'blue', patterns: [] }); renderCats(); };
$('c-reset').onclick = () => { if (confirm('Reset categories to the defaults?')) { draft.categories = structuredClone(DEFAULT_CATEGORIES); renderCats(); } };
$('c-save').onclick = () => persist('Settings saved');
$('c-export').onclick = async () => {
  const cfg = await getConfig();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'eleventabs', version: 2, ...cfg }, null, 2)], { type: 'application/json' }));
  a.download = 'eleventabs-settings.json'; a.click();
  toast('Settings exported', 'download');
};
$('c-import').onchange = async e => {
  try {
    const file = e.target.files[0];
    if (!file || file.size > 512 * 1024) throw new Error('File too large');
    const cfg = JSON.parse(await file.text());
    if (!Array.isArray(cfg.categories)) throw new Error('No categories in file');
    await saveConfig(sanitizeConfig(cfg));
    toast('Settings imported'); loaders.settings();
  } catch (err) { toast('Import failed: ' + err.message, 'x'); }
  e.target.value = '';
};

// ---------- privacy ----------
async function permChip(p) {
  const on = await has(p);
  $('p-' + p).innerHTML = on
    ? `<span class="row" style="gap:8px"><span class="chip chip-ok">Granted</span><button class="btn btn-sm btn-quiet" data-revoke="${p}">Turn off</button></span>`
    : `<button class="btn btn-sm" data-grant="${p}">${icon('key-round', 14)}Allow</button>`;
}
loaders.privacy = async () => { await fillSettings(); await permChip('history'); await permChip('bookmarks'); };
document.addEventListener('click', async e => {
  const r = e.target.closest('[data-revoke]');
  if (r) { await chrome.permissions.remove({ permissions: [r.dataset.revoke] }); toast('Access removed', 'lock'); loaders.privacy(); }
});
$('p-junk-edit').onclick = () => { $('p-junk-wrap').hidden = !$('p-junk-wrap').hidden; };
$('p-wipe').onclick = async () => {
  if (!confirm('Erase all ElevenTabs data (time stats, sessions, settings)?\n\nYour tabs, bookmarks and Chrome history are NOT affected.')) return;
  await send('wipe'); localStorage.removeItem('et-theme'); draft = await getConfig(); applyTheme(draft.settings);
  toast('ElevenTabs data erased', 'trash-2'); route();
};

// ---------- appearance ----------
const MODE_HINT = { system: 'Eleven Gold when your computer is in dark mode, Paper in light mode', auto: 'Changes through the day, see the schedule below', fixed: 'Pick one theme below' };
const PRESETS = ['#f0b93f', '#6d9bff', '#4fd1b5', '#ff8a5c', '#86c983', '#e0718d', '#a78bfa', '#22d3ee', '#f43f5e'];
async function saveTheme(patch) {
  draft = await getConfig();
  Object.assign(draft.settings, patch);
  await saveConfig({ settings: draft.settings });
  applyTheme(draft.settings);
  loaders.appearance();
}
loaders.appearance = async () => {
  draft = await getConfig();
  const st = draft.settings, cur = resolveTheme(st).id;
  document.querySelectorAll('#mode-seg button').forEach(b => b.classList.toggle('on', b.dataset.m === st.themeMode));
  $('mode-hint').textContent = MODE_HINT[st.themeMode] || '';
  $('auto-sched').hidden = st.themeMode !== 'auto';
  $('mode-row').style.borderBottom = st.themeMode === 'auto' ? '' : '0';
  $('mode-row').style.paddingBottom = st.themeMode === 'auto' ? '' : '0';
  $('auto-sched').innerHTML = st.themeMode === 'auto' ? AUTO_SCHEDULE.map(x => `<span class="chip ${x.id === cur ? 'chip-gold' : ''}">${esc(x.label)} · ${String(x.from).padStart(2, '0')}:00 → ${esc(THEMES[x.id].name)}</span>`).join('') : '';
  const card = (id, t) => `<button class="tcard ${st.themeMode === 'fixed' && st.themeId === id ? 'on' : ''}" data-theme-id="${id}">
      <div class="tprev" style="background:${t.bg}"><div class="side" style="background:${t.base === 'dark' ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.04)'}"></div>
        <div class="main"><div class="bar" style="width:70%;background:${t.base === 'dark' ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.12)'}"></div><div class="bar" style="width:45%;background:${t.base === 'dark' ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.07)'}"></div>
        <div class="bar" style="width:85%;background:linear-gradient(90deg, ${t.accent[0]}, ${t.accent[1]}, ${t.accent[2]})"></div><div class="btnp" style="background:linear-gradient(135deg, ${t.accent[0]}, ${t.accent[1]} 45%, ${t.accent[2]})"></div></div></div>
      <div class="tmeta"><b>${esc(t.name)}</b><span class="grow"></span><span class="chip">${t.base}</span>${cur === id && st.themeMode !== 'system' ? `<span class="chip chip-gold">${icon('check', 11)}On</span>` : ''}</div></button>`;
  $('theme-grid').innerHTML = Object.entries(THEMES).map(([id, t]) => card(id, t)).join('');
  const ct = st.customTheme || { base: 'dark', accent: '#f0b93f' };
  document.querySelectorAll('#custom-base button').forEach(b => b.classList.toggle('on', b.dataset.b === ct.base));
  $('custom-accent').value = ct.accent;
  $('custom-presets').innerHTML = PRESETS.map(c => `<span class="sw" data-c="${c}" title="${c}" style="width:22px;height:22px;border-radius:50%;background:${c};cursor:pointer;display:inline-block;box-shadow:0 0 0 ${c === ct.accent ? 2 : 1}px ${c === ct.accent ? 'var(--text)' : 'var(--line-2)'}"></span>`).join('');
  $('custom-use').textContent = st.themeMode === 'fixed' && st.themeId === 'custom' ? 'Using custom' : 'Use custom';
};
$('mode-seg').onclick = e => { const b = e.target.closest('[data-m]'); if (b) saveTheme({ themeMode: b.dataset.m }); };
$('theme-grid').onclick = e => { const c = e.target.closest('[data-theme-id]'); if (c) { saveTheme({ themeMode: 'fixed', themeId: c.dataset.themeId }); toast(THEMES[c.dataset.themeId].name + ' applied', 'sparkles'); } };
const setCustom = patch => { const ct = { ...(draft.settings.customTheme || {}), ...patch }; saveTheme({ customTheme: ct, themeMode: 'fixed', themeId: 'custom' }); };
$('custom-base').onclick = e => { const b = e.target.closest('[data-b]'); if (b) setCustom({ base: b.dataset.b }); };
$('custom-accent').onchange = e => setCustom({ accent: e.target.value });
$('custom-presets').onclick = e => { const c = e.target.closest('[data-c]'); if (c) setCustom({ accent: c.dataset.c }); };
$('custom-use').onclick = () => setCustom({});

// ---------- what's new ----------
const VERSION = chrome.runtime.getManifest().version;
$('nav-ver').textContent = 'ElevenTabs v' + VERSION;
loaders.whatsnew = () => {
  $('wn-ver').textContent = 'You have v' + VERSION;
  $('wn-list').innerHTML = CHANGELOG.map(r => `<div class="card wn"><div class="row"><span class="chip ${r.version === VERSION ? 'chip-gold' : ''} mono">v${esc(r.version)}</span>${r.version === VERSION ? '<span class="chip chip-ok">Installed</span>' : ''}<span class="grow"></span><span class="mono tiny muted">${esc(new Date(r.date + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }))}</span></div>
    <h3 style="margin-top:12px;font:400 26px/1.1 var(--serif)">${esc(r.title)}</h3><ul>${r.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>`).join('');
};

// ---------- welcome onboarding ----------
loaders.welcome = async () => { draft = await getConfig(); $('w-name').value = draft.settings.userName; $('w-launch').checked = draft.settings.startOnLaunch; };
$('w-name').onchange = async () => { draft = await getConfig(); draft.settings.userName = $('w-name').value.trim().slice(0, 40); await saveConfig({ settings: draft.settings }); toast('Nice to meet you' + (draft.settings.userName ? ', ' + draft.settings.userName : '')); };
$('w-launch').onchange = async () => { draft = await getConfig(); draft.settings.startOnLaunch = $('w-launch').checked; await saveConfig({ settings: draft.settings }); toast('Saved'); };

(async () => { draft = await getConfig(); applyTheme(draft.settings); route(); })();

// Keep every open ElevenTabs page in sync when the theme changes anywhere.
chrome.storage.onChanged.addListener(async (ch, area) => {
  if (area === 'local' && ch.settings) { const { settings } = await getConfig(); applyTheme(settings); }
});
