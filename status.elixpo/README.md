<!--
  ELIXPO README - follows the standard template (STANDARDS.md §4).
  Section order preserved. The "Exclusive" section is None for this repo.
-->

<p align="center">
  <img src="public/og-image.png" alt="Elixpo Status - the public health page for every Elixpo service" width="100%" />
</p>

<h1 align="center">Elixpo Status</h1>

<p align="center">
  <strong>The live health and uptime page for everything Elixpo.</strong><br/>
  Cloudflare-native, open source, and maintained alongside the services it observes.
</p>

<p align="center">
  <a href="https://status.elixpo.com">Status page</a> ·
  <a href="https://elixpo.com">Website</a> ·
  <a href="https://github.com/orgs/elixpo/discussions">Discussions</a> ·
  <a href="https://github.com/elixpo/elixpo_chapter">Monorepo</a> ·
  <a href="https://github.com/elixpo/status.elixpo/issues">Report a status problem</a>
</p>

---

## About

**Elixpo Status** is the page you check when you want to know, at a glance,
whether Elixpo's services are working right now → **[status.elixpo.com](https://status.elixpo.com)**.
Think of it like the "Is it down?" board you'd see for any big online product —
green means everything's fine, amber means something's slow, red means something's
broken.

> This repository is the source for the public, Cloudflare-native status and
> uptime page that covers every Elixpo service.

### What it shows you

- **Every Elixpo service in one place** — the main site plus Blogs, Sketch,
  Accounts, Payouts, Mail, Portfolio and more.
- **A simple health label for each one:**
  - 🟢 **Operational** — the latest observed hour is working normally.
  - 🟠 **Degraded performance** — the latest observed hour contains an elevated error rate.
  - 🔴 **Outage** — the latest observed hour contains sustained, significant errors.
  - ⚪ **No traffic** — the latest observed hour contains no requests, so no operational conclusion is inferred.
  - **Monitoring unavailable** — the analytics query failed; this is never presented as an all-clear.
- **90 days of history** — a bar showing how reliable the platform has been over
  the last three months, so you can see good days and bad days at a glance.
- **Recent changes** — a short list of the latest updates and fixes.

### Where the numbers come from

The status is measured automatically from real visitor traffic at Cloudflare's
network (the layer that sits in front of every Elixpo service). Current health
uses the most recent hour, while the bars retain 24-hour or 90-day historical
context. When too many requests come back as errors, the service is marked as
degraded or down. There's no manual switch to flip and no separate monitoring
tool — the page reflects what real users are actually experiencing.

The page reports what the configured Cloudflare analytics source can observe.
When that source cannot be reached, the public service directory remains
available and the page explicitly withholds an operational conclusion.

## The ecosystem

