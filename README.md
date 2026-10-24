<div align="center">

<img src="public/logo.png" alt="LixBlogs Logo" width="80" />

# LixBlogs

### Write, collaborate, and publish beautifully.

A modern blogging platform with a rich block editor, AI writing assistant,<br />
real-time collaboration, and organizations — all on the edge.

<br />

[![Live](https://img.shields.io/badge/Live-blogs.elixpo.com-9b7bf7?style=for-the-badge&logo=googlechrome&logoColor=white)](https://blogs.elixpo.com)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/elixpo/blogs.elixpo)
[![npm](https://img.shields.io/npm/v/@elixpo/lixeditor?style=for-the-badge&color=cb3837&logo=npm&logoColor=white&label=@elixpo/lixeditor)](https://www.npmjs.com/package/@elixpo/lixeditor)
[![VS Code](https://img.shields.io/badge/VS_Code-Extension-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=elixpo.lixeditor)
[![License](https://img.shields.io/badge/License-See_repository_terms-6b7280?style=for-the-badge)](LICENSE)

[![Next.js](https://img.shields.io/badge/Next.js_15-black?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Cloudflare](https://img.shields.io/badge/Cloudflare_Pages-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://pages.cloudflare.com)
[![Tailwind](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![BlockNote](https://img.shields.io/badge/BlockNote-Editor-9b7bf7?style=flat-square)](https://blocknotejs.org)

[Website](https://blogs.elixpo.com) ·
[Discussions](https://github.com/orgs/elixpo/discussions) ·
[Elixpo](https://elixpo.com) ·
[Chapter](https://github.com/elixpo/elixpo_chapter)

</div>

<br />

<div align="center">
<img src="public/banner.png" alt="LixBlogs Banner" width="100%" style="border-radius: 12px;" />
</div>

<br />

## About

LixBlogs (also called **Elixpo Blogs**) is an **open-source publishing
platform** designed for creators, developers, and teams. It gives you a
beautiful writing experience with powerful tools built right in — a rich block
editor, an AI writing assistant, real-time collaboration, and organizations —
all deployed on **Cloudflare's edge** and hosted at
[blogs.elixpo.com](https://blogs.elixpo.com).

It supports personal publishing, organization publications, and collaborative
editing. Availability, account requirements, and operated-service limits are
documented by the hosted service rather than promised by this README.

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

## Elixpo relationship

LixBlogs is an active core service of the Elixpo open-source project foundry.
Its platform, editor package, publishing CLI, and extension are developed in
this repository. The canonical directory of current Projects, Research, and
Services lives at [elixpo.com](https://elixpo.com); this README does not copy
that directory because lifecycle information changes independently.

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

Before opening a pull request, run the same checks CI runs:

```bash
npm test             # Unit tests (node --test)
npm run pages:build  # Cloudflare Pages build (@cloudflare/next-on-pages)
```

`npm run build` runs plain `next build` and does not check Cloudflare
compatibility. To preview the Cloudflare build locally, run
`npm run pages:build` first, then:

```bash
npm run db:migrate:local  # Apply D1 migrations to the local database
npm run preview           # Serve .vercel/output/static with wrangler pages dev
```

`npm run deploy` and `npm run db:migrate` act on the production Cloudflare
project and the remote D1 database. Production deploys run from CI after a
pull request is merged, so contributors do not need either command.

<br />

## Built in public

Repository history and the [contributors graph](https://github.com/elixpo/blogs.elixpo/graphs/contributors)
provide the evidence for individual contributions. See
**[CONTRIBUTING.md](CONTRIBUTING.md)**, **[GOVERNANCE.md](GOVERNANCE.md)**, and
our **[Code of Conduct](CODE_OF_CONDUCT.md)** before participating.

## Get involved

- 💬 **Join the conversation** in [GitHub Discussions](https://github.com/orgs/elixpo/discussions).
- 🚀 **Build with Elixpo** through the [Chapter repository](https://github.com/elixpo/elixpo_chapter).
- 🛠️ **Contribute to LixBlogs** through this repository's [issues](https://github.com/elixpo/blogs.elixpo/issues).

## Project Activity

<div align="center">

[![Star History Chart](https://api.star-history.com/chart?repos=elixpo/blogs.elixpo&type=date&legend=top-left)](https://www.star-history.com/?repos=elixpo%2Fblogs.elixpo&type=date&legend=top-left)

<br />

![GitHub stars](https://img.shields.io/github/stars/elixpo/blogs.elixpo?style=for-the-badge&color=9b7bf7&logo=github)
![GitHub forks](https://img.shields.io/github/forks/elixpo/blogs.elixpo?style=for-the-badge&color=60a5fa&logo=github)
![GitHub issues](https://img.shields.io/github/issues/elixpo/blogs.elixpo?style=for-the-badge&color=4ade80&logo=github)
![GitHub last commit](https://img.shields.io/github/last-commit/elixpo/blogs.elixpo?style=for-the-badge&color=f59e0b&logo=github)
![npm downloads](https://img.shields.io/npm/dm/@elixpo/lixeditor?style=for-the-badge&color=cb3837&logo=npm)

</div>

<br />

## Brand assets

Brand-ready marks and per-service icons live under [`public/`](public/) (logos,
mascot marks, `og-image`, and the Lix\* brand fonts under
[`public/fonts/`](public/fonts/)). A browsable kit is at
**[elixpo.com/assets](https://elixpo.com/assets)**.

## Licensing and official distributions

Read [`LICENSE`](LICENSE), the repository [notice board](LICENSES/NOTICE), and
applicable third-party notices before reuse. Elixpo is separating future code,
content, hardware, and trademark policies; this repository must not be treated
as evidence that every Elixpo project uses one universal license.

Copyright permissions do not grant permission to impersonate Elixpo or present
another deployment as the official service. This repository currently ships:

- **npm package `@elixpo/lixeditor`** (from [`packages/lixeditor/`](packages/lixeditor/)) — the published package name on the npm registry is reserved to Elixpo; reuse of the source is governed by this repository's current license and notice.
- **VS Code Marketplace extension `elixpo.lixeditor`** (publisher `elixpo`, from [`packages/vscode-lixeditor/`](packages/vscode-lixeditor/)) — the Marketplace listing and the `elixpo` publisher identity are reserved to Elixpo; source reuse remains subject to this repository's current terms.
- **Hosted service `blogs.elixpo.com`** — the official LixBlogs deployment; the brand, deployment, and operational data are reserved, while source reuse is governed by this repository's current terms.

Developers can use **[`@elixpo/lixeditor`](https://www.npmjs.com/package/@elixpo/lixeditor)** (npm) and the **[LixEditor VS Code extension](https://marketplace.visualstudio.com/items?itemName=elixpo.lixeditor)** in their own projects under MIT.

<img width="100%" src="https://capsule-render.vercel.app/api?type=wave&color=9b7bf7&height=120&section=footer&text=&fontSize=0" />

<div align="center">

**Made with :purple_heart: by [Elixpo](https://github.com/elixpo)**

[Website](https://blogs.elixpo.com) · [npm Package](https://www.npmjs.com/package/@elixpo/lixeditor) · [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=elixpo.lixeditor) · [Report Bug](https://github.com/elixpo/blogs.elixpo/issues) · [Request Feature](https://github.com/elixpo/blogs.elixpo/issues)

<sub>Made in the open, together. © 2023-2026 Elixpo.</sub>

</div>
