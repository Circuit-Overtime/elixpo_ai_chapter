# Elixpoo public site

The static public contract for Elixpoo v2. It intentionally exposes only two canonical routes:

- `/` — directive, capability boundary, protocol, and distribution model;
- `/docs` — technical contract, authorization, trust model, and rollout instructions.

Run locally:

```bash
npm ci
npm run dev
```

Build and deploy from the repository root:

```bash
bash agent.elixpo/deploy.sh pages
```

The export also publishes `robots.txt`, `sitemap.xml`, `llms.txt`, `llms-full.txt`, the web manifest, canonical metadata, Open Graph metadata, and JSON-LD.
