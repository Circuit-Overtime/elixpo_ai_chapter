# Discovery and recommendation contract

LixBlogs uses one deterministic ranking contract for the Home feed, Explore,
contest discovery, and the public contest API. The implementation lives in
`lib/recommendations.js`; changing weights requires changing
`RECOMMENDATION_VERSION`.

## Candidate rules

- Only published, discoverable content enters public story candidates.
- Muted authors, organizations, and topics are removed before a signed-in feed
  is paginated.
- Secret posts never enter an author-derived bucket.
- Global or unknown language content stays eligible. Locale is a boost, never a
  hard geographic or language filter.
- Explore ranks fixed four-page windows so page navigation cannot repeat an
  item from the same candidate window.

## Blog order

The scorer applies these signals in order:

1. a repost or post from an account the reader follows;
2. explicit followed topics, then positive 30-day taste signals;
3. exact language and country affinity;
4. a linear 30-day freshness decay;
5. capped, logarithmic engagement quality;
6. publication time, then lexical blog ID as stable tie-breakers.

Scores use an hourly time bucket. Identical candidates and viewer context
therefore produce the same order for the whole hour. Raw view volume cannot
overpower follows or explicit interests because engagement is capped.

## Contest order

Lifecycle is the primary signal: live, scheduled, judging, completed, then
cancelled. Topic, language, region, deadline timing, and capped entry count
rank contests within that lifecycle priority. Contest IDs are the final stable
tie-breaker.

## Metadata

`blogs` and `contests` store a normalized base language (`en`, `bn`, `und`) and
region (`IN`, `US`, `global`). New content uses an explicit API value when
provided, otherwise the author's account locale and Cloudflare country header.
Migration `0054_deterministic_discovery.sql` backfills language from author
locale and leaves region global when it cannot be known safely.

API responses include `recommendation_reason` and `recommendation_version` so
clients can explain placement without exposing private signal history.
