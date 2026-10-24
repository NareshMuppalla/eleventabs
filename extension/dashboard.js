import { getConfig, saveConfig, categorize, hostOf, isWebUrl, normUrl, COLORS, DEFAULT_CATEGORIES, DEFAULT_SETTINGS, todayKey } from './lib/config.js';

const $ = id => document.getElementById(id);
const send = (type, payload) => chrome.runtime.sendMessage({ type, payload });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const HEX = { grey: '#5f6368', blue: '#1a73e8', red: '#d93025', yellow: '#f9ab00', green: '#188038', pink: '#d01884', purple: '#a142f4', cyan: '#007b83', orange: '#fa903e' };
const fav = url => { try { return `https://www.google.com/s2/favicons?sz=32&domain=${new URL(url).hostname}`; } catch { return ''; } };
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2600); }
function dur(s) { s = Math.round(s); if (s < 60) return s + 's'; const m = Math.round(s / 60); if (m < 60) return m + 'm'; return Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; }
const OTHER = { id: '__none', name: 'Uncategorised', color: 'grey' };

// ---------- routing ----------
const loaders = {};
function route() {
  const id = (location.hash || '#overview').slice(1) || 'overview';
  document.querySelectorAll('section').forEach(s => s.classList.toggle('active', s.id === id));
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('active', a.dataset.s === id));
  loaders[id]?.();
}
window.addEventListener('hashchange', route);

async function act(type, fmt, payload) {
  const r = await send(type, payload);
  toast(r?.ok ? fmt(r) : 'Error: ' + (r?.error || 'unknown'));
  route();
}
$('w-sort').onclick = () => act('groupAll', r => `Sorted ${r.grouped} tabs`);
$('o-sort').onclick = () => act('groupAll', r => `Sorted ${r.grouped} tabs`);
$('o-dupes').onclick = () => act('closeDuplicates', r => `Closed ${r.closed} duplicates`);
$('o-sleep').onclick = () => act('sleepNow', r => `Put ${r.slept} tabs to sleep`);

