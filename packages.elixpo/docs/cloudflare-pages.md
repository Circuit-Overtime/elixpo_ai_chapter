# Cloudflare Pages deployment

`packages.elixpo.com` publishes one static artifact containing the catalogue,
product documentation, installers, signed APT metadata, and Debian packages.
The Cloudflare deployment must preserve that artifact as a unit. It is not a
frontend-only deployment.

## Ownership and credentials

- Cloudflare project: `packages-elixpo`
- Candidate URL: `https://packages-elixpo.pages.dev/`
- Production domain: `https://packages.elixpo.com/`
- Production branch: `main`
- Workflow: `.github/workflows/deploy-cloudflare-pages.yml`
- Credentials: repository-scoped `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID`
- Signing material: organization-scoped `APT_SIGNING_KEY`

The Cloudflare credentials are intentionally repository-scoped for the current
migration. A later CI-standardization pass may consolidate them at organization
scope without changing the workflow-facing names.

## Project creation

The candidate workflow checks for the Pages project and creates it through the
Cloudflare API when it is missing. An authenticated maintainer can alternatively
create it from the repository root:

```bash
npx wrangler@latest pages project create packages-elixpo \
  --production-branch main
```

This creates the deployment target only. Do not attach the production custom
domain until the candidate artifact has passed the checks below.

## Publish and verify the candidate

Run **Deploy Cloudflare Pages candidate** from GitHub Actions with
`promote_domain` left disabled. The workflow
builds the static Next.js site, downloads and verifies both stable Debian
releases, renders the installers, signs the APT repository, validates the
assembled artifact, publishes it to the candidate project, and smoke-tests the
deployed catalogue, installers, signatures, index, and package downloads.

Verify these URLs on `packages-elixpo.pages.dev`:

1. `/`, `/repository/`, `/win-dot-panel/`, and `/screenbridge/`
2. every npm package route listed in `content/packages.json`
3. `/win-dot-panel/docs/`, `/win-dot-panel/about/`,
   `/screenbridge/docs/`, and `/screenbridge/about/`
4. `/win-dot-panel/install.sh`, `/screenbridge/install.sh`, and `/install.sh`
5. `/apt/InRelease`, `/apt/Release`, `/apt/Packages.gz`, and each package under
   `/apt/pool/`
6. `/robots.txt`, `/sitemap.xml`, `/feed.xml`, and the social-card routes

Download `InRelease` and verify it with the public repository key. Decompress
`Packages.gz` and confirm that it contains exactly one `win-dot-panel` and one
`screenbridge` record whose filenames exist in the package pool.

## Move the custom domain

After the candidate run succeeds, run the same workflow with
`promote_domain` enabled. It attaches `packages.elixpo.com` to the
`packages-elixpo` project through the Cloudflare API and waits for critical
production routes to become reachable. Cloudflare must already manage the DNS
zone so it can provision the Pages custom-domain record and certificate.

Keep the GitHub Pages deployment and its most recent successful artifact intact
through this verification window. Only after production checks pass should the
GitHub Pages workflow be retired and the old Pages configuration disabled.

## Rollback

If a catalogue route, installer, signature, package index, or package download
fails after cutover, restore the previous GitHub Pages DNS target and verify the
same URLs there. Do not publish a frontend-only artifact as a workaround: APT
metadata and its referenced package pool must remain consistent and signed.
