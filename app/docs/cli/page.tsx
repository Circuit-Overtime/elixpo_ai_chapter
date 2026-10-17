import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

export const runtime = 'edge';

export const metadata: Metadata = {
  title: 'URL Shortener CLI and QR Code Generator — @elixpo/lixrl-cli',
  description:
    'Shorten URLs, generate QR codes, manage branded links, and export click analytics from your terminal with secure Elixpo Accounts device login.',
  keywords: [
    'URL shortener CLI',
    'QR code generator CLI',
    'command line URL shortener',
    'short link automation',
    'QR code automation',
    'link analytics CLI',
  ],
  alternates: { canonical: '/docs/cli' },
  openGraph: {
    title: 'Lixrl CLI — Short URLs and QR codes from your terminal',
    description: 'Create, track, and manage short links and QR codes without leaving your command line.',
    url: '/docs/cli',
    type: 'website',
  },
};

const H2 = 'mt-12 mb-3 text-[1.45rem] font-extrabold tracking-tight text-[#111]';
const H3 = 'mt-7 mb-2 text-[1.05rem] font-bold text-[#222]';
const P = 'mb-4 max-w-[760px] text-[0.96rem] leading-7 text-[#555]';
const CODE =
  'mb-5 overflow-x-auto rounded-xl border border-[#262a3a] bg-[#16192a] p-4 font-mono text-[0.84rem] leading-6 text-[#f1f1f5]';

function Command({ children }: { children: string }) {
  return (
    <pre className={CODE}>
      <code>{children}</code>
    </pre>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="my-5 rounded-xl border border-[#f2c6c4] bg-[#fff7f6] px-4 py-3 text-sm leading-6 text-[#633]">
      {children}
    </div>
  );
}