// ---------- overview ----------
loaders.overview = async () => {
  await send('flush');
  const { categories } = await getConfig();
  const s = await send('stats');
  $('k-tabs').textContent = s.tabs; $('k-sleep').textContent = s.sleeping; $('k-dupes').textContent = s.duplicates;
  const { time = {} } = await chrome.storage.local.get('time');
  const days = [...Array(7)].map((_, i) => todayKey(new Date(Date.now() - (6 - i) * 864e5)));
  $('k-today').textContent = dur(Object.values(time[days[6]] || {}).reduce((a, b) => a + b, 0));
  const byCat = {}, byHost = {}, perDay = days.map(() => ({}));
  days.forEach((d, i) => {
    for (const [h, secs] of Object.entries(time[d] || {})) {
      const c = categorize('https://' + h + '/', categories) || OTHER;
      byCat[c.name] = byCat[c.name] || { c, secs: 0 }; byCat[c.name].secs += secs;
      byHost[h] = (byHost[h] || 0) + secs;
      perDay[i][c.name] = perDay[i][c.name] || { c, secs: 0 }; perDay[i][c.name].secs += secs;
    }
  });
  const cats = Object.values(byCat).sort((a, b) => b.secs - a.secs);
  const max = cats[0]?.secs || 1;
  $('o-cats').innerHTML = cats.length ? cats.map(({ c, secs }) => `<div class="catrow"><span class="row"><span class="dot c-${esc(c.color)}"></span>${esc(c.name)}</span><div class="bar"><span style="width:${(secs / max * 100).toFixed(1)}%;background:${HEX[c.color] || '#5f6368'}"></span></div><span class="small">${dur(secs)}</span></div>`).join('') : '<p class="muted">No data yet. Time is counted while you browse with Tab Butler installed.</p>';
  $('o-cats-note').textContent = cats.length ? 'Counted only while a Chrome window is focused and you are active.' : '';
  const dmax = Math.max(1, ...perDay.map(p => Object.values(p).reduce((a, b) => a + b.secs, 0)));
  $('o-days').innerHTML = perDay.map((p, i) => {
    const tot = Object.values(p).reduce((a, b) => a + b.secs, 0);
    const segs = Object.values(p).sort((a, b) => b.secs - a.secs).map(({ c, secs }) => `<span title="${esc(c.name)} ${dur(secs)}" style="height:${(secs / dmax * 120).toFixed(1)}px;background:${HEX[c.color] || '#5f6368'}"></span>`).join('');
    const label = new Date(days[i] + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' });
    return `<div class="day"><span class="small muted">${tot ? dur(tot) : ''}</span><div class="stack">${segs}</div><span class="small">${label}</span></div>`;
  }).join('');
  const top = Object.entries(byHost).sort((a, b) => b[1] - a[1]).slice(0, 10);
  $('o-top').innerHTML = top.length ? top.map(([h, secs]) => `<tr><td><div class="row"><img class="favicon" src="${fav('https://' + h)}" alt="">${esc(h)}</div></td><td>${dur(secs)}</td></tr>`).join('') : '<tr><td class="muted">No data yet.</td></tr>';
  // visits from history
  const items = await chrome.history.search({ text: '', startTime: Date.now() - 7 * 864e5, maxResults: 5000 });
  const vh = {};
  for (const it of items) { if (!isWebUrl(it.url)) continue; const h = hostOf(it.url); if (h) vh[h] = (vh[h] || 0) + 1; }
  const vtop = Object.entries(vh).sort((a, b) => b[1] - a[1]).slice(0, 10);
  $('o-visits').innerHTML = vtop.length ? vtop.map(([h, n]) => { const c = categorize('https://' + h + '/', categories) || OTHER; return `<tr><td><div class="row"><img class="favicon" src="${fav('https://' + h)}" alt="">${esc(h)}</div></td><td style="white-space:nowrap"><span class="row small"><span class="dot c-${esc(c.color)}"></span>${esc(c.name)}</span></td><td style="white-space:nowrap">${n} ${n === 1 ? 'page' : 'pages'}</td></tr>`; }).join('') : '<tr><td class="muted">No history this week.</td></tr>';
};

// ---------- open tabs ----------
loaders.tabs = async () => {
  const { categories } = await getConfig();
  const tabs = (await chrome.tabs.query({})).filter(t => isWebUrl(t.url));
  const q = $('t-filter').value.trim().toLowerCase();
  const groups = {};
  for (const t of tabs) {
    if (q && !(t.title + ' ' + t.url).toLowerCase().includes(q)) continue;
    const c = categorize(t.url, categories) || OTHER;
    (groups[c.name] = groups[c.name] || { c, tabs: [] }).tabs.push(t);
  }
  const order = [...categories.map(c => c.name), OTHER.name];
  $('t-list').innerHTML = order.filter(n => groups[n]).map(n => {
    const { c, tabs } = groups[n];
    return `<div class="card"><div class="row" style="margin-bottom:6px"><span class="dot c-${esc(c.color)}"></span><b>${esc(c.name)}</b><span class="pill">${tabs.length}</span><span class="grow"></span><button class="small" data-close-cat="${esc(n)}">Close all ${tabs.length}</button></div>
      <table>${tabs.map(t => `<tr><td><div class="row"><img class="favicon" src="${esc(t.favIconUrl || fav(t.url))}" alt=""><a href="#" data-go="${t.id}" data-w="${t.windowId}" class="ellipsis" style="color:inherit;text-decoration:none">${esc(t.title || t.url)}</a>${t.discarded ? '<span class="pill">sleeping</span>' : ''}</div></td><td class="small muted ellipsis" style="max-width:220px">${esc(hostOf(t.url))}</td><td style="width:40px"><button class="small" data-close="${t.id}" title="Close tab">✕</button></td></tr>`).join('')}</table></div>`;
  }).join('') || '<p class="muted">No tabs match.</p>';
  $('t-list').onclick = async e => {
    const go = e.target.closest('[data-go]'), cl = e.target.closest('[data-close]'), cc = e.target.closest('[data-close-cat]');
    if (go) { e.preventDefault(); await chrome.tabs.update(+go.dataset.go, { active: true }); await chrome.windows.update(+go.dataset.w, { focused: true }); }
    if (cl) { await chrome.tabs.remove(+cl.dataset.close); loaders.tabs(); }
    if (cc) {
      const ids = groups[cc.dataset.closeCat].tabs.map(t => t.id);
      if (confirm(`Close ${ids.length} tabs in "${cc.dataset.closeCat}"? Tip: save a session first if you may need them.`)) { await chrome.tabs.remove(ids); loaders.tabs(); }
    }
  };
};
$('t-filter').oninput = () => loaders.tabs();

// ---------- sessions ----------
loaders.sessions = async () => {
  const { sessions = [] } = await chrome.storage.local.get('sessions');
  $('s-list').innerHTML = sessions.length ? sessions.map(s => `<div class="card"><div class="row"><b class="grow">${esc(s.name)}</b><span class="muted small">${new Date(s.created).toLocaleString()} · ${s.tabs.length} tabs</span>
    <button data-restore="${s.id}" class="primary">Open</button><button data-rename="${s.id}">Rename</button><button data-del="${s.id}" class="danger">Delete</button></div>
    <div class="small muted" style="margin-top:6px">${s.tabs.slice(0, 8).map(t => esc(hostOf(t.url))).join(' · ')}${s.tabs.length > 8 ? ' …' : ''}</div></div>`).join('') : '<p class="muted">No saved sessions yet.</p>';
  $('s-list').onclick = async e => {
    const r = e.target.closest('[data-restore]'), d = e.target.closest('[data-del]'), n = e.target.closest('[data-rename]');
    if (r) { const x = await send('restoreSession', { id: r.dataset.restore }); toast(`Opened ${x.restored} tabs`); }
    if (d || n) {
      const id = (d || n).dataset.del || (d || n).dataset.rename;
      const { sessions = [] } = await chrome.storage.local.get('sessions');
      if (d && confirm('Delete this saved session?')) await chrome.storage.local.set({ sessions: sessions.filter(s => s.id !== id) });
      if (n) { const s = sessions.find(s => s.id === id); const name = prompt('New name', s.name); if (name) { s.name = name; await chrome.storage.local.set({ sessions }); } }
      loaders.sessions();
    }
  };
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
  const { categories } = await getConfig();
  const { links, folders } = flatten(await chrome.bookmarks.getTree());
  const seen = new Set(); let dupes = 0;
  const byCat = {};
  for (const b of links) {
    const k = normUrl(b.url); if (seen.has(k)) { dupes++; continue; } seen.add(k);
    const c = categorize(b.url, categories) || OTHER;
    (byCat[c.name] = byCat[c.name] || { c, n: 0 }).n++;
  }
  $('b-total').textContent = links.length; $('b-folders').textContent = folders; $('b-dupes').textContent = dupes; $('b-loose').textContent = byCat[OTHER.name]?.n || 0;
  const rows = Object.values(byCat).sort((a, b) => b.n - a.n); const max = rows[0]?.n || 1;
  $('b-cats').innerHTML = rows.map(({ c, n }) => `<div class="catrow"><span class="row"><span class="dot c-${esc(c.color)}"></span>${esc(c.name)}</span><div class="bar"><span style="width:${n / max * 100}%;background:${HEX[c.color]}"></span></div><span class="small">${n}</span></div>`).join('') || '<p class="muted">No bookmarks.</p>';
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
  toast('Backup downloaded. Import it any time via chrome://bookmarks → ⋮ → Import.');
};
$('b-sort').onclick = async () => {
  const { categories } = await getConfig();
  const { links } = flatten(await chrome.bookmarks.getTree());
  if (!confirm(`Create a new folder "Tab Butler – Sorted" in Other bookmarks with copies of your ${links.length} bookmarks, arranged by category? Your existing bookmarks stay exactly where they are.`)) return;
  const root = await chrome.bookmarks.create({ parentId: '2', title: `Tab Butler – Sorted ${todayKey()}` }).catch(async () => {
    const t = await chrome.bookmarks.getTree(); return chrome.bookmarks.create({ parentId: t[0].children[t[0].children.length - 1].id, title: `Tab Butler – Sorted ${todayKey()}` });
  });
  const folders = {}; const seen = new Set(); let n = 0;
  for (const c of [...categories, OTHER]) folders[c.name] = null;
  for (const b of links) {
    const k = normUrl(b.url); if (seen.has(k)) continue; seen.add(k);
    const c = categorize(b.url, categories) || OTHER;
    if (!folders[c.name]) folders[c.name] = await chrome.bookmarks.create({ parentId: root.id, title: c.name });
    await chrome.bookmarks.create({ parentId: folders[c.name].id, title: b.title, url: b.url }); n++;
  }
  toast(`Created sorted copy with ${n} bookmarks (duplicates skipped).`);
};

// ---------- history ----------
let junk = [];
$('h-scan').onclick = async () => {
  const { settings } = await getConfig();
  const pats = settings.junkPatterns.map(p => p.toLowerCase()).filter(Boolean);
  $('h-list').innerHTML = '<tr><td class="muted">Scanning…</td></tr>';
  const items = await chrome.history.search({ text: '', startTime: Date.now() - 90 * 864e5, maxResults: 100000 });
  junk = items.filter(it => { const u = it.url.toLowerCase(); return pats.some(p => u.includes(p)); });
  renderJunk();
};
function renderJunk() {
  const all = $('h-all').checked;
  $('h-count').textContent = `${junk.length} junk pages found`;
  $('h-del').disabled = !junk.length;
  $('h-list').innerHTML = junk.length ? '<tr><th></th><th>Page</th><th>Site</th><th>Last visit</th></tr>' + junk.slice(0, 2000).map((it, i) => `<tr><td><input type="checkbox" data-i="${i}" ${all ? 'checked' : ''}></td><td class="ellipsis">${esc(it.title || it.url)}</td><td class="small muted">${esc(hostOf(it.url))}</td><td class="small muted">${new Date(it.lastVisitTime).toLocaleDateString()}</td></tr>`).join('') + (junk.length > 2000 ? `<tr><td></td><td class="muted">…and ${junk.length - 2000} more (included when "select all" is ticked)</td></tr>` : '') : '<tr><td class="muted">No junk found. 🎉</td></tr>';
}
$('h-all').onchange = renderJunk;
$('h-del').onclick = async () => {
  const boxes = [...document.querySelectorAll('#h-list input[data-i]')];
  let picked = boxes.filter(b => b.checked).map(b => junk[+b.dataset.i]);
  if ($('h-all').checked && junk.length > 2000) picked = picked.concat(junk.slice(2000));
  if (!picked.length || !confirm(`Delete ${picked.length} pages from your Chrome history? This can't be undone.`)) return;
  for (const it of picked) await chrome.history.deleteUrl({ url: it.url });
  toast(`Deleted ${picked.length} pages from history`);
  $('h-scan').click();
};
$('h-site-del').onclick = async () => {
  const site = $('h-site').value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!site) return;
  const items = await chrome.history.search({ text: site, startTime: 0, maxResults: 100000 });
  const hits = items.filter(it => hostOf(it.url).endsWith(site));
  if (!hits.length) return toast('Nothing found for ' + site);
  if (!confirm(`Delete ${hits.length} pages from ${site} from your history?`)) return;
  for (const it of hits) await chrome.history.deleteUrl({ url: it.url });
  toast(`Deleted ${hits.length} pages from ${site}`);
};

