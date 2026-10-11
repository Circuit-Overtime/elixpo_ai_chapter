<div align="center">

<img src="public/logo.png" alt="LixBlogs Logo" width="80" />

# LixBlogs

### Write, collaborate, and publish beautifully.

A modern blogging platform with a rich block editor, AI writing assistant,<br />
real-time collaboration, and organizations — all on the edge.

<br />

[![Live](https://img.shields.io/badge/Live-blogs.elixpo.com-9b7bf7?style=for-the-badge&logo=googlechrome&logoColor=white)](https://blogs.elixpo.com)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/elixpo/lixblogs)
[![npm](https://img.shields.io/npm/v/@elixpo/lixeditor?style=for-the-badge&color=cb3837&logo=npm&logoColor=white&label=@elixpo/lixeditor)](https://www.npmjs.com/package/@elixpo/lixeditor)
[![VS Code](https://img.shields.io/badge/VS_Code-Extension-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=elixpo.lixeditor)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

[![Next.js](https://img.shields.io/badge/Next.js_15-black?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Cloudflare](https://img.shields.io/badge/Cloudflare_Pages-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://pages.cloudflare.com)
[![Tailwind](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![BlockNote](https://img.shields.io/badge/BlockNote-Editor-9b7bf7?style=flat-square)](https://blocknotejs.org)

[Website](https://blogs.elixpo.com) ·
[Discussions](https://github.com/orgs/elixpo/discussions) ·
[Monorepo](https://github.com/elixpo/elixpo_chapter) ·
[Sponsor](https://github.com/sponsors/Circuit-Overtime)

</div>

<br />

<div align="center">
<img src="public/banner.png" alt="LixBlogs Banner" width="100%" style="border-radius: 12px;" />
</div>

<br />

## About

LixBlogs (also called **Elixpo Blogs**) is a **free, open-source blogging
platform** designed for creators, developers, and teams. It gives you a
beautiful writing experience with powerful tools built right in — a rich block
editor, an AI writing assistant, real-time collaboration, and organizations —
all deployed on **Cloudflare's edge** and hosted at
[blogs.elixpo.com](https://blogs.elixpo.com).

Whether you're writing a personal blog, publishing under your organization, or
co-authoring with teammates in real-time, LixBlogs has you covered. No plugins
to install, no complicated setup, no premium tiers.

This is a monorepo: alongside the platform it ships **`@elixpo/lixeditor`** (the
editor on npm) and the **LixEditor** VS Code extension. It is part of the wider
Elixpo ecosystem.

<br />

<div align="center">

| | Feature | Description |
|:---:|:---|:---|
| :sparkles: | **AI Writing Assistant** | Press `Space` on an empty line — generate text, images, and get inline suggestions |
| :jigsaw: | **Rich Block Editor** | 20+ block types — code, math equations, diagrams, embeds, tables, and more |
| :busts_in_silhouette: | **Real-Time Collaboration** | Invite co-authors and edit together with live cursors and presence |
| :office: | **Organizations & Teams** | Create orgs, assign roles, organize content into collections |
| :cloud: | **Auto-Save & Cloud Sync** | Drafts save locally and sync to the cloud — never lose a word |
| :art: | **Themes & Customization** | Light & dark modes, custom page colors, cover images, page emojis |
| :link: | **Link Previews** | Hover any link to see a rich OG preview card with title, image, favicon |
| :page_facing_up: | **Sub-Pages** | Nest pages inside your blog for structured, multi-page content |
| :framed_picture: | **Media Uploads** | Drag & drop images, auto-compressed to WebP, with platform or creator-owned Cloudinary storage |
| :bookmark_tabs: | **Library & Bookmarks** | Save posts, organize into collections, track reading history |

</div>

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

<br />

<img width="100%" src="https://capsule-render.vercel.app/api?type=wave&color=9b7bf7&height=120&section=header&text=&fontSize=0" />

## `@elixpo/lixeditor` — Use Our Editor Anywhere

The editor that powers LixBlogs is available as a **standalone npm package**. Drop it into any React or Next.js app to get a fully-featured WYSIWYG editor with equations, diagrams, code highlighting, and more.

```bash
npm install @elixpo/lixeditor @blocknote/core @blocknote/react @blocknote/mantine
```

```jsx
import { LixEditor, LixPreview, LixThemeProvider } from '@elixpo/lixeditor';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import '@elixpo/lixeditor/styles';

function App() {
  const [blocks, setBlocks] = useState(null);

  return (
    <LixThemeProvider defaultTheme="dark">
      <LixEditor
        initialContent={blocks}
        onChange={(editor) => setBlocks(editor.getBlocks())}
        features={{ equations: true, mermaid: true, codeHighlighting: true }}
        placeholder="Start writing..."
      />
      <LixPreview blocks={blocks} />
    </LixThemeProvider>
  );
}
```

<div align="center">

| Feature | Default | Description |
|---------|:-------:|-------------|
| `equations` | :white_check_mark: | Block & inline LaTeX via KaTeX |
| `mermaid` | :white_check_mark: | Mermaid diagrams (flowcharts, sequence, git graphs) |
| `codeHighlighting` | :white_check_mark: | Shiki syntax highlighting — 30+ languages |
| `tableOfContents` | :white_check_mark: | Auto-generated TOC from headings |
| `images` | :white_check_mark: | Upload, embed URL, paste, drag & drop |
| `dates` | :white_check_mark: | Inline date picker chips |
| `linkPreview` | :white_check_mark: | OG metadata tooltip on link hover |
| `markdownLinks` | :white_check_mark: | Auto-convert `[text](url)` and `![alt](url)` |

</div>

Every feature is toggleable. Override CSS variables to match your brand:

```css
:root {
  --lix-accent: #e040fb;
  --lix-bg-app: #fafafa;
  --lix-font-body: 'Inter', sans-serif;
}
```

:point_right: **[Full documentation →](packages/lixeditor/README.md)**

<br />

## LixEditor for VS Code

Write `.lixeditor` documents with a rich WYSIWYG editor — right inside VS Code.

<div align="center">

[![Install from Marketplace](https://img.shields.io/badge/Install-VS_Code_Marketplace-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=elixpo.lixeditor)

</div>

| | Feature |
|:---:|:---|
| :writing_hand: | Rich block editor — headings, lists, tables, checklists |
| :art: | Syntax-highlighted code blocks (25+ languages via Shiki) |
| :link: | Smart links — auto-convert `[text](url)`, hover preview |
| :framed_picture: | Image blocks — upload, embed URL, paste, drag & drop |
| :calendar: | Date stamps — `Ctrl+D` to insert |
| :zap: | Slash commands — type `/` to insert any block |
| :floppy_disk: | Auto-save + manual save + Markdown export |
| :art: | Adapts to your VS Code theme (light/dark) |

```
1. Install the extension from the VS Code Marketplace
2. Create a file: notes.lixeditor
3. Open it — the rich editor loads automatically
4. Type / for commands, write with markdown shortcuts
```

:point_right: **[Extension docs →](packages/vscode-lixeditor/README.md)**

<br />

## How It Works

```mermaid
graph LR
    A["🔐 Sign Up"] -->|Elixpo OAuth| B["✍️ Write"]
    B -->|Block Editor| C["🤖 AI Assist"]
    C -->|Generate & Edit| D["👥 Collaborate"]
    D -->|Real-time Sync| E["🚀 Publish"]
    E -->|blogs.elixpo.com| F["🌍 Readers"]

    style A fill:#9b7bf7,stroke:#7c5ce0,color:#fff
    style B fill:#60a5fa,stroke:#3b82f6,color:#fff
    style C fill:#c084fc,stroke:#a855f7,color:#fff
    style D fill:#4ade80,stroke:#22c55e,color:#fff
    style E fill:#f59e0b,stroke:#d97706,color:#fff
    style F fill:#f87171,stroke:#ef4444,color:#fff
```

<br />

## The Editor

The heart of LixBlogs is a **powerful block editor** built on [BlockNote](https://blocknotejs.org) — it feels like writing in Notion, but built for publishing.

<div align="center">

| Block Type | What It Does |
|:---|:---|
| Paragraphs, Headings | Standard text with markdown shortcuts |
| Code Blocks | Syntax-highlighted with 30+ languages via Shiki |
| Math / LaTeX | Block & inline equations with KaTeX rendering |
| Mermaid Diagrams | Flowcharts, sequence diagrams, git graphs, and more |
| Images | Upload, embed URL, paste, drag & drop — auto WebP compression |
| Links | Auto-convert URLs, `[text](url)` syntax, OG preview on hover |
| Tables | Full table support with header rows |
| Checklists | Interactive checkboxes with checked/unchecked styling |
| Table of Contents | Auto-generated from your headings |
| Sub-Pages | Nest child pages inside your blog |
| Date Stamps | Inline date chips with a mini calendar picker |
| Mentions | Tag users `@name`, blogs, and organizations |
| Dividers | Horizontal rules to separate sections |

</div>

<br />

## Monorepo layout

```
.
├── app/                       # Next.js App Router pages, layouts, API routes
├── src/                       # React components (Editor/), views, context, AI
├── lib/                       # Server-side utilities (auth, media, tiers)
├── migrations/                # Cloudflare D1 SQL migrations
├── worker/                    # Cloudflare Worker code
├── packages/
│   ├── lixeditor/             # @elixpo/lixeditor — the editor (npm)
│   ├── vscode-lixeditor/      # elixpo.lixeditor — VS Code extension
│   └── lixsketch/             # @elixpo/lixsketch — the whiteboard editor
└── public/                    # Static assets, brand marks, fonts
```

## Architecture

```mermaid
graph TB
    subgraph Client ["🖥️ Client"]
        FE["Next.js 15 + React 19"]
        ED["@elixpo/lixeditor"]
        YJS["Yjs CRDT"]
    end

    subgraph Edge ["☁️ Cloudflare Edge"]
        CF["Pages + Workers"]
        D1["D1 Database"]
        DO["Durable Objects"]
        KV["KV Cache"]
    end

    subgraph Services ["🔌 Services"]
        AI["LixSearch AI"]
        CLD["Cloudinary"]
        AUTH["Elixpo Accounts"]
    end

    FE --> CF
    ED --> YJS
    YJS -->|WebSocket| DO
    CF --> D1
    CF --> KV
    FE --> AI
    FE --> CLD
    FE --> AUTH

    style Client fill:#1a1a2e,stroke:#9b7bf7,color:#e8edf5
    style Edge fill:#1a1a2e,stroke:#60a5fa,color:#e8edf5
    style Services fill:#1a1a2e,stroke:#4ade80,color:#e8edf5
```

<br />

## Running locally

Copy [`.env.example`](.env.example) to `.env.local` and fill in the values
before starting the app. Only the **Auth** block is needed to sign in locally;
every other section is marked optional and only affects its own feature.
It is the single source for local secrets used by both Next.js and the
Cloudflare platform proxy. Do not create `.dev.vars`; Wrangler gives that file
precedence and it can silently shadow `.env.local` with stale values.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

```bash
npm run build       # Build for Cloudflare Pages (@cloudflare/next-on-pages)
npm run preview     # Local Cloudflare Pages preview (wrangler)
npm run deploy      # Build + deploy to Cloudflare Pages
npm run db:migrate  # Run D1 migrations (remote)
```

<br />

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
- ❤️ **Support us** via [GitHub Sponsors](https://github.com/sponsors/Circuit-Overtime).

## Project Activity

<div align="center">

[![Star History Chart](https://api.star-history.com/chart?repos=elixpo/lixblogs&type=date&legend=top-left)](https://www.star-history.com/?repos=elixpo%2Flixblogs&type=date&legend=top-left)

<br />

![GitHub stars](https://img.shields.io/github/stars/elixpo/lixblogs?style=for-the-badge&color=9b7bf7&logo=github)
![GitHub forks](https://img.shields.io/github/forks/elixpo/lixblogs?style=for-the-badge&color=60a5fa&logo=github)
![GitHub issues](https://img.shields.io/github/issues/elixpo/lixblogs?style=for-the-badge&color=4ade80&logo=github)
![GitHub last commit](https://img.shields.io/github/last-commit/elixpo/lixblogs?style=for-the-badge&color=f59e0b&logo=github)
![npm downloads](https://img.shields.io/npm/dm/@elixpo/lixeditor?style=for-the-badge&color=cb3837&logo=npm)

</div>

<br />

## Brand assets

Brand-ready marks and per-service icons live under [`public/`](public/) (logos,
mascot marks, `og-image`, and the Lix\* brand fonts under
[`public/fonts/`](public/fonts/)). A browsable kit is at
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

**This repository ships:**

- **npm package `@elixpo/lixeditor`** (from [`packages/lixeditor/`](packages/lixeditor/)) — the published package name on the npm registry is reserved to Elixpo; forks must publish under a different name. The MIT-licensed source may be reused.
- **VS Code Marketplace extension `elixpo.lixeditor`** (publisher `elixpo`, from [`packages/vscode-lixeditor/`](packages/vscode-lixeditor/)) — the Marketplace listing and the `elixpo` publisher identity are reserved to Elixpo; the extension source is MIT but the listing/publisher are not transferred.
- **Hosted SaaS `blogs.elixpo.com`** — the official hosted LixBlogs deployment; the brand, hosted deployment, and operational data are reserved; the source is MIT.

Developers can use **[`@elixpo/lixeditor`](https://www.npmjs.com/package/@elixpo/lixeditor)** (npm) and the **[LixEditor VS Code extension](https://marketplace.visualstudio.com/items?itemName=elixpo.lixeditor)** in their own projects under MIT.

<img width="100%" src="https://capsule-render.vercel.app/api?type=wave&color=9b7bf7&height=120&section=footer&text=&fontSize=0" />

<div align="center">

**Made with :purple_heart: by [Elixpo](https://github.com/elixpo)**

[Website](https://blogs.elixpo.com) · [npm Package](https://www.npmjs.com/package/@elixpo/lixeditor) · [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=elixpo.lixeditor) · [Report Bug](https://github.com/elixpo/lixblogs/issues) · [Request Feature](https://github.com/elixpo/lixblogs/issues)

<sub>Made in the open, together. © 2023-2026 Elixpo.</sub>

</div>