| Tool | What it does | Link |
| --- | --- | --- |
| ✍️ **Elixpo Blogs** | A rich, modern writing and publishing space | [blogs.elixpo.com](https://blogs.elixpo.com) |
| 🖊️ **LixSketch** | A hand-drawn style whiteboard for ideas and diagrams | [sketch.elixpo.com](https://sketch.elixpo.com) |
| 🔎 **OreoLook** | Open research and cited web search | [search.elixpo.com](https://search.elixpo.com) |
| 👤 **Elixpo Accounts** | One identity (SSO) across the ecosystem | [accounts.elixpo.com](https://accounts.elixpo.com) |
| 🔗 **lixrl** | Our flagship URL shortener | [lixrl.com](https://lixrl.com) |
| 🪪 **Portfolios** | Personal pages to showcase your work | [me.elixpo.com](https://me.elixpo.com) |
| 🐼 **Oreo** | The mascot's home | [oreo.elixpo.com](https://oreo.elixpo.com) |
| 🧪 **Elixpo Research** | Papers, artifacts, source, and reproducibility records | [research.elixpo.com](https://research.elixpo.com) |
| 📦 **Elixpo Packages** | Signed Linux applications and developer packages | [packages.elixpo.com](https://packages.elixpo.com) |

Developers can drop our editors into their own projects with the
**`@elixpo/lixsketch`** and **`@elixpo/lixeditor`** packages, on npm and as VS
Code extensions.

## Architecture

Everything runs on **Cloudflare**. Three shared platform services back the
ecosystem, and products are either **SSO-backed SaaS**, **standalone**, or our
**flagship**:

- **`accounts.elixpo`** - single sign-on / identity
- **`mails.elixpo`** - shared mailing infrastructure
- **`payouts.elixpo`** - shared payments / payouts

SaaS products (Blogs, Art, Chat, Sketch, Search) and the flagship **lixrl.com**
all authenticate through Accounts (SSO) and share the Mail and Payouts infra.
The public, login-free surfaces (**elixpo.com**, **oreo.elixpo**, **me.elixpo**)
are standalone. **admin.elixpo** is the operations dashboard and
**status.elixpo** is monitoring.

```mermaid
graph TB
  classDef shared fill:#1d1d1d,stroke:#DEDBC8,color:#E1E0CC;
  classDef saas fill:#141414,stroke:#9a9a9a,color:#E1E0CC;
  classDef flag fill:#2a2410,stroke:#FFBE1E,color:#ffffff;
  classDef solo fill:#141414,stroke:#00B4A5,color:#E1E0CC;
  classDef ops fill:#141414,stroke:#FF5D68,color:#E1E0CC;

  subgraph SHARED["Shared platform"]
    ACC["accounts.elixpo<br/>SSO / Identity"]:::shared
    MAIL["mails.elixpo<br/>Mail infra"]:::shared
    PAY["payouts.elixpo<br/>Payments"]:::shared
  end

  subgraph PRODUCTS["SaaS products - require login"]
    BLOGS["blogs.elixpo"]:::saas
    ART["art.elixpo (under dev)"]:::saas
    CHAT["chat.elixpo (under dev)"]:::saas
    SKETCH["sketch.elixpo"]:::saas
    SEARCH["search.elixpo"]:::saas
  end

  LIXRL["lixrl.com<br/>URL shortener · flagship"]:::flag

  subgraph SOLO["Standalone - no login"]
    HOME["elixpo.com"]:::solo
    OREO["oreo.elixpo"]:::solo
    ME["me.elixpo"]:::solo
  end

  subgraph OPS["Operations"]
    ADMIN["admin.elixpo<br/>Dashboard"]:::ops
    STATUS["status.elixpo<br/>Monitoring"]:::ops
  end

  BLOGS & ART & CHAT & SKETCH & SEARCH & LIXRL --> ACC
  BLOGS & ART & CHAT & SKETCH & SEARCH & LIXRL --> MAIL
  BLOGS & ART & CHAT & SKETCH & SEARCH & LIXRL --> PAY
  ADMIN -.- ACC
  STATUS -.- MAIL
```

A rendered, interactive version lives at **[elixpo.com/architecture](https://elixpo.com/architecture)**.

## Built by the community

Elixpo is developed in public by maintainers and contributors across its active
projects. Current roles and attributable work are published in the
[organization people directory](https://elixpo.com/people).

- **Ayushman Bhattacharya** - Founder & Lead ([@Circuit-Overtime](https://github.com/Circuit-Overtime))
- **Vivek Yadav** - Lead Co-Dev ([@ez-vivek](https://github.com/ez-vivek))
- **Anwesha Chakraborty** - Core Maintainer ([@anwe-ch](https://github.com/anwe-ch))

Everyone is welcome. See **[CONTRIBUTING.md](CONTRIBUTING.md)** and our
**[Code of Conduct](CODE_OF_CONDUCT.md)**.

## Get involved

- 💬 **Join the conversation** in [GitHub Discussions](https://github.com/orgs/elixpo/discussions).
- 🛠️ **Contribute** through the public paths listed in the [project directory](https://elixpo.com/projects).
- 📣 **Report a status problem** in this repository's [issue tracker](https://github.com/elixpo/status.elixpo/issues).

## Brand assets

Brand-ready marks for this service live under [`public/`](public/) (logo, icons,
and the OG image). The brand source of truth (mascot, palette, rules) and a
browsable kit are at **[elixpo.com/assets](https://elixpo.com/assets)**.

## License

Elixpo uses one **licensing standard** across every repository:

- **Code** - [MIT](LICENSES/preferred/MIT) (with the [Oreo-trademarks exception](LICENSES/exceptions/Oreo-trademarks)).
- **Brand & visual assets** - [CC-BY-4.0](LICENSES/preferred/CC-BY-4.0) (with the same exception).

The Oreo mascot, the chest E-badge, and the "Elixpo" and "Oreo" names, domains,
and palette are reserved - this protects the brand and its royalties while
keeping the code and assets free. See [`LICENSE`](LICENSE) and the per-product
notice board, [`NOTICE`](LICENSES/NOTICE).

## Exclusive

> Per-repo "exclusive" artifacts (an npm package, a VS Code extension, a hosted
> SaaS, a paid tier) are declared here and in [`NOTICE`](LICENSES/NOTICE).

**This repository:** None - it is the source for a hosted status page.

---

## Running this locally

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

For deploys: this is built with Next.js and deployed on Cloudflare Pages — see
`wrangler.toml` for the deploy config and run `npm run pages:deploy` to publish.

<p align="center">
  <sub>Made in the open, together. © 2023-2026 Elixpo.</sub>
</p>
