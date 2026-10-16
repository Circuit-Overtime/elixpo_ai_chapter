# Branding repository migration

**Status:** Approved approach; execution is staged  
**Source repository:** [`elixpo/branding`](https://github.com/elixpo/branding)  
**Audited source revision:** `7c274b1ca900eb8f21f4ded811779963ba8f0c21`  
**Destination:** [`elixpo/elixpo`](https://github.com/elixpo/elixpo)

The portal is the canonical public brand destination, but the standalone
branding repository remains the historical production record until every
consumer has migrated. Consolidation must not turn the portal into a 779 MB
asset dump or erase the commits that explain how an artifact was produced.

## History strategy

Preserve the original repository on GitHub as a read-only archive after the
migration. Its commit history remains the authoritative provenance for legacy
assets and generation work. Each imported artifact group records:

- the source repository and full source commit SHA;
- its original repository-relative path;
- a SHA-256 checksum for the imported file;
- its artifact class, maintainer, and review date;
- its applicable copyright licence and separate trademark boundary;
- whether it is a master, web derivative, prompt, tool, or generated output.

This preserves history without merging hundreds of megabytes of old binary
commits into the portal. The source repository is archived, not deleted, and
receives a final README redirect only after consumer verification.

## Destination layout

```text
brand/
├── README.md                 # contributor and production documentation
├── MASCOT.md                 # canonical Oreo anatomy and generation rules
├── provenance.json           # source paths, revisions, checksums and licences
├── prompts/                  # reviewed reproducibility prompts
├── tooling/                  # reviewed generators and optimization scripts
└── references/               # non-secret production and style references

public/brand/
├── source/                   # reviewed downloadable masters
│   ├── marks/
│   ├── icons/
│   └── social/
├── stickers/                 # approved public sticker exports
├── illustrations/            # portal illustrations
└── generated/                # reviewed web-ready derivatives where needed
```

Editable and reproducibility material belongs under `brand/`. Files directly
served by the website belong under `public/brand/`. A generated file must not be
stored in both places unless the public copy is an intentionally optimized
derivative recorded in the provenance manifest.

## Migration sequence

1. Freeze a source revision and confirm that both repositories are clean.
2. Create a source tag describing the migration checkpoint.
3. Rotate or invalidate any credentials that have ever appeared in the source
   repository, even when the checked-in form is SOPS-encrypted.
4. Build a manifest from tracked files and classify each item as `import`,
   `already-canonical`, `project-owned`, `historical-only`, or `excluded`.
5. Import reviewed text sources first: mascot references, prompts, documentation,
   and generation tools. Preserve the original path and source SHA in the
   manifest.
6. Import only approved masters and exports. Skip the 21 masters already verified
   as byte-identical in the portal.
7. Keep product-specific OG images and LixBlogs badges with their owning project
   unless the portal is their declared canonical distribution point.
8. Validate checksums, licences, links, asset dimensions, and public downloads.
9. Update every known consumer to the stable `https://elixpo.com/brand/...` or
   `https://elixpo.com/assets` destination as appropriate.
10. Publish a redirect notice in the standalone README, verify consumers again,
    tag the final state, and only then archive the repository.

## Never import

- `.env`, secrets, keys, tokens, or decrypted configuration;
- `.sops.yaml` or machine-specific secret-management configuration unless a
  separate security review explicitly requires it;
- virtual environments, caches, temporary generations, and local model data;
- duplicates of the 21 masters already verified in the portal;
- a generated artifact whose provenance or redistribution permission is unknown.

## Ownership boundaries

General Elixpo marks, the approved Open Field system, and organization assets are
portal-owned. Product-specific brand assets remain project-owned unless the
registry explicitly transfers their canonical distribution here. Oreo's visual
rules remain in `brand/MASCOT.md`, while the Open Field system determines where
the mascot is appropriate across organization surfaces.

## Archive gate

The standalone repository can be archived only when all of the following are
true:

- the provenance manifest validates;
- no active repository or site depends on an old raw-content URL;
- public downloads resolve from the portal;
- project-owned assets have an explicit owner and canonical location;
- the sticker-use policy is published;
- secrets and historical credentials have been reviewed;
- the redirect README has been live long enough to catch missed consumers.

Archiving is reversible. Deletion is not part of this migration.