// ---------- settings ----------
let draft = null;
loaders.settings = async () => {
  draft = await getConfig();
  document.querySelectorAll('[data-k]').forEach(el => {
    const v = draft.settings[el.dataset.k];
    if (el.type === 'checkbox') el.checked = !!v;
    else if (el.dataset.list) el.value = (v || []).join('\n');
    else el.value = v ?? '';
  });
  renderCats();
};
function renderCats() {
  $('c-list').innerHTML = draft.categories.map((c, i) => `<div class="catedit" data-i="${i}">
    <div class="row"><span style="display:flex;flex-direction:column"><button class="small" data-up="${i}" title="Move up" style="padding:0 6px">▲</button><button class="small" data-down="${i}" title="Move down" style="padding:0 6px">▼</button></span><input type="text" data-f="name" value="${esc(c.name)}"></div>
    <select data-f="color">${COLORS.map(col => `<option ${col === c.color ? 'selected' : ''}>${col}</option>`).join('')}</select>
    <textarea data-f="patterns" rows="2">${esc((c.patterns || []).join(', '))}</textarea>
    <button class="danger" data-rm="${i}" title="Remove">✕</button></div>`).join('');
}
function readCats() {
  document.querySelectorAll('.catedit').forEach(row => {
    const c = draft.categories[+row.dataset.i];
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
  if (rm) a.splice(+rm.dataset.rm, 1);
  renderCats();
};
$('c-add').onclick = () => { readCats(); draft.categories.push({ id: crypto.randomUUID(), name: 'New category', color: 'blue', patterns: [] }); renderCats(); };
$('c-reset').onclick = () => { if (confirm('Reset categories to the defaults?')) { draft.categories = structuredClone(DEFAULT_CATEGORIES); renderCats(); } };
$('c-save').onclick = async () => {
  readCats();
  document.querySelectorAll('[data-k]').forEach(el => {
    const k = el.dataset.k;
    if (el.type === 'checkbox') draft.settings[k] = el.checked;
    else if (el.type === 'number') draft.settings[k] = Math.max(1, parseInt(el.value, 10) || DEFAULT_SETTINGS[k]);
    else if (el.dataset.list) draft.settings[k] = el.value.split('\n').map(s => s.trim()).filter(Boolean);
    else draft.settings[k] = el.value.trim();
  });
  await saveConfig(draft);
  toast('Settings saved');
};
$('c-export').onclick = async () => {
  const cfg = await getConfig();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'tab-butler', version: 1, ...cfg }, null, 2)], { type: 'application/json' }));
  a.download = 'tab-butler-settings.json'; a.click();
};
$('c-import').onchange = async e => {
  try {
    const cfg = JSON.parse(await e.target.files[0].text());
    if (!Array.isArray(cfg.categories)) throw new Error('No categories in file');
    await saveConfig({ categories: cfg.categories, settings: { ...DEFAULT_SETTINGS, ...(cfg.settings || {}) } });
    toast('Settings imported'); loaders.settings();
  } catch (err) { toast('Import failed: ' + err.message); }
};

route();
