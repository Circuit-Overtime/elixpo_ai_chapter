# Elixpo public contribution records

**Status:** Active operational policy  
**Last verified:** 2026-10-16  
**Machine-readable source:** [`content/contributors.json`](../../content/contributors.json)

Elixpo contribution records make public work easier to inspect from a CV,
portfolio, or project history. They describe attributable outcomes and link to
the source evidence. They are not certificates, academic awards, employment
verification, professional licences, or guarantees of current affiliation.

## Stable identity and verification

Every published contributor record has a stable `ECR-YYYY-NNN` identifier and a
canonical URL under `https://elixpo.com/contributors/`. A record is current only
when its identifier, canonical URL, reviewed date, and evidence agree with the
canonical registry.

A printed copy or PDF is a portable view of that public page. It is not an
independently issued or cryptographically signed credential. Reviewers should
verify a claim through the canonical URL and inspect the linked source evidence.

## Claim boundary

Each structured work record names the observed project, role, period, outcome,
demonstrated skills, evidence references, and any public reviewer attribution.
Elixpo does not infer a reviewer from repository access or a merge event. When
the cited record does not name an individual reviewer, the page says that no
individual reviewer is publicly attributed.

Commit totals provide snapshot context and never determine a person's value,
seniority, employment status, or authorship by themselves.

## Corrections and disputes

A correction keeps the stable record identifier, updates the review date and
supporting evidence, and remains visible through ordinary repository history.
If a material claim is disputed, Elixpo narrows or removes it until the public
evidence supports publication. Corrections and evidence additions require the
same registry review as a new claim.

Requests use the correction route published in `content/contributors.json` and
should identify the record ID, disputed text, proposed correction, and supporting
public evidence.

## Altered or fraudulent copies

Elixpo does not verify screenshots, edited PDFs, copied profile pages, or claims
presented without the canonical URL. Suspected impersonation or alteration
should be reported through the correction route. The registry, Git history, and
linked primary evidence are the verification trail; visual similarity to the
site is not proof.

## Removal and privacy

A contributor may request removal through the published opt-out route. After an
approved removal, the canonical profile stops presenting the record. Existing
public repository history remains subject to the repository's normal public-
history, upstream, and legal obligations. Non-public biographies or role details
are never added without consent.
