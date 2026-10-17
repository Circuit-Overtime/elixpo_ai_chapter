# Public-surface release audit

Elixpo treats a successful application build and a successful public release as
different facts. The public release gate covers `elixpo.com`,
`research.elixpo.com`, and `packages.elixpo.com` after deployment.

## Automated checks

Run the deterministic crawl from the portal repository:

```bash
npm run audit:public
```

The crawler discovers canonical pages from each sitemap and checks:

- robots and sitemap availability;
- successful canonical URLs and redirect destinations;
- unique titles and descriptions;
- Open Graph and Twitter images;
- viewport, indexing, heading, and main-content contracts;
- parseable JSON-LD with a Schema.org context;
- image alternative text, thin pages, and oversized documents; and
- response latency as an operational warning rather than a search-ranking
  promise.

The scheduled `Public surface audit` workflow retains its JSON and Markdown
evidence for 30 days. A crawl failure blocks closure even if the frontend build
passed.

## Browser audit

The same workflow runs Lighthouse against representative portal, Research, and
Packages routes. Accessibility and SEO thresholds are blocking. Performance,
best-practice, LCP, CLS, and TBT thresholds initially warn because public-network
measurements vary; repeated warnings require a measured correction or an
explicitly documented exception.

One Lighthouse run is a regression detector, not a laboratory benchmark. Use
multiple local or controlled runs before making a numerical performance claim.

## Release sequence

1. Validate registry and repository conformance.
2. Run lint, type checks, and the production build locally or in CI.
3. Deploy the candidate and verify its custom domain.
4. Run `Public surface audit` manually.
5. Inspect the crawl and Lighthouse artifacts.
6. Promote the release only when blocking findings are zero. Record any
   accepted warning with an owner and a review date.

The audit does not claim guaranteed indexing, search position, accessibility,
or performance. Search engines and networks remain external systems.
