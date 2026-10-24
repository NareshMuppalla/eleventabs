// ElevenTabs service worker: grouping, duplicates, sleeping, sessions, time tracking.
import { getConfig, categorize, isWebUrl, hostOf, normUrl, todayKey, isPrivate } from './lib/config.js';

const SLEEP_ALARM = 'tb-sleep';
const FLUSH_ALARM = 'tb-flush';

// ---------- setup ----------
chrome.runtime.onInstalled.addListener(async ({ reason, previousVersion }) => {
  chrome.alarms.create(SLEEP_ALARM, { periodInMinutes: 1 });
  chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: 1 });
  chrome.idle.setDetectionInterval(120);
  await seedActivity();
  updateBadge();
  if (reason === 'install') {
    // Some setups (command-line loaded / policy-installed) report a fresh "install" on every browser start.
    // If we already have a snapshot, treat it as a restart instead of showing onboarding again.
    const { lastState } = await chrome.storage.local.get('lastState');
    if (lastState) return onBrowserStart();
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html#welcome') });
  }
  // After an update to a new minor/major version, show what changed.
  const cur = chrome.runtime.getManifest().version;
  if (reason === 'update' && previousVersion && previousVersion.split('.').slice(0, 2).join('.') !== cur.split('.').slice(0, 2).join('.')) {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html#whatsnew') });
  }
});
chrome.runtime.onStartup.addListener(() => onBrowserStart());
async function onBrowserStart() {
  // First thing: keep what was open last time, before restored tabs overwrite the snapshot.
  const { lastState } = await chrome.storage.local.get('lastState');
  if (lastState?.windows?.some(w => w.tabs.length)) await chrome.storage.local.set({ previousSession: lastState });
  await chrome.storage.session.set({ booted: Date.now() });
  chrome.alarms.create(SLEEP_ALARM, { periodInMinutes: 1 });
  chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: 1 });
  chrome.idle.setDetectionInterval(120);
  await seedActivity();
  updateBadge();
  const { settings } = await getConfig();
  if (settings.startOnLaunch) openStart();
}

async function openStart() {
  const url = chrome.runtime.getURL('start.html');
  const tabs = await chrome.tabs.query({ windowType: 'normal' });
  if (tabs.some(t => t.url === url)) return;
  const blank = tabs.find(t => /^chrome:\/\/(newtab|new-tab-page)/.test(t.url || t.pendingUrl || ''));
  if (tabs.length <= 1 && blank) await chrome.tabs.update(blank.id, { url });
  else await chrome.tabs.create({ url, active: true, index: 0 });
}

// ---------- "where you left off" snapshot ----------
let snapTimer;
function scheduleSnapshot() { clearTimeout(snapTimer); snapTimer = setTimeout(() => saveSnapshot().catch(() => {}), 4000); }
async function saveSnapshot() {
  const { settings } = await getConfig();
  if (!settings.snapshot) return;
  const wins = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  const out = [];
  for (const w of wins) {
    const groups = Object.fromEntries((await chrome.tabGroups.query({ windowId: w.id })).map(g => [g.id, { title: g.title, color: g.color }]));
    const tabs = w.tabs.filter(t => isWebUrl(t.url)).map(t => ({ url: t.url, title: (t.title || '').slice(0, 200), pinned: t.pinned, group: groups[t.groupId] || null, last: t.lastAccessed || 0 }));
    if (tabs.length) out.push({ tabs });
  }
  if (out.length) await chrome.storage.local.set({ lastState: { at: Date.now(), windows: out } });
}

async function seedActivity() {
  const tabs = await chrome.tabs.query({});
  const { lastActive = {} } = await chrome.storage.session.get('lastActive');
  const now = Date.now();
  for (const t of tabs) if (!lastActive[t.id]) lastActive[t.id] = t.lastAccessed || now;
  await chrome.storage.session.set({ lastActive });
}

// ---------- helpers ----------
async function managedTitles() {
  const { categories, settings } = await getConfig();
  const s = new Set(categories.map(c => c.name));
  if (settings.otherGroupName) s.add(settings.otherGroupName);
  return s;
}

