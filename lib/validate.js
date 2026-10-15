// Shared input validation — usable from both server routes (edge) and client
// components. No DOM / Node APIs.

// ── URL / website validation ──────────────────────────────────────────────
// Websites must be https. Empty is allowed (the field is optional); callers
// that require a value should check separately.

export function isHttpsUrl(value) {
  if (!value) return true; // optional
  const s = String(value).trim();
  if (!s) return true;
  try {
    const u = new URL(s);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Normalise a user-entered website to an https URL, or return null if it can't
// be made https-safe. Bare domains ("example.com") are upgraded to https://.
export function normalizeHttpsUrl(value) {
  if (value == null) return null;
  let s = String(value).trim();
  if (!s) return '';
  if (/^http:\/\//i.test(s)) return null;        // explicit http → reject
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`; // bare domain → upgrade
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

// ── Profanity / NSFW filter ─────────────────────────────────────────────────
// Conservative, word-boundary matched to avoid the "Scunthorpe problem"
// (e.g. "assassin", "Scunthorpe", "class" must NOT trip the filter). A second
// pass catches simple leetspeak obfuscation on a stricter core set.

const BANNED_WORDS = [
  'fuck', 'shit', 'bitch', 'cunt', 'asshole', 'dickhead', 'motherfucker',
  'bastard', 'slut', 'whore', 'faggot', 'nigger', 'nigga', 'retard', 'rape',
  'rapist', 'pedophile', 'pedo', 'paedophile', 'incest', 'bestiality',
  'cum', 'blowjob', 'handjob', 'creampie', 'deepthroat', 'gangbang',
  'porn', 'porno', 'pornography', 'xxx', 'hentai', 'milf', 'dildo',
  'jizz', 'wank', 'twat', 'coon', 'kike', 'chink', 'spic', 'tranny',
];

// Core terms we also catch through leetspeak (l/1, e/3, o/0, a/@/4, s/$, i/!).
const LEET_CORE = [
  'fuck', 'shit', 'bitch', 'cunt', 'nigger', 'nigga', 'faggot', 'rape',
  'porn', 'pedo', 'whore', 'slut',
];

const LEET_MAP = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

function deleet(text) {
  return text
    .toLowerCase()
    .replace(/[0134579@$!]/g, (c) => LEET_MAP[c] || c)
    .replace(/[^a-z]/g, '');
}

const wordRe = new RegExp(`\\b(${BANNED_WORDS.join('|')})\\b`, 'i');

/** Returns the first offending word found, or null if the text is clean. */
export function findProfanity(text) {
  if (!text) return null;
  const s = String(text);
  const m = s.match(wordRe);
  if (m) return m[1].toLowerCase();
  // Leetspeak / spacing obfuscation pass, compared per token so innocent words
  // that contain a core term as a substring (grapes, scrape) do not match.
  const tokens = s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (const tok of tokens) {
    const d = deleet(tok);
    for (const w of LEET_CORE) {
      if (d === w) return w;
    }
  }
  return null;
}

export function containsProfanity(text) {
  return findProfanity(text) != null;
}

// Validate a set of named fields. Returns { ok, error, field } — the first
// failing field, so routes can return a precise 400.
export function validateProfileFields(fields = {}) {
  // https-only website-ish fields
  for (const key of ['website', 'contact_email_url']) {
    if (fields[key] != null && !isHttpsUrl(fields[key])) {
      return { ok: false, field: key, error: 'Website must be a valid https:// URL' };
    }
  }
  // text fields that must be clean
  for (const [key, val] of Object.entries(fields)) {
    if (typeof val !== 'string' || key === 'website') continue;
    const bad = findProfanity(val);
    if (bad) return { ok: false, field: key, error: 'Contains language that is not allowed' };
  }
  return { ok: true };
}
