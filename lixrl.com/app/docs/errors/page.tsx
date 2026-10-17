'use client';

const H1 = 'text-[2.1rem] md:text-[2.4rem] font-extrabold tracking-tight text-white mb-4 leading-tight';
const LEDE = 'text-white/70 text-base md:text-[1.05rem] leading-relaxed mb-8';
const H2 = 'text-[1.4rem] font-bold text-white tracking-tight mt-12 mb-3';
const P = 'text-white/70 text-[0.96rem] leading-relaxed mb-4';
const PRE = 'p-4 rounded-xl text-[0.85rem] leading-relaxed overflow-x-auto mb-6 font-mono';
const PRE_STYLE = {
  background: 'rgba(0,0,0,0.45)',
  border: '1px solid rgba(0,0,0,0.08)',
  color: '#e8e8ed',
};

const ERRORS: Array<[number, string, string]> = [
  [400, 'Invalid URL', 'Request JSON or a field is invalid.'],
  [401, 'Unauthorized', 'The API key is missing, invalid, expired, or lacks the required scope.'],
  [403, 'Expiring links require Pro tier or above', 'The account plan does not include the requested capability.'],
  [404, 'Not found', 'The resource does not exist for this account.'],
  [409, 'Short code already taken', 'Choose another custom code.'],
  [422, 'That URL is flagged as phishing by Google Safe Browsing', 'The destination failed a safety check.'],
  [429, 'Too many requests', 'Wait for Retry-After or the returned available_at time.'],
  [500, 'Could not create the short link', 'Retry with exponential backoff.'],
];

export default function ErrorsPage() {
  return (
    <article>
      <h1 className={H1}>Error Reference</h1>
      <p className={LEDE}>
        Error responses contain a human-readable <code>error</code> string.
        Use the HTTP status for program flow; error text may become more
        specific as validation improves.
      </p>

      <h2 id="format" className={H2}>Format</h2>
      <pre className={PRE} style={PRE_STYLE}>
        <code>{`{
  "error": "Short code already taken"
}`}</code>
      </pre>

      <h2 id="codes" className={H2}>Codes</h2>
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid rgba(0,0,0,0.10)' }}
      >
        <table className="w-full text-sm">
          <thead style={{ background: 'rgba(0,0,0,0.05)' }}>
            <tr className="text-white/70">
              <th className="text-left px-4 py-2 font-semibold">HTTP</th>
              <th className="text-left px-4 py-2 font-semibold">example error</th>
              <th className="text-left px-4 py-2 font-semibold">meaning</th>
            </tr>
          </thead>
          <tbody>
            {ERRORS.map(([status, example, msg]) => (
              <tr
                key={status}
                className="text-white/80"
                style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}
              >
                <td className="px-4 py-2 font-mono">{status}</td>
                <td className="px-4 py-2 font-mono text-white">{example}</td>
                <td className="px-4 py-2 text-white/70">{msg}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 id="retrying" className={H2}>Retrying</h2>
      <p className={P}>
        4xx errors are deterministic — fix the request and retry. For
        HTTP 429 responses include a <code className="font-mono text-white">Retry-After</code>{' '}
        header in seconds. For 5xx, retry with exponential backoff
        (250ms · 500ms · 1s · 2s · 4s, max 5 tries).
      </p>
    </article>
  );
}
