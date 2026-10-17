<!--
  ELIXPO README - follows the canonical Elixpo template (see elixpo/STANDARDS.md §4).
  Section order is shared across the ecosystem. The About and Exclusive sections,
  plus the product-specific docs, are this repo's own.
-->

<p align="center">
  <img src="public/logo.png" alt="Elixpo Art - AI image and video generation" width="160" />
</p>

<h1 align="center">Elixpo Art</h1>

<p align="center">
  <strong>Create. Connect. Inspire.</strong><br/>
  An AI-powered platform for generating stunning images and video - part of the
  open Elixpo ecosystem.
</p>

<p align="center">
  <a href="https://art.elixpo.com">Elixpo Art</a> ·
  <a href="https://elixpo.com">Elixpo</a> ·
  <a href="https://github.com/orgs/elixpo/discussions">Discussions</a> ·
  <a href="https://github.com/elixpo/elixpo_chapter">Monorepo</a>
</p>

---

> [!IMPORTANT]
> This repository is archived and no longer maintained. It remains available as
> a historical record; no fixes, releases, support, or service availability are
> promised.

## About

**Elixpo Art** is an AI-powered creative platform for generating stunning images
and video. It offers 15+ art styles and 8+ models, advanced image generation,
robust gallery management, and vibrant social features to foster a creative
community. This description records the project as it existed before archival.

> This repository is the source for the **art.elixpo.com** service.

### Features

| Icon | Feature | Description |
| :---: | :--- | :--- |
| 🎨 | **AI Art Generation** | Create stunning, unique artwork using advanced AI models like the Pollinations API. |
| 🔒 | **Secure Auth** | Seamless and secure sign-up, sign-in, and user profile management. |
| 🖼️ | **Gallery System** | Effortlessly browse, save, and manage all your generated masterpieces. |
| 🌐 | **Social Feed** | Share your creations and discover inspiring artwork from the global community. |
| 📚 | **Blog System** | Stay informed with educational content, tutorials, and project updates. |
| 📱 | **Responsive Design** | A beautiful and optimized experience on all devices: desktop, tablet, and mobile. |

### Tech stack

Elixpo Art is built as a comprehensive full-stack application on **Next.js**.

- **Frontend**: Next.js (React 19), modern CSS, JavaScript (ES6+)
- **Backend**: Node.js, Express.js (for a fast, scalable API)
- **Data & auth**: Firebase / Firebase Admin
- **AI integration**: Pollinations API, Groq, Google Generative AI, and other services
- **Package management**: npm

### Running this locally

```bash
npm install
npm run dev
```

> 💡 `npm run dev` launches the Next.js dev server. Some integrations use
> `concurrently` to start backend services alongside the frontend.

**Prerequisites**: Node.js 20.x and npm. You can skip the GitHub PAT (Personal
Access Token) configuration for basic local development.

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

## Brand assets

Brand-ready marks live under [`public/`](public/), and the brand source of truth
(mascot, palette, rules) lives in the [`elixpo`](https://github.com/elixpo/elixpo_chapter)
monorepo. A browsable kit is at **[elixpo.com/assets](https://elixpo.com/assets)**.

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

**This repository:** None. art.elixpo.com is an official hosted service; the
brand and the hosted deployment are reserved, but the source is MIT.

---

<p align="center">
  <sub>Made in the open, together. © 2023-2026 Elixpo.</sub>
</p>