function targetCategory(url, categories, settings) {
  const c = categorize(url, categories);
  if (c) return c;
  if (settings.otherGroupName && isWebUrl(url)) return { id: '__other', name: settings.otherGroupName, color: 'grey' };
  return null;
}

async function findGroup(windowId, title) {
  const groups = await chrome.tabGroups.query({ windowId });
  return groups.find(g => g.title === title) || null;
}

// ---------- grouping ----------
// Grouping runs one tab at a time so two new tabs of the same category can't create two groups.
const pending = new Map();
let queue = Promise.resolve();
function scheduleGroup(tabId) {
  clearTimeout(pending.get(tabId));
  pending.set(tabId, setTimeout(() => {
    pending.delete(tabId);
    queue = queue.then(() => groupOne(tabId)).catch(() => {});
  }, 500));
}

let restoring = 0; // pause auto-grouping while a session is being reopened

async function groupOne(tabId) {
  const { categories, settings } = await getConfig();
  if (!settings.autoGroup || restoring) return;
  let tab; try { tab = await chrome.tabs.get(tabId); } catch { return; }
  if (tab.pinned || !isWebUrl(tab.url)) return;
  const win = await chrome.windows.get(tab.windowId);
  if (win.type !== 'normal') return;
  const managed = await managedTitles();
  let current = null;
  if (tab.groupId !== -1) {
    current = await chrome.tabGroups.get(tab.groupId).catch(() => null);
    if (current && !managed.has(current.title)) return; // user's own group: hands off
  }
  const cat = targetCategory(tab.url, categories, settings);
  if (!cat) {
    if (current) await chrome.tabs.ungroup(tab.id).catch(() => {});
    return;
  }
  if (current && current.title === cat.name) return;
  const existing = await findGroup(tab.windowId, cat.name);
  if (existing) {
    await chrome.tabs.group({ groupId: existing.id, tabIds: [tab.id] });
    return;
  }
  // Create a group only when enough tabs of this category are loose in the window.
  const loose = (await chrome.tabs.query({ windowId: tab.windowId, pinned: false }))
    .filter(t => (t.groupId === -1 || t.id === tab.id) && targetCategory(t.url, categories, settings)?.name === cat.name);
  if (loose.length < Math.max(1, settings.minTabsForGroup)) return;
  const gid = await chrome.tabs.group({ tabIds: loose.map(t => t.id), createProperties: { windowId: tab.windowId } });
  await chrome.tabGroups.update(gid, { title: cat.name, color: cat.color || 'grey' });
}

// Sort every normal window: group by category, order groups as in settings, loose tabs at the end.
async function groupAll() {
  const { categories, settings } = await getConfig();
  const managed = await managedTitles();
  const order = [...categories.map(c => c.name), settings.otherGroupName].filter(Boolean);
  const wins = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  let moved = 0;
  for (const w of wins) {
    const groups = await chrome.tabGroups.query({ windowId: w.id });
    const userGroupIds = new Set(groups.filter(g => !managed.has(g.title)).map(g => g.id));
    const buckets = new Map();
    for (const t of w.tabs) {
      if (t.pinned || userGroupIds.has(t.groupId)) continue;
      const cat = targetCategory(t.url, categories, settings);
      if (!cat) { if (t.groupId !== -1) await chrome.tabs.ungroup(t.id).catch(() => {}); continue; }
      if (!buckets.has(cat.name)) buckets.set(cat.name, { cat, ids: [] });
      buckets.get(cat.name).ids.push(t.id);
    }
    for (const name of order) {
      const b = buckets.get(name); if (!b) continue;
      if (b.ids.length < Math.max(1, settings.minTabsForGroup)) continue;
      const g = await findGroup(w.id, name);
      const gid = await chrome.tabs.group(g ? { groupId: g.id, tabIds: b.ids } : { tabIds: b.ids, createProperties: { windowId: w.id } });
      await chrome.tabGroups.update(gid, { title: name, color: b.cat.color || 'grey', collapsed: false });
      await chrome.tabGroups.move(gid, { index: -1 }).catch(() => {});
      moved += b.ids.length;
    }
    // loose tabs go after the groups
    const loose = (await chrome.tabs.query({ windowId: w.id, pinned: false })).filter(t => t.groupId === -1).map(t => t.id);
    if (loose.length) await chrome.tabs.move(loose, { index: -1 }).catch(() => {});
  }
  return { grouped: moved };
}

