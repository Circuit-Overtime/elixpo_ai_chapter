/**
 * Google Safe Browsing integration.
 *
 * Looks up a URL against Google's malware + phishing + unwanted-software
 * lists. Returns the matched threat type, or null if the URL is clean
 * (or the check couldn't run).
 *
 * The check is OPT-IN via the SAFE_BROWSING_API_KEY env var. Without a
 * key, all URLs are treated as clean — useful for local dev without
 * burning quota. The validator code at the call site treats `null` as
 * "no signal" and never blocks on that alone.
 *
 * Quota: free tier is 10,000 requests/day per project. That's plenty
 * for typical URL-shortener traffic.
 *
 * Docs: https://developers.google.com/safe-browsing/v4/lookup-api
 */

type ThreatType =
  | 'MALWARE'
  | 'SOCIAL_ENGINEERING'
  | 'UNWANTED_SOFTWARE'
  | 'POTENTIALLY_HARMFUL_APPLICATION';

interface ThreatMatch {
  threatType: ThreatType;
  platformType: string;
  threat: { url: string };
}

interface LookupResponse {
  matches?: ThreatMatch[];
}

const ENDPOINT = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';
const PLATFORMS = ['ANY_PLATFORM'];
const THREAT_TYPES: ThreatType[] = [
  'MALWARE',
  'SOCIAL_ENGINEERING',
  'UNWANTED_SOFTWARE',
  'POTENTIALLY_HARMFUL_APPLICATION',
];

/**
 * Look up a URL against Safe Browsing.
 *
 * Returns:
 *   - threat-type string ('MALWARE', 'SOCIAL_ENGINEERING', etc.) if matched
 *   - null if clean OR if the check couldn't run (no API key, network
 *     error, malformed response). Caller should treat null as "no signal".
 *
 * Hardened against the lookup API blowing up — we never reject a URL just
 * because Google had a bad day.
 */
export async function checkSafeBrowsing(
  url: string,
  apiKey: string | undefined,
): Promise<ThreatType | null> {
  if (!apiKey) return null;

  const body = {
    client: {
      clientId: 'elixpourl',
      clientVersion: '1.0.0',
    },
    threatInfo: {
      threatTypes: THREAT_TYPES,
      platformTypes: PLATFORMS,
      threatEntryTypes: ['URL'],
      threatEntries: [{ url }],
    },
  };

  try {
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // Hard cap so a slow Safe Browsing response can't slow the create
      // endpoint to a crawl. 3s is generous; Google typically responds
      // under 200ms.
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      console.warn(`[safebrowsing] non-OK response: ${res.status}`);
      return null;
    }

    const data = (await res.json()) as LookupResponse;
    if (!data.matches || data.matches.length === 0) return null;
    return data.matches[0].threatType;
  } catch (err) {
    // Timeout, network error, parse error — fail open.
    console.warn(`[safebrowsing] check failed:`, err);
    return null;
  }
}

/**
 * Human-friendly error message for a threat type. Goes to the user
 * verbatim — keep it factual, no scolding.
 */
export function threatMessage(threat: ThreatType): string {
  switch (threat) {
    case 'MALWARE':
      return 'That URL is flagged as malware by Google Safe Browsing';
    case 'SOCIAL_ENGINEERING':
      return 'That URL is flagged as phishing by Google Safe Browsing';
    case 'UNWANTED_SOFTWARE':
      return 'That URL is flagged for distributing unwanted software';
    case 'POTENTIALLY_HARMFUL_APPLICATION':
      return 'That URL is flagged as potentially harmful';
  }
}
