# Changelog

Release notes are generated from merged pull requests. This file records contract-level changes that users must see before upgrading.

## 1.8.0

- Complete contest automation with lifecycle and ownership filters, eligibility controls, and private-draft deletion.
- Allow organizers to manage minimum account age, required bios, and invited-author lists from the CLI.
- Preserve published contest history by restricting deletion to organizer-owned private drafts.
- Add contest discovery tags, custom slugs, month-based account age, and the five-entry hard limit.

## 1.7.0

- Add contest creation, lifecycle, role, submission, frozen-snapshot review, and results commands.
- Require explicit confirmation for contest publication, cancellation, withdrawal, and final result publication.
- Reuse registered blog scopes so existing OAuth and personal-access-token clients need no new Accounts registration.

## 1.6.0

- Add personal curated-collection create, inspect, edit, delete, entry-add, entry-remove, and list commands.
- Preserve canonical authorship and licenses when automating collection curation.
- Continue using the registered `lixblogs:blog:read` and `lixblogs:blog:write` scopes; no new Accounts scope is required.

## 1.5.0

- Add complete publish metadata, version history and restore, comments and replies, and provider-backed media deletion.
- Add Pollinations BYOP status and image generation/upload/attachment commands without exposing provider credentials.
- Bundle the `lixblogs-media` agent skill with explicit billing, retry, and recovery rules.

## 1.4.2

- Use the package-local, lockfile-pinned esbuild binary so packing does not
  depend on an ephemeral `npx` cache.
- Publish the attested release tarball to GitHub Packages as well as npm and
  GitHub Releases.

## 1.3.4

- Ship the complete CLI as one minified Node executable while retaining the
  native keychain integration and all five agent skills.
- Enforce a 100 KiB unpacked-package budget in the GitHub release gate.
- Publish a SHA-256 checksum beside the provenance-attested npm artifact.

## 1.3.0

- Added scoped organization and editorial commands.
- Added bounded, read-only creator analytics with JSON and CSV export.
- Bundled five independently installable LixBlogs agent skills.
- Added packed-artifact, Accounts device-flow, Blogs resource-contract, provenance, and rollback release gates.