async function ungroupAll() {
  const managed = await managedTitles();
  const tabs = await chrome.tabs.query({});
  const ids = [];
  for (const t of tabs) {
    if (t.groupId === -1) continue;
    const g = await chrome.tabGroups.get(t.groupId).catch(() => null);
    if (g && managed.has(g.title)) ids.push(t.id);
  }
  if (ids.length) await chrome.tabs.ungroup(ids);
  return { ungrouped: ids.length };
}

// ---------- duplicates ----------
async function findDuplicates() {
  const tabs = await chrome.tabs.query({ windowType: 'normal' });
  const seen = new Map(); const dupes = [];
  // keep active / pinned tabs first so they survive
  tabs.sort((a, b) => (b.active - a.active) || (b.pinned - a.pinned) || (b.lastAccessed || 0) - (a.lastAccessed || 0));
  for (const t of tabs) {
    if (!isWebUrl(t.url)) continue;
    const k = normUrl(t.url);
    if (seen.has(k)) dupes.push(t); else seen.set(k, t);
  }
  return dupes;
}
async function closeDuplicates() {
  const d = (await findDuplicates()).filter(t => !t.pinned && !t.active);
  if (d.length) await chrome.tabs.remove(d.map(t => t.id));
  return { closed: d.length };
}

// ---------- sleeping ----------
function neverSleep(url, settings) {
  const h = hostOf(url) + (() => { try { return new URL(url).pathname; } catch { return ''; } })();
  return (settings.neverSleep || []).some(p => p && h.includes(p.toLowerCase()));
}
async function sleepIdle(force = false) {
  const { settings } = await getConfig();
  if (!force && !settings.sleepEnabled) return { slept: 0 };
  const { lastActive = {} } = await chrome.storage.session.get('lastActive');
  const limit = Math.max(1, Number(settings.sleepMinutes) || 30) * 60000;
  const now = Date.now();
  const tabs = await chrome.tabs.query({ active: false, discarded: false, audible: false });
  let n = 0;
  for (const t of tabs) {
    if (!isWebUrl(t.url) || t.status !== 'complete' || neverSleep(t.url, settings)) continue;
    const last = lastActive[t.id] || t.lastAccessed || now;
    if (force || now - last >= limit) {
      try { await chrome.tabs.discard(t.id); n++; } catch {}
    }
  }
  if (n) {
    const { slept = {} } = await chrome.storage.local.get('slept');
    const d = todayKey(); slept[d] = (slept[d] || 0) + n;
    for (const k of Object.keys(slept).sort().slice(0, -30)) delete slept[k];
    await chrome.storage.local.set({ slept });
  }
  return { slept: n };
}

