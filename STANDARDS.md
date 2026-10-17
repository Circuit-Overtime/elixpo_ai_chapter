# The Elixpo standard

This document is the **single source of truth** for the shared files every
Elixpo repository ships, so the whole ecosystem is consistent. Copy these into
each product repo and adapt only the marked per-repo bits.

Canonical reference implementation: this repo (`elixpo/elixpo`, the elixpo.com
site).

## 1. Files every repo must have

| File | Purpose | Per-repo edits |
| --- | --- | --- |
| `LICENSE` | The generic Elixpo License (pointer). | None - copy verbatim. |
| `LICENSES/` | `preferred/MIT`, `preferred/CC-BY-4.0`, `exceptions/Oreo-trademarks`, `README.md`, `notices/notice-board`. | `notices/notice-board` lists that repo's own deps. |
| `LICENSES/NOTICE` | The **notice board** - per-product reservations. | Declare exclusive artifacts (npm pkg, VS Code ext, SaaS, paid tier) or state "None". |
| `CODE_OF_CONDUCT.md` | Ecosystem-wide CoC. | None - copy verbatim. |
| `CONTRIBUTING.md` | Contribution standard. | None - copy verbatim. |
| `README.md` | Follows the README template below. | About, Exclusive, and stack-specific sections. |

## 2. LICENSE

- **Code** is MIT; **brand/visual assets** are CC-BY-4.0; both carry the
  **Oreo-trademarks** exception (`LICENSES/exceptions/Oreo-trademarks`).
- The Oreo mascot, the E-badge, the "Elixpo"/"Oreo" names, `*.elixpo.com`, and
  the palette are reserved (royalty protection).
- Per-product reservations go in `LICENSES/NOTICE`, never in the LICENSE.

## 3. CODE_OF_CONDUCT & CONTRIBUTING

- Copy both verbatim. They apply across all repos and community spaces.
- Inbound license = the Elixpo standard (MIT/CC-BY-4.0); DCO applies; no CLA.
- Single contact for all repos: **hello@elixpo.com**.

## 4. README template

Keep this section order (see this repo's `README.md`):

1. Centered banner (`og-image.webp`) + title + tagline + quick links.
2. **About** - what this repo is.
3. **Ecosystem** table (the shared product list).
4. **Architecture** - the shared Mermaid diagram + a link to `/architecture`.
5. **Built by the community** - leads + links to CONTRIBUTING / CoC.
6. **Recognition & programs**.
7. **Get involved** - Discussions, Submit, Contribute, Sponsor.
8. **Brand assets** - link to `public/brand/` + `/assets`.
9. **License** - the standard + reserved brand.
10. **Exclusive** - per-repo exclusive artifacts, or "None".

## 5. Footer standard

Every Elixpo product **website** ships the same footer. The canonical
implementation is [`src/components/Footer.tsx`](src/components/Footer.tsx).
Required content and structure:

**Aesthetic**
- Dark surface (`bg-black`, border `white/10`), cream text (`#E1E0CC`), and the
  cream **primary** accent (`#DEDBC8`). Mono labels for column headers.

**Columns (top)**
1. **Brand** - "Elixpo Chapter" wordmark + one-line tagline (mentions 45+
   contributors, free & open source) + social icons (GitHub, Discussions, Sponsor).
2. **Ecosystem** - the product list, derived from a single source
   (`src/lib/projects.ts` here).
3. **Community** - GitHub Org, Chapter Monorepo, GitHub Discussions, Sponsors.
4. **Legal** - Terms, Privacy, License.
5. **Get in touch** - **`hello@elixpo.com`** with click-to-copy.

**Bottom bar**
- Left: `© <years> Elixpo Chapter · MIT & CC-BY-4.0 · Built in the open`.
- Right: **Architecture**, **Brand**, **Blog**, and a **"Star on GitHub"** CTA.

**Rules**
- License string is always **`MIT & CC-BY-4.0`** (never "GPL"/"copyleft").
- Contact is always **hello@elixpo.com**.
- Link the product back to `elixpo.com`, `/architecture`, and `/assets`.

## 6. Rollout

When you create or update an Elixpo repo, sync sections 1-5 from here. Only the
`NOTICE` (exclusive artifacts) and the README About/Exclusive sections change
per repo. Questions: open a thread in
[Discussions](https://github.com/orgs/elixpo/discussions) or email hello@elixpo.com.
