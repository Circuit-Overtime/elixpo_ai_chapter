# Branding repository migration

**Status:** Complete; private production boundary active
**Source repository:** `elixpo/brand-production` (private)  
**Audited source revision:** `7c274b1ca900eb8f21f4ded811779963ba8f0c21`  
**Destination:** [`elixpo/elixpo`](https://github.com/elixpo/elixpo)

The portal is the canonical public brand destination. Consumer discovery found
no active repository outside the portal that depends on the former public
branding repository. Its complete history, print-ready masters, prompts, and
generation tools remain available to maintainers in the renamed private
`brand-production` workspace. It stays active rather than archived because it
is the production environment for future stickers and brand assets.

## History strategy

Preserve the original repository history in the private production workspace.
Its commits remain the authoritative provenance for legacy and future
generation work without publishing restricted production material. Each
artifact group promoted to the public portal records:

- the source repository and full source commit SHA;
- its original repository-relative path;
- a SHA-256 checksum for the imported file;
- its artifact class, maintainer, and review date;
- its applicable copyright licence and separate trademark boundary;
- whether it is a master, web derivative, prompt, tool, or generated output.

This preserves history without merging hundreds of megabytes of restricted
binary material into the public portal. The production workspace is private,
active, and not a public download surface.

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
├── stickers/
│   └── previews/             # watermarked display derivatives only
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
5. Import reviewed public documentation first. Keep sticker prompts, print
   tooling, unwatermarked exports, and production sheets in the private production workspace.
   Preserve the original path and source SHA in the manifest.
6. Import only approved masters and exports. Skip the 21 masters already verified
   as byte-identical in the portal.
7. Keep product-specific OG images and LixBlogs badges with their owning project
   unless the portal is their declared canonical distribution point.
8. Validate checksums, licences, links, asset dimensions, open public downloads,
   and the watermark on every public sticker preview.
9. Update every known consumer to the stable `https://elixpo.com/brand/...` or
   `https://elixpo.com/branding` destination as appropriate.
10. Publish a boundary notice in the production README, verify consumers again,
    rename the repository, and make it private while retaining active generation
    capability.

## Never import

- `.env`, secrets, keys, tokens, or decrypted configuration;
- `.sops.yaml` or machine-specific secret-management configuration unless a
  separate security review explicitly requires it;
- virtual environments, caches, temporary generations, and local model data;
- duplicates of the 21 masters already verified in the portal;
- a generated artifact whose provenance or redistribution permission is unknown.

## Ownership boundaries

General Elixpo marks, the approved Open Field system, and organization assets are
portal-owned. Colour tokens, typography guidance, and general usage guidance
remain public. Official sticker masters and production sheets are restricted
partnership material; only watermarked previews belong in `public/`. Product-
specific brand assets remain project-owned unless the registry explicitly
transfers their canonical distribution here. Oreo's visual rules remain in
`brand/MASCOT.md`, while the Open Field system determines where the mascot is
appropriate across organization surfaces.

## Private production gate

The production repository can remain the restricted source of truth when all of
the following are true:

- the provenance manifest validates;
- no active repository or site depends on an old raw-content URL;
- open public downloads and watermarked sticker previews resolve from the portal;
- project-owned assets have an explicit owner and canonical location;
- the sticker-use policy is published;
- secrets and historical credentials have been reviewed;
- its README directs public users to the portal and documents the promotion process.

Archival is intentionally not part of this migration. The private repository
continues to generate reviewed material; deletion and history rewriting remain
out of scope.

## Consumer verification

The 2026-10-17 workspace scan found no references to the standalone branding
repository outside the canonical registry, provenance record, and this
migration document. Public website consumers already use portal-hosted paths.
Product-specific OG cards and LixBlogs badges remain with their owning projects;
they are not organization-level public downloads.

## Current provenance checkpoint

[`brand/provenance.json`](../brand/provenance.json) records the first verified
checkpoint: 15 project icons, three primary marks, and three social masters are
byte-identical to their files at the audited source revision. Their deterministic
group checksums prevent later source drift from being mistaken for a reviewed
migration.