// ---------- sessions ----------
async function saveSession({ name, windowId, closeAfter }) {
  const win = windowId ? await chrome.windows.get(windowId, { populate: true }) : await chrome.windows.getLastFocused({ populate: true });
  const groups = await chrome.tabGroups.query({ windowId: win.id });
  const gmap = Object.fromEntries(groups.map(g => [g.id, { title: g.title, color: g.color }]));
  const tabs = win.tabs.filter(t => isWebUrl(t.url)).map(t => ({ url: t.url, title: t.title, pinned: t.pinned, group: gmap[t.groupId] || null }));
  if (!tabs.length) return { saved: 0 };
  const { sessions = [] } = await chrome.storage.local.get('sessions');
  const s = { id: crypto.randomUUID(), name: name || `Session ${new Date().toLocaleString()}`, created: Date.now(), tabs };
  sessions.unshift(s);
  await chrome.storage.local.set({ sessions });
  if (closeAfter) {
    await chrome.windows.create({ url: 'chrome://newtab/' });
    await chrome.windows.remove(win.id);
  }
  return { saved: tabs.length, id: s.id };
}
async function restoreSession(arg) {
  restoring++;
  try { return await doRestore(arg); } finally { setTimeout(() => { restoring = Math.max(0, restoring - 1); }, 3000); }
}
async function doRestore({ id }) {
  const { sessions = [] } = await chrome.storage.local.get('sessions');
  const s = sessions.find(x => x.id === id); if (!s) return { restored: 0 };
  return openTabsInWindow(s.tabs);
}
// Reopen the previous session (or one window / group of it). Skips pages that are already open.
async function restorePrevious({ windowIndex, groupTitle, urls } = {}) {
  restoring++;
  try {
    const { previousSession } = await chrome.storage.local.get('previousSession');
    if (!previousSession) return { restored: 0 };
    let wins = previousSession.windows;
    if (Number.isInteger(windowIndex)) wins = [wins[windowIndex]].filter(Boolean);
    const open = new Set((await chrome.tabs.query({})).map(t => normUrl(t.url || '')));
    let n = 0;
    for (const w of wins) {
      let tabs = w.tabs.filter(t => !open.has(normUrl(t.url)));
      if (groupTitle != null) tabs = tabs.filter(t => (t.group?.title || '') === groupTitle);
      if (Array.isArray(urls)) tabs = tabs.filter(t => urls.includes(t.url));
      if (!tabs.length) continue;
      n += (await openTabsInWindow(tabs)).restored;
    }
    return { restored: n };
  } finally { setTimeout(() => { restoring = Math.max(0, restoring - 1); }, 3000); }
}
async function openTabsInWindow(list) {
  const s = { tabs: list };
  const win = await chrome.windows.create({ url: s.tabs[0].url, focused: true });
  const created = [win.tabs[0]];
  for (const t of s.tabs.slice(1)) created.push(await chrome.tabs.create({ windowId: win.id, url: t.url, active: false, pinned: !!t.pinned }));
  if (s.tabs[0].pinned) await chrome.tabs.update(win.tabs[0].id, { pinned: true });
  const byGroup = new Map();
  s.tabs.forEach((t, i) => { if (t.group && !t.pinned) { const k = t.group.title + '|' + t.group.color; if (!byGroup.has(k)) byGroup.set(k, { g: t.group, ids: [] }); byGroup.get(k).ids.push(created[i].id); } });
  for (const { g, ids } of byGroup.values()) {
    const gid = await chrome.tabs.group({ tabIds: ids, createProperties: { windowId: win.id } });
    await chrome.tabGroups.update(gid, { title: g.title || '', color: g.color || 'grey' });
  }
  return { restored: created.length };
}

// ---------- time tracking ----------
// cur = { host, start } for the focused, active web tab; flushed into time[day][host] seconds.
async function flushTime(next) {
  const { settings } = await getConfig();
  const { cur } = await chrome.storage.session.get('cur');
  const now = Date.now();
  if (cur && cur.host && settings.trackTime) {
    const secs = Math.min(Math.round((now - cur.start) / 1000), 30 * 60);
    if (secs > 0) {
      const { time = {} } = await chrome.storage.local.get('time');
      const day = todayKey(new Date(cur.start));
      time[day] = time[day] || {};
      time[day][cur.host] = (time[day][cur.host] || 0) + secs;
      const keep = Object.keys(time).sort().slice(-60); // keep 60 days
      for (const k of Object.keys(time)) if (!keep.includes(k)) delete time[k];
      await chrome.storage.local.set({ time });
    }
  }
  await chrome.storage.session.set({ cur: next === undefined ? (cur ? { ...cur, start: now } : null) : next });
}
async function trackActive() {
  const w = await chrome.windows.getLastFocused().catch(() => null);
  if (!w || !w.focused) return flushTime(null);
  const [t] = await chrome.tabs.query({ active: true, windowId: w.id });
  const state = await chrome.idle.queryState(120);
  if (!t || !isWebUrl(t.url) || state !== 'active') return flushTime(null);
  const { settings } = await getConfig();
  if (!settings.trackTime || isPrivate(t.url, settings)) return flushTime(null);
  return flushTime({ host: hostOf(t.url), start: Date.now() });
}