export default function CliDocsPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Lixrl CLI',
    alternateName: '@elixpo/lixrl-cli',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Linux, macOS, Windows',
    description: 'Command-line URL shortener and QR code generator with link management, analytics exports, and secure device login.',
    downloadUrl: 'https://www.npmjs.com/package/@elixpo/lixrl-cli',
    softwareRequirements: 'Node.js 20 or newer',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };

  return (
    <article className="text-[#111]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <div className="rounded-2xl border border-[#e6e2dc] bg-gradient-to-br from-white to-[#fff8f7] p-6 md:p-8">
        <div className="mb-4 inline-flex rounded-full border border-[#f1c8c6] bg-white px-3 py-1 font-mono text-xs font-semibold text-[#c62828]">
          @elixpo/lixrl-cli
        </div>
        <h1 className="mb-4 max-w-[760px] text-[2.2rem] font-black leading-tight tracking-[-0.035em] text-[#111] md:text-[2.8rem]">
          Short links and QR codes from your terminal
        </h1>
        <p className="max-w-[740px] text-base leading-7 text-[#555] md:text-[1.05rem]">
          Create short URLs, generate QR codes, export analytics, and manage
          every production link from one command line. Keep work moving without
          switching between link tools, dashboards, and manual copy-paste steps.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="https://www.npmjs.com/package/@elixpo/lixrl-cli"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-[#e53935] px-4 py-2.5 text-sm font-bold text-white no-underline"
          >
            View npm package
          </a>
          <Link
            href="#sign-in"
            className="rounded-lg border border-[#d8d8d8] bg-white px-4 py-2.5 text-sm font-bold text-[#222] no-underline"
          >
            See secure sign-in
          </Link>
        </div>
      </div>

      <h2 id="install" className={H2}>Install</h2>
      <p className={P}>
        Node.js 20 or newer is required. The package installs both{' '}
        <code className="font-mono text-[#222]">lixrl</code> and the compatible{' '}
        <code className="font-mono text-[#222]">shortner</code> alias.
      </p>
      <Command>{`npm install --global @elixpo/lixrl-cli
lixrl --version
lixrl --help`}</Command>

      <h2 id="why-cli" className={H2}>One link workflow for people and automation</h2>
      <p className={P}>
        Link work often begins in a terminal, deployment job, or writing agent,
        but finishes through disconnected browser steps. Lixrl keeps short URLs,
        QR assets, link status, and analytics in one predictable workflow while
        still giving you a clear dashboard whenever you want a visual view.
      </p>

      <h2 id="sign-in" className={H2}>Sign in and authenticate</h2>
      <p className={P}>
        Login first reuses a valid key already stored for the selected profile.
        Otherwise, choose browser-based device login or paste a raw key you
        already created. Both paths store the final Lixrl key in your
        operating-system keychain; passwords and browser cookies never enter
        the CLI.
      </p>

      <h3 id="device-login" className={H3}>Recommended: Accounts device login</h3>
      <ol className="mb-5 list-decimal space-y-2 pl-6 text-[0.96rem] leading-7 text-[#555]">
        <li>Run the command and choose whether to create a new key or paste an existing key.</li>
        <li>For a new key, the CLI displays a prefilled official Accounts URL and one-time code.</li>
        <li>Press Enter to open the URL, or use <code className="font-mono">--open</code> to launch it immediately.</li>
        <li>The CLI opens a Lixrl approval page where you choose the key name, read or read/write access, and an optional expiry.</li>
        <li>Lixrl enforces your plan&apos;s key limit, delivers the key directly to the waiting CLI, and stores only its hash.</li>
      </ol>
      <Command>{`lixrl login
lixrl login --new-key --open
lixrl whoami`}</Command>
      <p className={P}>
        Running <code className="font-mono">lixrl login</code> again reuses a
        valid key already stored for the selected profile. Use{' '}
        <code className="font-mono">lixrl login --new-key</code> only when you
        intentionally want another key.
        The CLI cannot revoke account keys during device login; when the limit
        is full, revoke one in the browser, wait for the **Revoked** status, and
        then press Enter in the terminal.
      </p>
      <p className={P}>
        Read-only keys can list links, analytics, and exports without changing
        data. Read/write keys can also create, update, disable, and delete
        links. The approval screen shows the active-key allowance for your plan.
        If that allowance is full, the CLI offers to open key management and
        retry after you revoke an unused key.
      </p>
      <Note>
        The one-time code authorizes only the displayed Lixrl request. Temporary
        Accounts tokens remain in memory and are revoked before the Lixrl key is
        delivered. The CLI never receives your password, browser session, or MFA response.
      </Note>

      <h3 id="direct-key-login" className={H3}>Paste an existing API key</h3>
      <p className={P}>
        If you or an administrator already created a restricted key under{' '}
        <Link href="/profile/keys" className="font-semibold text-[#c62828]">
        Profile → API Keys
        </Link>, choose option 2 during login or paste it through the masked prompt:
      </p>
      <Command>{`lixrl login --key
lixrl whoami`}</Command>
      <Note>
        Never place an <code className="font-mono">elu_…</code> key in a URL,
        source file, generated article, issue, or chat message. Lixrl stores
        only the key hash, so a dashboard row cannot reveal the raw value later.
      </Note>
      <p className={P}>
        The CLI briefly retries transient login configuration and discovery
        failures. Persistent errors identify whether Lixrl configuration,
        Accounts timeout, network/DNS/TLS access, an HTTP response, or
        incompatible authorization metadata caused the failure.
      </p>

      <h3 id="profiles" className={H3}>Multiple accounts</h3>
      <Command>{`lixrl login --profile work --open
lixrl profiles
lixrl use work
lixrl whoami --profile work`}</Command>
      <p className={P}>
        Profile names are non-secret aliases. Each profile&apos;s API key remains
        in the keychain. Logging out removes only the selected local credential;
        revoke the key separately when it must stop working everywhere.
      </p>
      <Command>{`lixrl keys revoke 42 --yes
lixrl logout --profile work --yes`}</Command>

      <h3 id="ci-authentication" className={H3}>CI and non-interactive agents</h3>
      <p className={P}>
        Store the key in the CI provider&apos;s encrypted secret store and expose it
        only to the command process as <code className="font-mono">LIXRL_API_KEY</code>.
        Automation should always add <code className="font-mono">--json --no-input</code>.
      </p>
      <Command>{`lixrl whoami --json --no-input
lixrl urls create "https://example.com/article" \
  --title "Article" --tag automation --json --no-input`}</Command>

      <h2 id="links" className={H2}>Manage short links</h2>
      <p className={P}>
        Interactive output uses green for completed operations, purple for
        status information, yellow for correctable input warnings, and red for
        failures. Set <code className="font-mono">NO_COLOR=1</code> for plain
        output. Commands and required flags are checked before authentication,
        so a typo or missing <code className="font-mono">--file</code> is
        reported without asking you to sign in. A compact spinner appears only
        while network, approval, keychain, or QR work is pending; JSON, quiet,
        and piped output never receive spinner frames.
      </p>
      <Command>{`# Create
lixrl urls create "https://example.com/launch" \
  --title "Launch" --campaign launch --tag release

# Search and inspect
lixrl urls list --search launch --limit 25
lixrl urls get abc123

# Update or pause without deleting
lixrl urls update abc123 --destination "https://example.com/new"
lixrl urls disable abc123
lixrl urls enable abc123

# Destructive operations require confirmation
lixrl urls delete abc123 --yes`}</Command>
      <p className={P}>
        Paid plans can add custom slugs and expiry dates with{' '}
        <code className="font-mono">--slug</code> and{' '}
        <code className="font-mono">--expires</code>. Bulk creation accepts a
        JSON array through <code className="font-mono">--file</code>.
      </p>

      <h2 id="analytics" className={H2}>Analytics and exports</h2>
      <Command>{`lixrl urls analytics abc123 --days 30 --json
lixrl urls export --output links.csv
lixrl urls export-clicks abc123 --output clicks.csv`}</Command>
      <p className={P}>
        Exports refuse to replace an existing file. An intentional replacement
        requires both <code className="font-mono">--force</code> and{' '}
        <code className="font-mono">--yes</code>.
      </p>

      <h2 id="qr-codes" className={H2}>Generate QR codes</h2>
      <p className={P}>
        Basic QR generation runs locally. SVG is the best default for print;
        PNG and JPEG are available for image workflows. Paid styles, center
        logos, and tracked QR links verify the active account plan.
      </p>
      <Command>{`lixrl qr "https://example.com" --format svg --output code.svg
lixrl qr "https://example.com" --format png --style rounded --size 1024 --output code.png
lixrl qr "https://example.com" --track --style aurora --title "Print campaign" --output tracked.svg`}</Command>

      <h2 id="domains-and-keys" className={H2}>API keys and branded subdomains</h2>
      <Command>{`lixrl keys list
lixrl keys create --name deploy --scopes read,write

lixrl domains list
lixrl domains claim team
lixrl domains verify 12
lixrl domains map 12 abc123 --slug launch`}</Command>
      <p className={P}>
        Key creation prints the secret once. Capture it directly into the
        intended secret store and do not include command output in logs.
        Subdomain commands follow your current plan entitlement.
      </p>

      <h2 id="agent-skills" className={H2}>Agent skills</h2>
      <p className={P}>
        The npm artifact includes focused skills for link management and QR
        generation. Nothing is copied during package installation; install only
        the skill the agent needs.
      </p>
      <Command>{`lixrl skills list
lixrl skills inspect lixrl-links
lixrl skills install lixrl-links
lixrl skills install lixrl-qr`}</Command>
      <p className={P}>
        The link skill contains a separate writing workflow: agents shorten
        only public canonical destinations selected by the author, preserve the
        original destination, and request approval before replacing a link in a
        post. LixBlogs OAuth tokens are never reused as Lixrl credentials.
      </p>

      <h2 id="automation-contract" className={H2}>Automation contract</h2>
      <ul className="mb-6 list-disc space-y-2 pl-6 text-[0.96rem] leading-7 text-[#555]">
        <li><code className="font-mono">--json</code> returns stable machine-readable output.</li>
        <li><code className="font-mono">--no-input</code> prevents hidden prompts in agents and CI.</li>
        <li>Deletion, revocation, unmapping, and overwrite operations require <code className="font-mono">--yes</code>.</li>
        <li>Exit code 2 means invalid usage, 4 means authentication is required, and 5 means confirmation is missing.</li>
        <li>API errors may include a request ID for support; credentials are redacted.</li>
      </ul>

      <h2 id="configuration" className={H2}>Configuration</h2>
      <p className={P}>
        Production defaults to <code className="font-mono">https://lixrl.com</code>.
        Use <code className="font-mono">--api-url</code> or{' '}
        <code className="font-mono">LIXRL_API_URL</code> only for an intentional
        Lixrl environment. Non-local HTTP origins are rejected.
      </p>
      <Command>{`lixrl --help
lixrl whoami --profile default --json --no-input`}</Command>
    </article>
  );
}
