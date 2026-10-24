// Shared config: categories, defaults, storage helpers, URL matching.
// Chrome tab-group colours: grey blue red yellow green pink purple cyan orange
export const COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

export const DEFAULT_CATEGORIES = [
  { id: 'mail', name: 'Mail & Chat', color: 'red', patterns: ['mail.google.com', 'outlook.', 'chat.google.com', 'web.whatsapp.com', 'slack.com', 'teams.microsoft.com', 'discord.com', 'telegram.org', 'messages.google.com'] },
  { id: 'work', name: 'Work & Docs', color: 'blue', patterns: ['docs.google.com', 'drive.google.com', 'sheets.google.com', 'calendar.google.com', 'meet.google.com', 'notion.so', 'notion.site', 'atlassian.net', 'jira', 'confluence', 'trello.com', 'asana.com', 'clickup.com', 'monday.com', 'airtable.com', 'zoom.us', 'office.com', 'sharepoint.com', 'miro.com', 'canva.com', 'figma.com', 'hubspot.com', 'salesforce.com', 'zendesk.com', 'freshdesk.com', 'intercom.com', 'businessonbot'] },
  { id: 'dev', name: 'Dev', color: 'grey', patterns: ['github.com', 'gitlab.com', 'bitbucket.org', 'stackoverflow.com', 'vercel.com', 'netlify.com', 'supabase.com', 'firebase.google.com', 'console.cloud.google.com', 'aws.amazon.com', 'render.com', 'railway.app', 'cloudflare.com', 'npmjs.com', 'developer.mozilla.org', 'localhost', '127.0.0.1', 'codepen.io', 'replit.com', 'huggingface.co'] },
  { id: 'ai', name: 'AI', color: 'purple', patterns: ['chatgpt.com', 'chat.openai.com', 'openai.com', 'claude.ai', 'anthropic.com', 'gemini.google.com', 'aistudio.google.com', 'perplexity.ai', 'copilot.microsoft.com', 'poe.com', 'deepseek.com', 'grok.com', 'midjourney.com', 'lovable.dev', 'bolt.new', 'v0.dev', 'cursor.com'] },
  { id: 'jobs', name: 'Jobs', color: 'green', patterns: ['linkedin.com/jobs', 'naukri.com', 'indeed.', 'glassdoor.', 'foundit.in', 'instahyre.com', 'wellfound.com', 'cutshort.io', 'hirist.', 'iimjobs.com', 'greenhouse.io', 'lever.co', 'myworkdayjobs.com', 'workday.com', 'smartrecruiters.com', 'ashbyhq.com', 'workable.com', 'careers.', '/careers', 'jobs.'] },
  { id: 'social', name: 'Social', color: 'pink', patterns: ['linkedin.com', 'instagram.com', 'facebook.com', 'x.com', 'twitter.com', 'reddit.com', 'threads.net', 'quora.com', 'pinterest.', 'snapchat.com'] },
  { id: 'video', name: 'Video & Music', color: 'orange', patterns: ['youtube.com', 'youtu.be', 'netflix.com', 'primevideo.com', 'hotstar.com', 'jiocinema.com', 'spotify.com', 'music.apple.com', 'twitch.tv', 'vimeo.com', 'sonyliv.com', 'zee5.com'] },
  { id: 'shop', name: 'Shopping', color: 'yellow', patterns: ['amazon.', 'flipkart.com', 'myntra.com', 'ajio.com', 'meesho.com', 'nykaa.com', 'swiggy.com', 'zomato.com', 'blinkit.com', 'zeptonow.com', 'bigbasket.com', 'ebay.', 'etsy.com', 'aliexpress.', 'shopify.com', 'myshopify.com'] },
  { id: 'money', name: 'Money', color: 'cyan', patterns: ['bank', 'paytm.com', 'phonepe.com', 'razorpay.com', 'stripe.com', 'paypal.com', 'zerodha.com', 'groww.in', 'upstox.com', 'cred.club', 'incometax.gov.in', 'moneycontrol.com', 'tradingview.com'] },
  { id: 'news', name: 'News & Reading', color: 'grey', patterns: ['news.', 'medium.com', 'substack.com', 'wikipedia.org', 'bbc.', 'cnn.com', 'nytimes.com', 'theguardian.com', 'thehindu.com', 'indiatimes.com', 'ndtv.com', 'hindustantimes.com', 'techcrunch.com', 'theverge.com', 'ycombinator.com'] }
];

