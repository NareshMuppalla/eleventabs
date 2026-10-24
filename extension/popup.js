import { getConfig, saveConfig } from './lib/config.js';
import { hydrateIcons, icon } from './lib/icons.js';

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
$('open-settings').onclick = e => { e.preventDefault(); openPage('#settings'); };

(async () => {
  const { settings } = await getConfig();
  $('t-auto').checked = settings.autoGroup;
  $('t-sleep').checked = settings.sleepEnabled;
  $('t-min').textContent = settings.sleepMinutes;
  const flip = (key, el, on, off) => async () => { const c = await getConfig(); c.settings[key] = el.checked; await saveConfig({ settings: c.settings }); toast(el.checked ? on : off); };
  $('t-auto').onchange = flip('autoGroup', $('t-auto'), 'Auto-sort is on', 'Auto-sort is off');
  $('t-sleep').onchange = flip('sleepEnabled', $('t-sleep'), 'Auto-sleep is on', 'Auto-sleep is off');
  refresh();
})();
