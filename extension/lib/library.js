// ElevenTabs library: your own saved pages ("Saved"), sorted into categories. Stored locally in chrome.storage.local.
// Never reads or changes Chrome's own bookmarks unless you turn on "Also add to Chrome bookmarks" or press Import.
import { getConfig, categorize, normUrl, hostOf, isWebUrl, COLORS, todayKey } from './config.js';

const MAX_ITEMS = 5000;
const s = (v, n) => String(v ?? '').slice(0, n);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const EXTRA_CATS = [
  { id: 'later', name: 'Read later', color: 'orange', patterns: [] },
  { id: 'ideas', name: 'Ideas & inspiration', color: 'pink', patterns: [] }
];

function defaultCats(configCats) {
  return [...configCats.map(c => ({ id: c.id, name: c.name, color: c.color, patterns: [] })), ...EXTRA_CATS.map(c => ({ ...c }))];
}

export function sanitizeLib(raw, configCats = []) {
  const cats = (Array.isArray(raw?.cats) && raw.cats.length ? raw.cats : defaultCats(configCats)).slice(0, 60).map((c, i) => ({
    id: s(c?.id || 'c' + i, 40), name: s(c?.name, 40).trim() || 'Untitled', color: COLORS.includes(c?.color) ? c.color : 'grey',
    patterns: (Array.isArray(c?.patterns) ? c.patterns : []).map(p => s(p, 120).trim()).filter(Boolean).slice(0, 60)
  }));
  const ids = new Set(cats.map(c => c.id));
  const items = (Array.isArray(raw?.items) ? raw.items : []).filter(i => i && isWebUrl(i.url)).slice(0, MAX_ITEMS).map(i => ({
    id: s(i.id || uid(), 24), url: s(i.url, 2000), title: s(i.title, 200).trim() || hostOf(i.url), note: s(i.note, 500),
    cat: ids.has(i.cat) ? i.cat : '', fav: !!i.fav, added: Number.isFinite(+i.added) ? +i.added : Date.now(), folder: s(i.folder, 80)
  }));
  return { cats, items };
}

export async function loadLib() {
  const [{ library }, cfg] = await Promise.all([chrome.storage.local.get('library'), getConfig()]);
  return sanitizeLib(library, cfg.categories);
}
export const saveLib = lib => chrome.storage.local.set({ library: lib });

// Best category for a URL: your own library patterns first, then the tab-group rules (matched by id), else none.
export function suggestCat(url, lib, configCats) {
  const own = categorize(url, lib.cats.filter(c => c.patterns.length));
  if (own) return own.id;
  const c = categorize(url, configCats);
  if (c && lib.cats.some(x => x.id === c.id)) return c.id;
  return '';
}

export function findByUrl(lib, url) {
  const k = normUrl(url);
  return lib.items.find(i => normUrl(i.url) === k) || null;
}

// Save (or update if already saved). Returns { status: 'added' | 'updated', item }.
export async function saveItem({ url, title, cat, note, fav }, { mirror = false } = {}) {
  if (!isWebUrl(url)) throw new Error('Only web pages can be saved');
  const lib = await loadLib();
  const cfg = await getConfig();
  const ex = findByUrl(lib, url);
  const catId = cat !== undefined && cat !== null ? cat : (ex?.cat ?? suggestCat(url, lib, cfg.categories));
  if (ex) {
    Object.assign(ex, { title: s(title, 200).trim() || ex.title, cat: lib.cats.some(c => c.id === catId) ? catId : '', note: note !== undefined ? s(note, 500) : ex.note, fav: fav !== undefined ? !!fav : ex.fav });
    await saveLib(lib);
    return { status: 'updated', item: ex };
  }
  const item = { id: uid(), url: s(url, 2000), title: s(title, 200).trim() || hostOf(url), note: s(note, 500), cat: lib.cats.some(c => c.id === catId) ? catId : '', fav: !!fav, added: Date.now(), folder: '' };
  lib.items.unshift(item);
  if (lib.items.length > MAX_ITEMS) lib.items.length = MAX_ITEMS;
  await saveLib(lib);
  if (mirror) await mirrorToChrome(item, lib).catch(() => {});
  return { status: 'added', item };
}

export async function saveMany(tabs, { mirror = false } = {}) {
  const lib = await loadLib(); const cfg = await getConfig();
  let added = 0, existed = 0;
  const fresh = [];
  for (const t of tabs) {
    if (!isWebUrl(t.url)) continue;
    if (findByUrl(lib, t.url)) { existed++; continue; }
    const item = { id: uid(), url: s(t.url, 2000), title: s(t.title, 200).trim() || hostOf(t.url), note: '', cat: suggestCat(t.url, lib, cfg.categories), fav: false, added: Date.now(), folder: '' };
    lib.items.unshift(item); fresh.push(item); added++;
  }
  if (lib.items.length > MAX_ITEMS) lib.items.length = MAX_ITEMS;
  await saveLib(lib);
  if (mirror) for (const it of fresh) await mirrorToChrome(it, lib).catch(() => {});
  return { added, existed };
}

export async function patchItems(ids, patch) {
  const lib = await loadLib(); const set = new Set(ids);
  for (const i of lib.items) if (set.has(i.id)) {
    if ('title' in patch) i.title = s(patch.title, 200).trim() || i.title;
    if ('url' in patch && isWebUrl(patch.url)) i.url = s(patch.url, 2000);
    if ('note' in patch) i.note = s(patch.note, 500);
    if ('fav' in patch) i.fav = !!patch.fav;
    if ('cat' in patch) i.cat = lib.cats.some(c => c.id === patch.cat) ? patch.cat : '';
  }
  await saveLib(lib);
}
export async function removeItems(ids) {
  const lib = await loadLib(); const set = new Set(ids);
  lib.items = lib.items.filter(i => !set.has(i.id)); await saveLib(lib);
}