// ---------- badge ----------
async function updateBadge() {
  const n = (await chrome.tabs.query({})).length;
  chrome.action.setBadgeBackgroundColor({ color: n > 40 ? '#d93025' : n > 20 ? '#f29900' : '#1a73e8' });
  chrome.action.setBadgeText({ text: String(n) });
}

// ---------- events ----------
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const { lastActive = {} } = await chrome.storage.session.get('lastActive');
  lastActive[tabId] = Date.now();
  await chrome.storage.session.set({ lastActive });
  trackActive();
});
chrome.tabs.onCreated.addListener(async t => {
  scheduleSnapshot();
  const { lastActive = {} } = await chrome.storage.session.get('lastActive');
  lastActive[t.id] = Date.now();
  await chrome.storage.session.set({ lastActive });
  updateBadge();
});
chrome.tabs.onRemoved.addListener(async id => {
  scheduleSnapshot();
  const { lastActive = {} } = await chrome.storage.session.get('lastActive');
  delete lastActive[id];
  await chrome.storage.session.set({ lastActive });
  updateBadge();
});
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status === 'complete' || info.title) scheduleSnapshot();
  if (info.url || (info.status === 'complete' && tab.url)) {
    scheduleGroup(tabId);
    if (tab.active) trackActive();
    if (info.url) {
      const { settings } = await getConfig();
      if (settings.dedupeOnOpen && isWebUrl(info.url)) {
        const k = normUrl(info.url);
        const other = (await chrome.tabs.query({ windowType: 'normal' })).find(t => t.id !== tabId && isWebUrl(t.url) && normUrl(t.url) === k);
        if (other) {
          await chrome.tabs.update(other.id, { active: true });
          await chrome.windows.update(other.windowId, { focused: true });
          await chrome.tabs.remove(tabId).catch(() => {});
        }
      }
    }
  }
});
chrome.windows.onFocusChanged.addListener(() => trackActive());
chrome.idle.onStateChanged.addListener(() => trackActive());
chrome.alarms.onAlarm.addListener(a => {
  if (a.name === SLEEP_ALARM) sleepIdle(false);
  if (a.name === FLUSH_ALARM) flushTime();
});
chrome.commands.onCommand.addListener(cmd => {
  if (cmd === 'group-now') groupAll();
  if (cmd === 'close-duplicates') closeDuplicates();
  if (cmd === 'sleep-now') sleepIdle(true);
  if (cmd === 'welcome-back') openStart();
});

// ---------- messages from popup / dashboard ----------
const serial = fn => (...a) => (queue = queue.then(() => fn(...a))).catch(e => { throw e; });
const handlers = {
  groupAll: serial(groupAll), ungroupAll, closeDuplicates,
  sleepNow: () => sleepIdle(true),
  saveSession, restoreSession, restorePrevious,
  openStart: async () => { await openStart(); return {}; },
  snapshotNow: async () => { await saveSnapshot(); return {}; },
  stats: async () => {
    const tabs = await chrome.tabs.query({});
    const wins = await chrome.windows.getAll({ windowTypes: ['normal'] });
    const dupes = await findDuplicates();
    return { tabs: tabs.length, windows: wins.length, sleeping: tabs.filter(t => t.discarded).length, duplicates: dupes.filter(t => !t.pinned && !t.active).length };
  },
  flush: () => flushTime(),
  wipe: async () => { await chrome.storage.local.clear(); await chrome.storage.session.clear(); await seedActivity(); return {}; }
};
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  // Only our own popup/dashboard pages may call in. Web pages can't reach this (no externally_connectable).
  if (sender.id !== chrome.runtime.id || !String(sender.url || '').startsWith(chrome.runtime.getURL(''))) return false;
  const fn = handlers[msg?.type];
  if (!fn) return false;
  Promise.resolve(fn(msg.payload || {})).then(r => reply({ ok: true, ...r }), e => reply({ ok: false, error: String(e?.message || e) }));
  return true;
});
chrome.tabGroups.onUpdated.addListener(() => scheduleSnapshot());
chrome.tabs.onAttached.addListener(() => scheduleSnapshot());