export const DEFAULT_SETTINGS = {
  autoGroup: true,          // put new/changed tabs into their category group
  collapseOtherGroups: false,
  minTabsForGroup: 1,       // only create a group once N tabs of a category are open
  dedupeOnOpen: false,      // close a newly opened tab if the same page is already open
  sleepEnabled: true,
  sleepMinutes: 30,
  neverSleep: ['mail.google.com', 'web.whatsapp.com', 'meet.google.com', 'music.youtube.com', 'spotify.com'],
  trackTime: true,
  privateSites: [],         // never tracked, never shown in stats (e.g. your company's internal tools)
  theme: 'system',          // 'system' | 'dark' | 'light'
  otherGroupName: '',       // '' = leave unmatched tabs ungrouped
  junkPatterns: ['accounts.google.com', '/login', '/signin', '/sign-in', '/oauth', '/authorize', '/callback', '/redirect', 'otp', '/verify', '/logout', 'auth0.com', 'login.microsoftonline.com', 'about:blank']
};

export async function getConfig() {
  const { categories, settings } = await chrome.storage.local.get(['categories', 'settings']);
  return sanitizeConfig({ categories, settings });
}

export async function saveConfig({ categories, settings }) {
  const patch = {};
  if (categories) patch.categories = categories;
  if (settings) patch.settings = settings;
  await chrome.storage.local.set(patch);
}

// Validate anything that comes from an import file or old storage before using it.
const str = (v, max = 200) => String(v ?? '').slice(0, max);
const list = (v, max = 300) => (Array.isArray(v) ? v : []).map(x => str(x, 200).trim()).filter(Boolean).slice(0, max);
export function sanitizeConfig(cfg = {}) {
  const cats = (Array.isArray(cfg.categories) ? cfg.categories : []).slice(0, 40).map((c, i) => ({
    id: str(c?.id || 'c' + i, 64),
    name: str(c?.name, 40).trim() || 'Untitled',
    color: COLORS.includes(c?.color) ? c.color : 'grey',
    patterns: list(c?.patterns)
  }));
  const s = { ...DEFAULT_SETTINGS };
  const src = cfg.settings || {};
  for (const k of ['autoGroup', 'collapseOtherGroups', 'dedupeOnOpen', 'sleepEnabled', 'trackTime']) if (typeof src[k] === 'boolean') s[k] = src[k];
  for (const [k, lo, hi] of [['minTabsForGroup', 1, 10], ['sleepMinutes', 1, 1440]]) if (Number.isFinite(+src[k])) s[k] = Math.min(hi, Math.max(lo, Math.round(+src[k])));
  for (const k of ['neverSleep', 'junkPatterns', 'privateSites']) if (Array.isArray(src[k])) s[k] = list(src[k]);
  if (typeof src.otherGroupName === 'string') s.otherGroupName = str(src.otherGroupName, 40).trim();
  if (['system', 'dark', 'light'].includes(src.theme)) s.theme = src.theme;
  return { categories: cats.length ? cats : structuredClone(DEFAULT_CATEGORIES), settings: s };
}

export function isPrivate(url, settings) {
  let h = ''; try { const u = new URL(url); h = (u.hostname.replace(/^www\./, '') + u.pathname).toLowerCase(); } catch { return false; }
  return (settings.privateSites || []).some(p => p && h.includes(p.toLowerCase()));
}

// Favicons come from Chrome's own local cache (needs the "favicon" permission) — no network request.
export function faviconUrl(pageUrl, size = 32) {
  const u = new URL(chrome.runtime.getURL('/_favicon/'));
  u.searchParams.set('pageUrl', pageUrl); u.searchParams.set('size', String(size));
  return u.toString();
}

export function applyTheme(theme) {
  const t = theme === 'dark' || theme === 'light' ? theme : (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  document.documentElement.dataset.theme = t;
}

export function isWebUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// Normalise for duplicate detection: drop hash, tracking params, trailing slash.
export function normUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    [...u.searchParams.keys()].forEach(k => { if (/^(utm_|fbclid|gclid|mc_|ref$|ref_src)/i.test(k)) u.searchParams.delete(k); });
    let s = u.toString();
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s.replace(/^https?:\/\/www\./, 'https://').replace(/^http:/, 'https:');
  } catch { return url; }
}

// A pattern matches if it is a substring of host+path. Patterns with "/" match against host+path,
// plain patterns match against the host only (so "bank" does not match a path segment).
// Longest matching pattern wins, which lets "linkedin.com/jobs" beat "linkedin.com".
export function categorize(url, categories) {
  if (!isWebUrl(url)) return null;
  let u; try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  const hp = (host + u.pathname).toLowerCase();
  let best = null, bestLen = 0;
  for (const c of categories) {
    for (const raw of c.patterns || []) {
      const p = String(raw).trim().toLowerCase();
      if (!p) continue;
      const hit = p.includes('/') ? hp.includes(p) : host.includes(p);
      if (hit && p.length > bestLen) { best = c; bestLen = p.length; }
    }
  }
  return best;
}

export function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
