<!--
  ELIXPO README - follows the Elixpo README standard (see STANDARDS.md §4).
  Section order: banner/title/tagline + quick links, About, Ecosystem,
  Architecture, Built by the community, Recognition & programs, Get involved,
  Brand assets, License, Exclusive.
-->

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=6,11,20&height=180&section=header&text=Elixpo%20Accounts&fontSize=52&fontColor=ffffff&fontAlignY=38&desc=One%20login%20for%20everything%20Elixpo&descAlignY=62&descAlign=50" width="100%" alt="Elixpo Accounts" />

<br/>

<img src="https://raw.githubusercontent.com/elixpo/accounts.elixpo/main/public/og-image.png" alt="Elixpo Accounts" width="720"/>

<br/><br/>

<strong>One identity (SSO) across the entire Elixpo ecosystem.</strong><br/>
Open OAuth 2.0 single sign-on, built on Cloudflare's edge. Free and open source.

<br/><br/>

<a href="https://accounts.elixpo.com">accounts.elixpo.com</a> ·
<a href="https://github.com/orgs/elixpo/discussions">Discussions</a> ·
<a href="https://github.com/elixpo/elixpo_chapter">Monorepo</a>

<br/><br/>

[![License](https://img.shields.io/github/license/elixpo/accounts.elixpo?style=flat-square&color=blue)](LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/elixpo/accounts.elixpo?style=flat-square&color=informational)](https://github.com/elixpo/accounts.elixpo/commits/main)
[![Issues](https://img.shields.io/github/issues/elixpo/accounts.elixpo?style=flat-square&color=yellow)](https://github.com/elixpo/accounts.elixpo/issues)
[![Stars](https://img.shields.io/github/stars/elixpo/accounts.elixpo?style=flat-square&color=gold)](https://github.com/elixpo/accounts.elixpo/stargazers)

</div>

---

## About

**Elixpo Accounts** is your single login for every Elixpo product — chat, art,
blogs, sketch, the URL shortener, and anything else we build. It is the OAuth
2.0 / SSO identity provider that the rest of the ecosystem authenticates
through, running on Cloudflare Pages with the edge runtime.

Make one account here, and you're signed in everywhere. No separate passwords,
no juggling logins. For everyday use you don't need to touch this repo at all —
just go to **[accounts.elixpo.com](https://accounts.elixpo.com)** and sign up.

> This repository is the source for **accounts.elixpo.com** — the central
> identity node of the Elixpo ecosystem. Every SSO-backed product authenticates
> through it.

### What can I do with my account?

- **Sign in once.** Use your Elixpo account on any Elixpo site without making a new login.
- **Choose how to sign in.** Email + password, Google, or GitHub — pick whichever you prefer.
- **Manage your profile in one place.** Update your display name, picture, and bio. Every Elixpo product stays in sync.
- **See which apps you've connected.** Visit your dashboard to view and remove app access whenever you want.
- **Delete your account properly.** One click here removes you from every Elixpo product — no orphaned data left behind.

### I'm a developer — can I let users sign in with Elixpo?

Yes. Anyone can register an app and add a "Sign in with Elixpo" button on their site.

1. Sign in at [accounts.elixpo.com](https://accounts.elixpo.com).
2. Open the dashboard → **OAuth Apps** → register a new app.
3. Follow the consolidated **[integration and SDK reference](docs/README.md)**.

You also get webhook events (like "user deleted their account") so your app can stay in sync automatically.

### Running this locally

This repo runs on **Cloudflare Pages with the edge runtime** (not Node) and uses
**Cloudflare D1 (SQLite)**. The full operating manual — architecture,
edge-runtime constraints, repo layout, migrations, the biome workflow, and
common mistakes — lives in [AGENTS.md](AGENTS.md). Read it before any non-trivial
change.

```bash
npm install                # Node 22+
cp .env.example .env.local # then fill in the values
npm run dev                # Next dev server → http://localhost:3000
npm test                   # vitest
./biome.sh                 # auto-fix lint/format
./biome.sh ci              # strict check — must pass before commit (enforced by CI)
npm run pages:build        # catches edge-runtime incompatibilities
```

Database migrations live in `src/workers/migrations/NNNN_<name>.sql` (gapless
numbering) and are applied via CI on merge to `main`. See
[CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) for the full
contributor and dev workflow.

## The ecosystem

| Tool | What it does | Link |
| --- | --- | --- |
| 🎨 **Elixpo Art** | AI image generation _(under dev)_ | [art.elixpo.com](https://elixpo.com) |
| ✍️ **Elixpo Blogs** | A rich, modern writing and publishing space | [blogs.elixpo.com](https://blogs.elixpo.com) |
| 🖊️ **LixSketch** | A hand-drawn style whiteboard for ideas and diagrams | [sketch.elixpo.com](https://sketch.elixpo.com) |
| 💬 **Elixpo Chat** | A fluid, real-time AI chat experience _(under dev)_ | [chat.elixpo.com](https://chat.elixpo.com) |
| 🔎 **Elixpo Search** | Fast, AI-assisted search | [search.elixpo.com](https://search.elixpo.com) |
| 👤 **Elixpo Accounts** | One identity (SSO) across the ecosystem | [accounts.elixpo.com](https://accounts.elixpo.com) |
| 🔗 **lixrl** | Our flagship URL shortener | [lixrl.com](https://lixrl.com) |
| 🪪 **Portfolios** | Personal pages to showcase your work | [me.elixpo.com](https://me.elixpo.com) |
| 🐼 **Oreo** | The mascot's home | [oreo.elixpo.com](https://oreo.elixpo.com) |

Developers can drop our editors into their own projects with the
**`@elixpo/lixsketch`** and **`@elixpo/lixeditor`** packages, on npm and as VS
Code extensions.

## Architecture

Elixpo Accounts is the central **SSO / identity node** of the ecosystem: SaaS
products (Blogs, Art, Chat, Sketch, Search) and the flagship **lixrl.com** all
authenticate through it. The diagram below shows how accounts.elixpo connects to
the rest of the platform — **Payouts** for billing and **Mails** for
transactional email — and how Razorpay sits in the loop for INR autopay.

```mermaid
flowchart TB
    subgraph BROWSER ["User's Browser"]
        U[User]
    end

    subgraph ACCOUNTS ["accounts.elixpo.com (Cloudflare Pages)"]
        AUI["UI: /pricing /dashboard/subscriptions /login"]
        AAPI["API routes:<br/>/api/billing/checkout<br/>/api/billing/cancel<br/>/api/webhooks/payouts/entitlement<br/>/api/cron/sync-tiers<br/>/api/auth/token"]
        AD1[("D1: users.tier<br/>billing_events<br/>app_usage_monthly")]
        AKV[("KV: sessions<br/>MFA challenges")]
        AAPI --> AD1
        AAPI --> AKV
    end

    subgraph PAYOUTS ["payouts.elixpo.com (Cloudflare Pages)"]
        PAPI["v1 API:<br/>POST /v1/checkout/sessions<br/>POST /v1/subscriptions/cancel<br/>POST /v1/sync"]
        PCHECKOUT["Hosted checkout<br/>/checkout?session=..."]
        PWEBHOOK["Inbound: /api/webhooks/razorpay"]
        POUTBOUND["Outbound webhook dispatcher<br/>fires entitlement.updated"]
        PD1[("D1: products prices<br/>subscriptions<br/>entitlements")]
        PAPI --> PD1
        PWEBHOOK --> PD1
        POUTBOUND --> PD1
    end

    subgraph MAILS ["mails.elixpo.com"]
        MAILSAPI["Per-template hook endpoints"]
    end

    subgraph RAZORPAY ["Razorpay (external)"]
        RZP["Plans + Subscriptions APIs<br/>Hosted mandate UX (rzp.io)"]
    end

    %% User flows — start a subscription
    U -- "1. Click Indie on /pricing" --> AUI
    AUI -- "2. POST /api/billing/checkout<br/>cookie: access_token" --> AAPI
    AAPI -- "3. POST /v1/checkout/sessions<br/>Bearer ELIXPO_ACCOUNTS_PAYOUT_CLIENT_SECRET" --> PAPI
    PAPI -- "4. createSubscription(plan_id)" --> RZP
    RZP -- "5. {short_url}" --> PAPI
    PAPI -- "6. {url: payouts/checkout?session=...}" --> AAPI
    AAPI -- "7. redirect" --> AUI
    AUI -- "8. browser to /checkout" --> PCHECKOUT
    PCHECKOUT -- "9. POST /api/checkout/session" --> PAPI
    PAPI -- "10. {short_url, billing_mode: autopay}" --> PCHECKOUT
    PCHECKOUT -- "11. window.location = short_url" --> RZP

    %% Mandate + first charge
    RZP -- "12. User accepts mandate" --> RZP
    RZP -- "13. subscription.activated<br/>+ subscription.charged" --> PWEBHOOK
    PWEBHOOK -- "14. fulfillPayment<br/>extends entitlement" --> POUTBOUND

    %% Outbound webhook to accounts
    POUTBOUND -- "15. POST /api/webhooks/payouts/entitlement<br/>X-Elixpo-Pay-Signature: sha256=...<br/>HMAC(secret: PAYOUTS_WEBHOOK_SECRET)" --> AAPI
    AAPI -- "16. users.tier = 'indie'<br/>tier_renews_at = ..." --> AD1
    AAPI -- "17. sendMail(billing_subscription_activated)<br/>X-Elixpo-Signature: t=...,v1=...<br/>HMAC(secret: MAILS_SHARED_SECRET)" --> MAILSAPI
    MAILSAPI -- "18. delivers email" --> U

    %% Cancel flow
    U -- "C1. Click Cancel on /dashboard/subscriptions" --> AUI
    AUI -- "C2. POST /api/billing/cancel" --> AAPI
    AAPI -- "C3. POST /v1/subscriptions/cancel<br/>Bearer ELIXPO_ACCOUNTS_PAYOUT_CLIENT_SECRET" --> PAPI
    PAPI -- "C4. cancelSubscription(cancel_at_cycle_end=true)" --> RZP
    RZP -- "C5. subscription.cancelled" --> PWEBHOOK
    PWEBHOOK -- "C6. entitlement.updated<br/>active:true, status:cancelled" --> POUTBOUND
    POUTBOUND --> AAPI
    AAPI -- "C7. sendMail(billing_subscription_cancelled)" --> MAILSAPI

    %% Catalog sync from GitHub Actions
    GH[("GitHub Actions<br/>daily cron")] -- "S1. POST /api/cron/sync-tiers<br/>Bearer ELIXPO_ACCOUNTS_PAYOUT_CLIENT_SECRET" --> AAPI
    AAPI -- "S2. POST /v1/sync<br/>same Bearer key" --> PAPI
    PAPI -- "S3. lazy-creates Plan if needed" --> RZP

    %% MAU counter
    U -- "OAuth flow: /api/auth/token" --> AAPI
    AAPI -- "recordMauHit(client_id, user_id)" --> AD1

    classDef bw fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000
    classDef bwStore fill:#f5f5f5,stroke:#000000,stroke-width:1px,color:#000000
    class U,AUI,AAPI,PAPI,PCHECKOUT,PWEBHOOK,POUTBOUND,MAILSAPI,RZP bw
    class AD1,AKV,PD1,GH bwStore
```

A rendered, interactive view of the whole ecosystem lives at
**[elixpo.com/architecture](https://elixpo.com/architecture)**.

## Built by the community

Elixpo is made by people, in the open. **45+ contributors** have shaped these
tools, with a small core team steering the way:

- **Ayushman Bhattacharya** - Founder & Lead ([@Circuit-Overtime](https://github.com/Circuit-Overtime))
- **Vivek Yadav** - Lead Co-Dev ([@ez-vivek](https://github.com/ez-vivek))
- **Anwesha Chakraborty** - Core Maintainer ([@anwe-ch](https://github.com/anwe-ch))

Everyone is welcome. See **[CONTRIBUTING.md](CONTRIBUTING.md)** and our
**[Code of Conduct](CODE_OF_CONDUCT.md)**.

## Recognition & programs

Elixpo has taken part in and been supported by **GSSOC**, **Hacktoberfest**,
**Pollinations.AI**, **MS Startup Foundations**, and **OSCI**.

## Get involved

- 💬 **Join the conversation** in [GitHub Discussions](https://github.com/orgs/elixpo/discussions).
- 🚀 **Submit your project** to be featured across the ecosystem.
- 🛠️ **Contribute** - browse good first issues in the [monorepo](https://github.com/elixpo/elixpo_chapter).

For security issues, please email us privately instead of opening a public issue.

## Brand assets

Brand-ready marks and per-service icons live under [`public/`](public/), and the
brand source of truth (mascot, palette, rules) is maintained in the
[`elixpo`](https://github.com/elixpo/elixpo) repo. A browsable kit is at
**[elixpo.com/assets](https://elixpo.com/assets)**.

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

**This repository:** Paid subscription tiers. Elixpo Accounts offers paid
**Indie** and **Studio** plans (on top of the free Hobby plan), billed in INR
through the Elixpo payments infrastructure. The paid tiers, pricing, and the
hosted service at accounts.elixpo.com are reserved to Elixpo; the source code
remains MIT.

---

<div align="center">

Made with care by the **[Elixpo](https://github.com/elixpo) Open Source Team**.
<br/>
<sub>Made in the open, together. © 2023-2026 Elixpo.</sub>

</div>

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=6,11,20&height=120&section=footer&reversal=false" width="100%" alt="wave footer"/>
