import { getConfig, saveConfig } from './lib/config.js';

const $ = id => document.getElementById(id);
const send = (type, payload) => chrome.runtime.sendMessage({ type, payload });
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200); }

async function refresh() {
  const s = await send('stats');
  if (!s?.ok) return;
  $('s-tabs').textContent = s.tabs; $('s-wins').textContent = s.windows;
  $('s-sleep').textContent = s.sleeping; $('s-dupes').textContent = s.duplicates;
  $('dupes').disabled = !s.duplicates;
}

async function run(btn, type, payload, fmt) {
  btn.disabled = true;
  const r = await send(type, payload);
  btn.disabled = false;
  toast(r?.ok ? fmt(r) : 'Something went wrong: ' + (r?.error || 'unknown'));
  refresh();
}

$('group').onclick = e => run(e.currentTarget, 'groupAll', {}, r => `Sorted ${r.grouped} tabs into groups`);
$('dupes').onclick = e => run(e.currentTarget, 'closeDuplicates', {}, r => `Closed ${r.closed} duplicate tab${r.closed === 1 ? '' : 's'}`);
$('sleep').onclick = e => run(e.currentTarget, 'sleepNow', {}, r => `Put ${r.slept} tab${r.slept === 1 ? '' : 's'} to sleep`);
$('ungroup').onclick = e => run(e.currentTarget, 'ungroupAll', {}, r => `Removed groups from ${r.ungrouped} tabs`);
$('save').onclick = async e => {
  const btn = e.currentTarget;
  const win = await chrome.windows.getCurrent();
  run(btn, 'saveSession', { name: $('sess-name').value.trim(), windowId: win.id, closeAfter: $('sess-close').checked }, r => r.saved ? `Saved ${r.saved} tabs` : 'No web pages to save');
  $('sess-name').value = '';
};
$('open-dash').onclick = e => { e.preventDefault(); chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') }); window.close(); };

(async () => {
  if (!/Mac/i.test(navigator.platform)) document.querySelectorAll('.kbd').forEach(k => { k.textContent = k.textContent.replace('⌥⇧', 'Alt+Shift+'); });
  const { settings } = await getConfig();
  $('t-auto').checked = settings.autoGroup;
  $('t-sleep').checked = settings.sleepEnabled;
  $('t-min').textContent = settings.sleepMinutes;
  $('t-auto').onchange = async () => { const c = await getConfig(); c.settings.autoGroup = $('t-auto').checked; await saveConfig({ settings: c.settings }); toast(c.settings.autoGroup ? 'Auto-sort on' : 'Auto-sort off'); };
  $('t-sleep').onchange = async () => { const c = await getConfig(); c.settings.sleepEnabled = $('t-sleep').checked; await saveConfig({ settings: c.settings }); toast(c.settings.sleepEnabled ? 'Auto-sleep on' : 'Auto-sleep off'); };
  refresh();
})();
