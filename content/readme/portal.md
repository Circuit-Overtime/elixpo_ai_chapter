<p align="center">
  <img src="public/brand/marks/elixpo_lock_up_text_mascot.webp" width="420" alt="Elixpo wordmark with the Oreo panda mascot" />
</p>

<h1 align="center">Elixpo Portal</h1>

<p align="center">
  <strong>The canonical public portal and organization-content source.</strong>
</p>

## About this repository

This repository builds [elixpo.com](https://elixpo.com) and owns the canonical
organization registry under [`content/`](content/). Project pages, structured
data, sitemaps, shared README content, and future standalone surfaces should
consume or validate against that registry rather than maintain independent
lists.

## Local development

Use Node.js with the committed lockfile:

```bash
npm ci
npm run registry:check
npm run dev
```

Use `npm run lint` for source linting and `npm run build` for the production
build. The README renderer supports `npm run readme:check` and
`npm run readme:write`; `npm run readme:sync-workspace` additionally updates
the sibling `.github` and `elixpo_chapter` clones.

Read [CONTRIBUTING.md](CONTRIBUTING.md), the
[Code of Conduct](CODE_OF_CONDUCT.md), and the
[repository standard](docs/repository-standard/elixpo-repository-standard-v0.1.md)
before changing canonical organization facts.

The maintenance boundary between the portal, `research.elixpo`,
`packages.elixpo`, and individual project repositories is documented in
[`docs/architecture/specialized-surfaces.md`](docs/architecture/specialized-surfaces.md).

{{SHARED}}
