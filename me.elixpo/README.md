<!--
  ELIXPO README - follows the standard template (see elixpo/STANDARDS.md §4).
  Per-repo sections: About / product, Exclusive, and the stack-specific docs.
-->

<p align="center">
  <img src="public/og-image.webp" alt="Elixpo Portfolios - personalized portfolio platform for Elixpo members" width="100%" />
</p>

<h1 align="center">Elixpo Portfolios</h1>

<p align="center">
  <strong>The personalized portfolio platform for Elixpo members.</strong><br/>
  Free and open source, part of an ecosystem built by a global community of 45+ contributors.
</p>

<p align="center">
  <a href="https://me.elixpo.com">me.elixpo.com</a> ·
  <a href="https://elixpo.com">Elixpo</a> ·
  <a href="https://github.com/orgs/elixpo/discussions">Discussions</a> ·
  <a href="https://github.com/elixpo/elixpo_chapter">Monorepo</a>
</p>

<p align="center">

[![Next.js](https://img.shields.io/badge/Next.js_15-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=000)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Framer Motion](https://img.shields.io/badge/Framer_Motion-FF0055?style=for-the-badge&logo=framer&logoColor=white)](https://www.framer.com/motion/)
[![Cloudflare Pages](https://img.shields.io/badge/Cloudflare_Pages-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://pages.cloudflare.com/)

[![License: MIT](https://img.shields.io/badge/License-MIT-E2D9C8?style=flat-square&labelColor=1B1B19)](LICENSE)
[![GitHub repo size](https://img.shields.io/github/repo-size/elixpo/me.elixpo?style=flat-square&color=f6f5f0&labelColor=142018)](https://github.com/elixpo/me.elixpo)
[![GitHub last commit](https://img.shields.io/github/last-commit/elixpo/me.elixpo?style=flat-square&color=f6f5f0&labelColor=142018)](https://github.com/elixpo/me.elixpo/commits/main)
[![Stars](https://img.shields.io/github/stars/elixpo/me.elixpo?style=flat-square&color=18a466&labelColor=142018)](https://github.com/elixpo/me.elixpo/stargazers)

</p>

---

## About

**Elixpo Portfolios** is the official personal-publication surface for the
[Elixpo organization](https://elixpo.com). Each member route connects a person's
projects, research, talks, writing, experience, and verified profiles. It keeps
individual work attributable while linking it back to Elixpo's wider public
record.

No CMS. No database. Just clean, static content that deploys to the edge.

> This repository is the source for **me.elixpo.com** — one of the standalone,
> login-free surfaces of the Elixpo ecosystem.

### Live deployments

| | Member | Portfolio | Role |
|---|--------|-----------|------|
| <img src="https://github.com/Circuit-Overtime.png" width="30" style="border-radius:50%" /> | **Ayushman** | [`me.elixpo.com/ayushman`](https://me.elixpo.com/ayushman) | Founder & Lead Dev |
| <img src="https://github.com/anwe-ch.png" width="30" style="border-radius:50%" /> | **Anwesha** | [`me.elixpo.com/anwesha`](https://me.elixpo.com/anwesha) | Co-Dev & Admin |
| <img src="https://github.com/ez-vivek.png" width="30" style="border-radius:50%" /> | **Vivek** | [`me.elixpo.com/vivek`](https://me.elixpo.com/vivek) | Frontend Developer |
| <img src="https://github.com/karanray06.png" width="30" style="border-radius:50%" /> | **Karan** | [`me.elixpo.com/karan`](https://me.elixpo.com/karan) | Full-Stack & AI Developer |
| <img src="https://github.com/bhumikasudarshani-cmd.png" width="30" style="border-radius:50%" /> | **Bhumika** | [`me.elixpo.com/bhumika`](https://me.elixpo.com/bhumika) | Open-Source Contributor & Full-Stack Developer |

### Features

- **Dynamic routing** — each member gets `/{name}` with all sub-pages auto-generated
- **JSON-driven content** — update your portfolio by editing simple JSON files
- **Static export** — builds to pure static files, deployed on Cloudflare Pages
- **Evidence-led structure** — projects, research, talks, and experience retain their own context
- **Shared Elixpo design system** — paper, ink, leaf green, restrained geometric fields, and accessible type
- **Responsive, motion-conscious design** — normal document scrolling, mobile navigation, and reduced-motion support
- **Search-rich public surfaces** — canonical metadata, structured profiles, robots rules, and generated sitemap records

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

## Place in Elixpo

Elixpo separates software projects, operated services, open research, package
releases, and member portfolios into clear public surfaces. This repository owns
the member-portfolio surface. Organization roles and contribution evidence
remain canonical on [elixpo.com/people](https://elixpo.com/people), while each
member controls the narrative and links on their portfolio route. The full
system map lives at [elixpo.com/architecture](https://elixpo.com/architecture).

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

Brand-ready marks and icons live under [`public/`](public/), and the brand
source of truth (mascot, palette, rules) is maintained in the
[elixpo](https://github.com/elixpo) site repo. A browsable kit is at
**[elixpo.com/assets](https://elixpo.com/assets)**. Generated image assets for
this repo are documented in [`assets.md`](assets.md).

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

**This repository:** None - me.elixpo.com is an official hosted deployment; the
source is MIT.

---

### Adding a new member

1. Create a new directory under `content/` with the member's name.
2. Add the required JSON files: `profile.json`, `home.json`, `about.json`, `projects.json`, `publications.json`, `spotlight.json`, `recommendations.json`, `work.json`, `connect.json`.
3. Add assets under `public/assets/{name}/`.
4. The member's portfolio will be available at `/{name}`.
5. Submit a PR with the new content and assets, and we'll review it for deployment.

<p align="center">
  <sub>Made in the open, together. © 2023-2026 Elixpo.</sub>
</p>