export async function addCat(name, color = 'grey') {
  const lib = await loadLib(); const n = s(name, 40).trim(); if (!n) return null;
  const ex = lib.cats.find(c => c.name.toLowerCase() === n.toLowerCase()); if (ex) return ex;
  const c = { id: 'u' + uid(), name: n, color: COLORS.includes(color) ? color : COLORS[lib.cats.length % COLORS.length], patterns: [] };
  lib.cats.push(c); await saveLib(lib); return c;
}
export async function editCat(id, patch) {
  const lib = await loadLib(); const c = lib.cats.find(x => x.id === id); if (!c) return;
  if (patch.name) c.name = s(patch.name, 40).trim() || c.name;
  if (patch.color && COLORS.includes(patch.color)) c.color = patch.color;
  if (Array.isArray(patch.patterns)) c.patterns = patch.patterns.map(p => s(p, 120).trim()).filter(Boolean).slice(0, 60);
  await saveLib(lib);
}
export async function deleteCat(id) {
  const lib = await loadLib();
  lib.cats = lib.cats.filter(c => c.id !== id);
  for (const i of lib.items) if (i.cat === id) i.cat = '';
  await saveLib(lib);
}

// Put every uncategorised item into the best matching category.
export async function autoSort() {
  const lib = await loadLib(); const cfg = await getConfig(); let n = 0;
  for (const i of lib.items) if (!i.cat) { const c = suggestCat(i.url, lib, cfg.categories); if (c) { i.cat = c; n++; } }
  await saveLib(lib); return n;
}

// ---------- Chrome bookmarks (optional permission) ----------
function flat(nodes, path = [], out = []) {
  for (const n of nodes) {
    if (n.url) out.push({ title: n.title, url: n.url, folder: path[path.length - 1] || '', added: n.dateAdded });
    else flat(n.children || [], n.title ? [...path, n.title] : path, out);
  }
  return out;
}
// Copies your Chrome bookmarks into the library (originals are never touched). Chrome folder names that match a category are kept.
export async function importChrome() {
  const lib = await loadLib(); const cfg = await getConfig();
  const tree = await chrome.bookmarks.getTree();
  const byName = new Map(lib.cats.map(c => [c.name.toLowerCase(), c.id]));
  let added = 0, existed = 0, skipped = 0;
  const seen = new Set(lib.items.map(i => normUrl(i.url)));
  for (const b of flat(tree)) {
    if (!isWebUrl(b.url)) { skipped++; continue; }
    const k = normUrl(b.url); if (seen.has(k)) { existed++; continue; } seen.add(k);
    const cat = suggestCat(b.url, lib, cfg.categories) || byName.get((b.folder || '').toLowerCase()) || '';
    lib.items.push({ id: uid(), url: s(b.url, 2000), title: s(b.title, 200).trim() || hostOf(b.url), note: '', cat, fav: false, added: Number(b.added) || Date.now(), folder: s(b.folder, 80) });
    added++;
  }
  lib.items.sort((a, b) => b.added - a.added);
  if (lib.items.length > MAX_ITEMS) lib.items.length = MAX_ITEMS;
  await saveLib(lib);
  return { added, existed, skipped };
}

async function mirrorToChrome(item, lib) {
  if (!(await chrome.permissions.contains({ permissions: ['bookmarks'] }))) return;
  const tree = await chrome.bookmarks.getTree();
  const other = tree[0].children.find(c => c.id === '2') || tree[0].children[tree[0].children.length - 1];
  let root = (other.children || []).find(c => !c.url && c.title === 'ElevenTabs');
  if (!root) root = await chrome.bookmarks.create({ parentId: other.id, title: 'ElevenTabs' });
  const catName = lib.cats.find(c => c.id === item.cat)?.name || 'Unsorted';
  const kids = await chrome.bookmarks.getChildren(root.id);
  let folder = kids.find(c => !c.url && c.title === catName);
  if (!folder) folder = await chrome.bookmarks.create({ parentId: root.id, title: catName });
  await chrome.bookmarks.create({ parentId: folder.id, title: item.title, url: item.url });
}

// ---------- export ----------
export function exportJson(lib) {
  return JSON.stringify({ app: 'ElevenTabs', exported: todayKey(), categories: lib.cats.map(({ id, name, color }) => ({ id, name, color })), items: lib.items }, null, 2);
}
const h = x => String(x ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Netscape bookmark file: imports straight into Chrome (chrome://bookmarks → Import).
export function exportHtml(lib) {
  const groups = lib.cats.map(c => ({ name: c.name, items: lib.items.filter(i => i.cat === c.id) })).concat([{ name: 'Unsorted', items: lib.items.filter(i => !i.cat) }]).filter(g => g.items.length);
  const body = groups.map(g => `    <DT><H3>${h(g.name)}</H3>\n    <DL><p>\n${g.items.map(i => `        <DT><A HREF="${h(i.url)}" ADD_DATE="${Math.round(i.added / 1000)}">${h(i.title)}</A>`).join('\n')}\n    </DL><p>`).join('\n');
  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>ElevenTabs Saved</TITLE>\n<H1>ElevenTabs Saved</H1>\n<DL><p>\n${body}\n</DL><p>\n`;
}
