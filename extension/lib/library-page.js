// Dashboard "Saved" page: categorised library of your own saved pages.
import { COLORS, faviconUrl, hostOf } from './config.js';
import { icon } from './icons.js';
import { loadLib, saveItem, patchItems, removeItems, addCat, editCat, deleteCat, autoSort, importChrome, exportJson, exportHtml } from './library.js';
import { todayKey } from './config.js';

export function initLibrary({ loaders, $, esc, toast, has, ask }) {
  const col = c => COLORS.includes(c) ? c : 'grey';
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  let lib = { cats: [], items: [] };
  let view = 'all', q = '', sort = 'new', mode = 'grid', editing = false;
  const sel = new Set();

  const ago = t => {
    const d = (Date.now() - t) / 1000;
    if (d < 3600) return Math.max(1, Math.round(d / 60)) + 'm ago';
    if (d < 86400) return Math.round(d / 3600) + 'h ago';
    if (d < 86400 * 30) return Math.round(d / 86400) + 'd ago';
    return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const count = pred => lib.items.filter(pred).length;
  const catOf = id => lib.cats.find(c => c.id === id);

  async function reload() { lib = await loadLib(); $('nav-saved').textContent = lib.items.length || ''; render(); }
  loaders.library = reload;
  chrome.storage.local.get('library').then(() => loadLib().then(l => { $('nav-saved').textContent = l.items.length || ''; }));
  chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.library && document.getElementById('library').classList.contains('active')) reload(); });

  function visible() {
    let a = lib.items;
    if (view === 'fav') a = a.filter(i => i.fav);
    else if (view === 'none') a = a.filter(i => !i.cat);
    else if (view !== 'all') a = a.filter(i => i.cat === view);
    if (q) { const t = q.toLowerCase(); a = a.filter(i => (i.title + ' ' + i.url + ' ' + i.note).toLowerCase().includes(t)); }
    a = [...a];
    if (sort === 'old') a.sort((x, y) => x.added - y.added);
    else if (sort === 'az') a.sort((x, y) => x.title.localeCompare(y.title));
    else if (sort === 'site') a.sort((x, y) => hostOf(x.url).localeCompare(hostOf(y.url)));
    else a.sort((x, y) => y.added - x.added);
    return a;
  }

  function renderRail() {
    const it = (id, ic, name, n, extra = '') => `<button class="ri ${view === id ? 'on' : ''}" data-v="${esc(id)}" ${extra}>${ic}<span class="ellipsis">${esc(name)}</span><span class="n">${n}</span></button>`;
    const cats = lib.cats.map(c => `<div class="row" style="gap:0"><button class="ri ${view === c.id ? 'on' : ''}" data-v="${esc(c.id)}" data-drop="${esc(c.id)}"><span class="dot d-${col(c.color)}"></span><span class="ellipsis">${esc(c.name)}</span><span class="n">${count(i => i.cat === c.id)}</span></button><span class="edit"><button data-ec="${esc(c.id)}" title="Rename / recolour">${icon('pencil', 13)}</button><button data-dc="${esc(c.id)}" title="Delete category">${icon('trash-2', 13)}</button></span></div>`).join('');
    $('rail').classList.toggle('editing', editing);
    $('rail').innerHTML =
      it('all', icon('inbox', 16), 'All saved', lib.items.length) +
      it('fav', icon('star', 16), 'Favourites', count(i => i.fav)) +
      it('none', icon('circle-dashed', 16), 'Unsorted', count(i => !i.cat), 'data-drop=""') +
      '<div class="sep"></div>' + cats +
      `<div class="cat-actions"><button class="btn btn-sm" id="r-new">${icon('folder-plus', 14)}New</button><button class="btn btn-sm" id="r-auto" title="Put every unsorted item into the best matching category">${icon('wand-sparkles', 14)}Auto-sort</button><button class="btn btn-sm btn-quiet" id="r-edit">${editing ? 'Done' : 'Manage'}</button></div>`;
  }

  function card(i) {
    const c = catOf(i.cat);
    return `<article class="lcard ${sel.has(i.id) ? 'sel' : ''}" draggable="true" data-id="${esc(i.id)}">
      <span class="pick"><label class="check"><input type="checkbox" data-pick="${esc(i.id)}" ${sel.has(i.id) ? 'checked' : ''} aria-label="Select"></label></span>
      <div class="top"><span class="fv"><img src="${esc(faviconUrl(i.url))}" alt=""></span><span class="host ellipsis grow">${esc(hostOf(i.url))}</span><button class="favb ${i.fav ? 'on' : ''}" data-fav="${esc(i.id)}" title="Favourite">${icon('star', 16)}</button></div>
      <div class="body"><a class="ttl" href="${esc(i.url)}" data-open="${esc(i.url)}" title="${esc(i.title)}">${esc(i.title)}</a>${i.note ? `<div class="note">${esc(i.note)}</div>` : ''}</div>
      <div class="bot">${c ? `<span class="catchip"><span class="dot d-${col(c.color)}"></span>${esc(c.name)}</span>` : `<span class="catchip" style="color:var(--muted)">Unsorted</span>`}<span class="when">${esc(ago(i.added))}</span>
        <span class="acts"><button data-ext="${esc(i.url)}" title="Open in new tab">${icon('external-link', 15)}</button><button data-edit="${esc(i.id)}" title="Edit">${icon('pencil', 15)}</button><button data-del="${esc(i.id)}" title="Delete">${icon('trash-2', 15)}</button></span></div>
    </article>`;
  }

  function render() {
    renderRail();
    const list = visible();
    const title = view === 'all' ? 'All saved' : view === 'fav' ? 'Favourites' : view === 'none' ? 'Unsorted' : catOf(view)?.name || 'Saved';
    $('l-eyebrow').textContent = `${title} · ${plural(list.length, 'page')}`;
    $('bulk').classList.toggle('on', sel.size > 0);
    $('bulk-n').textContent = `${sel.size} selected`;
    $('bulk-cat').innerHTML = `<option value="__">Choose…</option>` + lib.cats.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('') + `<option value="">Unsorted</option>`;
    $('l-body').classList.toggle('selecting', sel.size > 0);
    if (!lib.items.length) {
      $('l-body').innerHTML = `<div class="empty" style="padding:48px 26px">${icon('bookmark-plus', 26)}<b style="color:var(--text);display:block;font-size:16px;margin-bottom:6px">Nothing saved yet</b>Click the ElevenTabs icon in Chrome on any page, open <b>Saved</b> and press <b>Save this page</b>.<br>It picks a category for you. You can also bring in your Chrome bookmarks.<div class="row" style="justify-content:center;margin-top:16px"><button class="btn btn-gold" id="e-import">${icon('download', 15)}Import from Chrome</button><button class="btn" id="e-add">${icon('plus', 15)}Add a link</button></div></div>`;
      return;
    }
    if (!list.length) { $('l-body').innerHTML = `<div class="empty">${icon('search', 22)}Nothing here${q ? ' matches your search' : ' yet'}.</div>`; return; }
    $('l-body').innerHTML = `<div class="lgrid ${mode === 'list' ? 'list' : ''}">${list.map(card).join('')}</div>`;
  }

  // ----- modal (add / edit / category) -----
  const modal = html => { $('modal-card').innerHTML = html; $('modal').classList.add('on'); };
  const closeModal = () => $('modal').classList.remove('on');
  $('modal').addEventListener('mousedown', e => { if (e.target === $('modal')) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  function itemModal(item) {
    const isNew = !item;
    item = item || { url: '', title: '', note: '', cat: view !== 'all' && view !== 'fav' && view !== 'none' ? view : '', fav: false };
    modal(`<h3 style="font-size:17px">${isNew ? 'Add a link' : 'Edit saved page'}</h3>
      <label class="f"><span class="eyebrow">Address</span><input type="text" id="m-url" value="${esc(item.url)}" placeholder="https://" ${isNew ? '' : ''}></label>
      <label class="f"><span class="eyebrow">Title</span><input type="text" id="m-title" value="${esc(item.title)}" maxlength="200" placeholder="Optional, filled from the address"></label>
      <label class="f"><span class="eyebrow">Category</span><select id="m-cat"><option value="">Unsorted (pick automatically)</option>${lib.cats.map(c => `<option value="${esc(c.id)}" ${c.id === item.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label class="f"><span class="eyebrow">Note</span><textarea id="m-note" rows="3" maxlength="500" style="font-family:var(--sans)">${esc(item.note)}</textarea></label>
      <div class="row" style="margin-top:18px;justify-content:flex-end"><button class="btn btn-quiet" id="m-cancel">Cancel</button><button class="btn btn-gold" id="m-ok">${isNew ? 'Save' : 'Save changes'}</button></div>`);
    $('m-url').focus();
    $('m-cancel').onclick = closeModal;
    $('m-ok').onclick = async () => {
      let url = $('m-url').value.trim(); if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
      if (!/^https?:\/\/[^\s.]+\.[^\s]+/i.test(url)) { toast('Enter a valid web address', 'lock'); return; }
      const patch = { title: $('m-title').value.trim() || hostOf(url), note: $('m-note').value.trim(), cat: $('m-cat').value };
      if (isNew) { const r = await saveItem({ url, ...patch, cat: patch.cat || undefined }); toast(r.status === 'added' ? 'Saved' : 'Already saved · updated'); }
      else { await patchItems([item.id], { ...patch, url }); toast('Saved'); }
      closeModal(); reload();
    };
  }
  function catModal(c) {
    const isNew = !c; c = c || { name: '', color: COLORS[lib.cats.length % COLORS.length], patterns: [] };
    let color = c.color;
    modal(`<h3 style="font-size:17px">${isNew ? 'New category' : 'Edit category'}</h3>
      <label class="f"><span class="eyebrow">Name</span><input type="text" id="c-name" value="${esc(c.name)}" maxlength="40" placeholder="e.g. Recipes, Client sites, Learning"></label>
      <div class="f" style="margin-top:12px"><span class="eyebrow" style="display:block;margin-bottom:8px">Colour</span><div class="colors" id="c-colors">${COLORS.map(x => `<i data-c="${x}" class="d-${x} ${x === color ? 'on' : ''}"></i>`).join('')}</div></div>
      <label class="f"><span class="eyebrow">Auto-match sites (optional)</span><textarea id="c-pat" rows="3" placeholder="One per line, e.g. cooking.com or reddit.com/r/recipes" style="font-family:var(--mono)">${esc((c.patterns || []).join('\n'))}</textarea><div class="tiny muted" style="margin-top:4px">New saves from these sites go into this category automatically.</div></label>
      <div class="row" style="margin-top:18px;justify-content:flex-end"><button class="btn btn-quiet" id="m-cancel">Cancel</button><button class="btn btn-gold" id="m-ok">${isNew ? 'Create' : 'Save'}</button></div>`);
    $('c-name').focus();
    $('c-colors').onclick = e => { const i = e.target.closest('i[data-c]'); if (!i) return; color = i.dataset.c; $('c-colors').querySelectorAll('i').forEach(x => x.classList.toggle('on', x === i)); };
    $('m-cancel').onclick = closeModal;
    $('m-ok').onclick = async () => {
      const name = $('c-name').value.trim(); if (!name) { toast('Give it a name', 'lock'); return; }
      const patterns = $('c-pat').value.split('\n').map(x => x.trim()).filter(Boolean);
      if (isNew) { const n = await addCat(name, color); await editCat(n.id, { color, patterns }); view = n.id; }
      else await editCat(c.id, { name, color, patterns });
      closeModal(); reload();
    };
  }

  // ----- events -----
  $('l-add').onclick = () => itemModal(null);
  $('l-q').oninput = e => { q = e.target.value.trim(); render(); };
  $('l-sort').onchange = e => { sort = e.target.value; render(); };
  $('v-grid').onclick = () => { mode = 'grid'; $('v-grid').classList.add('on'); $('v-list').classList.remove('on'); render(); };
  $('v-list').onclick = () => { mode = 'list'; $('v-list').classList.add('on'); $('v-grid').classList.remove('on'); render(); };

  const doImport = async () => {
    if (!(await has('bookmarks')) && !(await ask('bookmarks'))) return;
    const r = await importChrome();
    toast(`Imported ${plural(r.added, 'bookmark')}${r.existed ? ` · ${r.existed} already here` : ''}. Your Chrome bookmarks are untouched.`, 'download');
    reload();
  };
  $('l-import').onclick = doImport;

  $('l-export').onclick = () => {
    modal(`<h3 style="font-size:17px">Export your saved pages</h3><p class="muted small" style="margin:8px 0 16px">Two formats. The HTML file imports straight into Chrome (chrome://bookmarks, menu, Import bookmarks), one folder per category.</p>
      <div class="row wrap"><button class="btn btn-gold" id="x-html">${icon('download', 15)}Bookmarks file (.html)</button><button class="btn" id="x-json">${icon('download', 15)}Backup (.json)</button><button class="btn btn-quiet" id="m-cancel">Close</button></div>`);
    const dl = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); toast('Saved to Downloads', 'download'); closeModal(); };
    $('x-html').onclick = () => dl(`eleventabs-saved-${todayKey()}.html`, exportHtml(lib), 'text/html');
    $('x-json').onclick = () => dl(`eleventabs-saved-${todayKey()}.json`, exportJson(lib), 'application/json');
    $('m-cancel').onclick = closeModal;
  };

  $('rail').addEventListener('click', async e => {
    const v = e.target.closest('[data-v]'); const ec = e.target.closest('[data-ec]'); const dc = e.target.closest('[data-dc]');
    if (ec) { catModal(catOf(ec.dataset.ec)); return; }
    if (dc) {
      const c = catOf(dc.dataset.dc); const n = count(i => i.cat === c.id);
      if (confirm(`Delete the category "${c.name}"?\n\n${n ? `${plural(n, 'saved page')} will move to Unsorted. ` : ''}No pages are deleted.`)) { await deleteCat(c.id); if (view === c.id) view = 'all'; reload(); }
      return;
    }
    if (e.target.closest('#r-new')) { catModal(null); return; }
    if (e.target.closest('#r-edit')) { editing = !editing; render(); return; }
    if (e.target.closest('#r-auto')) { const n = await autoSort(); toast(n ? `Sorted ${plural(n, 'page')} into categories` : 'Nothing more to sort automatically'); reload(); return; }
    if (v) { view = v.dataset.v; render(); }
  });
  // drag a card onto a category to re-file it
  $('l-body').addEventListener('dragstart', e => { const c = e.target.closest('.lcard'); if (c) { e.dataTransfer.setData('text/plain', c.dataset.id); e.dataTransfer.effectAllowed = 'move'; } });
  $('rail').addEventListener('dragover', e => { const t = e.target.closest('[data-drop]'); if (t) { e.preventDefault(); t.classList.add('drop'); } });
  $('rail').addEventListener('dragleave', e => { e.target.closest('[data-drop]')?.classList.remove('drop'); });
  $('rail').addEventListener('drop', async e => {
    const t = e.target.closest('[data-drop]'); if (!t) return; e.preventDefault();
    const id = e.dataTransfer.getData('text/plain'); if (!id) return;
    const ids = sel.has(id) ? [...sel] : [id];
    await patchItems(ids, { cat: t.dataset.drop }); sel.clear();
    toast(`Moved ${plural(ids.length, 'page')} to ${t.dataset.drop ? catOf(t.dataset.drop)?.name : 'Unsorted'}`, 'folder-tree'); reload();
  });

  $('l-body').addEventListener('click', async e => {
    const pick = e.target.closest('[data-pick]'); if (pick) { pick.checked ? sel.add(pick.dataset.pick) : sel.delete(pick.dataset.pick); render(); return; }
    const fav = e.target.closest('[data-fav]'); if (fav) { const i = lib.items.find(x => x.id === fav.dataset.fav); await patchItems([i.id], { fav: !i.fav }); reload(); return; }
    const del = e.target.closest('[data-del]'); if (del) { await removeItems([del.dataset.del]); sel.delete(del.dataset.del); toast('Removed from Saved'); reload(); return; }
    const ed = e.target.closest('[data-edit]'); if (ed) { itemModal(lib.items.find(x => x.id === ed.dataset.edit)); return; }
    const ext = e.target.closest('[data-ext]'); if (ext) { chrome.tabs.create({ url: ext.dataset.ext }); return; }
    const open = e.target.closest('[data-open]'); if (open) { e.preventDefault(); chrome.tabs.create({ url: open.dataset.open }); return; }
    if (e.target.closest('#e-import')) doImport();
    if (e.target.closest('#e-add')) itemModal(null);
  });
  $('bulk-cat').onchange = async e => { if (e.target.value === '__') return; await patchItems([...sel], { cat: e.target.value }); toast(`Moved ${plural(sel.size, 'page')}`, 'folder-tree'); sel.clear(); reload(); };
  $('bulk-fav').onclick = async () => { await patchItems([...sel], { fav: true }); toast('Marked as favourites', 'star'); sel.clear(); reload(); };
  $('bulk-del').onclick = async () => { if (confirm(`Delete ${plural(sel.size, 'saved page')} from ElevenTabs?\n\nYour Chrome bookmarks are not affected.`)) { await removeItems([...sel]); sel.clear(); toast('Deleted'); reload(); } };
  $('bulk-x').onclick = () => { sel.clear(); render(); };
}
