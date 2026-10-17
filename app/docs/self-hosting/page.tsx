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

export default function SelfHostingPage() {
  return (
    <article>
      <h1 className={H1}>Self-Hosting</h1>
      <p className={LEDE}>
        ElixpoURL is open source under MIT. Stand up your own instance on
        Cloudflare Pages in about ten minutes.
      </p>

      <h2 id="prerequisites" className={H2}>Prerequisites</h2>
      <ul className="space-y-2 list-none p-0 mb-6">
        {[
          'Cloudflare account with Pages and D1 enabled.',
          'Node.js 22 or newer.',
          'wrangler CLI (npm i -g wrangler).',
          'An Elixpo Accounts OAuth app (or your own OAuth provider).',
        ].map((line) => (
          <li key={line} className="text-white/70 text-[0.96rem] flex gap-2.5">
            <span className="mt-2 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#e53935]" />
            {line}
          </li>
        ))}
      </ul>

      <h2 id="clone-and-install" className={H2}>1. Clone and install</h2>
      <pre className={PRE} style={PRE_STYLE}>
        <code>{`git clone https://github.com/elixpo/elixpourl.git
cd elixpourl
npm install`}</code>
      </pre>

      <h2 id="provision-d1" className={H2}>2. Provision D1</h2>
      <pre className={PRE} style={PRE_STYLE}>
        <code>{`npx wrangler d1 create elixpourl
# paste the printed database_id into wrangler.toml
npm run db:migrate:local
npm run db:migrate:remote`}</code>
      </pre>

      <h2 id="configure-env" className={H2}>3. Configure env</h2>
      <p className={P}>
        Copy <code className="font-mono text-white">.env.example</code> →{' '}
        <code className="font-mono text-white">.env</code> and fill in your
        OAuth client ID/secret, the session secret, and the public site URL.
      </p>

      <h2 id="deploy" className={H2}>4. Deploy</h2>
      <pre className={PRE} style={PRE_STYLE}>
        <code>./deploy.sh build deploy</code>
      </pre>
      <p className={P}>
        The script builds with{' '}
        <code className="font-mono text-white">@cloudflare/next-on-pages</code>,
        deploys to Cloudflare Pages on the <code className="font-mono text-white">main</code> branch
        (override with <code className="font-mono text-white">DEPLOY_BRANCH</code>), and
        refuses to run as root.
      </p>

      <h2 id="updates" className={H2}>Staying up to date</h2>
      <p className={P}>
        Pull from upstream, re-run migrations, rebuild. We keep migrations
        gapless so updates are predictable.
      </p>

      <h2 id="license-and-branding" className={H2}>License and branding</h2>
      <p className={P}>
        Code is MIT. The Elixpo wordmark, the Oreo mascot, and the brand
        palette stay with us — see <code className="font-mono text-white">LICENSES/exceptions/Oreo-trademarks</code> in
        the repo. Self-hosted instances should ship with your own brand.
      </p>
    </article>
  );
}
