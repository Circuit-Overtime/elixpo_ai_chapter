# Elixpo Open Field brand system

**Status:** Approved for organization-wide use on 2026-10-16  
**Canonical record:** [`content/brand.json`](../content/brand.json)  
**Public brand library:** [elixpo.com/branding](https://elixpo.com/branding)

Open Field is the visual language for Elixpo. It aims to make software,
research, services, people, and historical records feel related without forcing
every project to look identical. It is an original system built around editorial
clarity, warm institutional colour, lightweight geometry, and careful use of the
Oreo mascot.

This specification is approved as the organization-wide direction. The reviewed
public asset migration is complete. Restricted masters, prompts, and generation
tools remain in the private active `brand-production` workspace; the portal is
the only canonical public distribution surface.

## Colour roles

| Role | Value | Use |
| --- | --- | --- |
| Paper | `#F6F5F0` | Default page field and long-reading background |
| Ink | `#142018` | Primary text, dark panels, and high-emphasis controls |
| Foundry green | `#0B623C` | Links, section labels, active states, and organization identity |
| Field green | `#18A466` | Small highlights and diagrams; not body text on light backgrounds |
| Archive warm | `#F0E6D3` | History, Chapters, provenance, and quiet secondary fields |

Colour never carries status on its own. Text, icons, or labels must communicate
the same distinction, and all text and interactive controls must meet WCAG AA
contrast.

## Typography

- The platform sans stack handles navigation, body copy, data, and primary
  headlines. Headlines may be large, but the writing must remain natural and
  descriptive rather than becoming a sequence of slogans.
- The display serif is an editorial accent for short clauses. It does not replace
  the sans stack in interfaces or long technical explanations.
- The monospace stack identifies dates, versions, provenance, statuses, and
  compact technical metadata. It is not a decorative body typeface.

The system relies on durable platform fonts rather than a runtime dependency on
an external font host.

## Geometry and layout

- Use generous editorial grids, large rounded fields, and thin structural rules.
- Circles, arcs, and asymmetric shapes should explain a relationship, contain
  data, or guide attention. They should not be used merely to fill empty space.
- Dot textures are secondary atmosphere and must remain behind readable content.
- Cards should communicate a real record, action, or state. Avoid decorative card
  grids without information hierarchy.
- Project pages may keep their own identity while using Elixpo navigation,
  metadata, provenance, and status patterns.

## Project icons and fallback artwork

Use a verified project icon when one exists. When it does not, create an original
geometric fallback from the Open Field colour and line system. Do not substitute
unrelated stock symbols or imitate another organization's signature visual
language.

## Oreo mascot

Oreo is a human signal, not a mandatory watermark.

Use Oreo for the primary Elixpo identity, community invitations, events, sticker
artwork, and friendly onboarding moments. Avoid placing Oreo by default on
research papers, dense technical documentation, infrastructure status views, or
every package and project card. Those surfaces should prioritize evidence,
diagrams, status, and the project's own identity.

Keep approved proportions and identifying marks intact. A mascot must never be
used to imply endorsement, hide uncertainty, or replace project-specific
information.

## Motion

- Prefer short opacity and transform transitions that clarify hierarchy or state.
- Keep touch scrolling native. Optional inertia is limited to capable pointer
  devices and must never prevent access to content.
- Honour `prefers-reduced-motion` and remove non-essential animation.
- Avoid continuous decorative motion where it competes with reading or consumes
  mobile resources.

## Asset tiers

1. **Editable masters** preserve the reviewed source artwork.
2. **Web derivatives** are optimized copies used by the portal and other sites.
3. **Prompts and tooling** preserve reproducibility but are not public download
   assets by default.
4. **Generated outputs** include stickers, OG images, videos, and project-specific
   variants with their own provenance.

These tiers must live in separate directories. Exact duplicates should not be
copied again, and environment files, credentials, caches, and local generation
state must never enter the public asset tree.

## Sticker access boundary

Official sticker artwork is sponsor-controlled event material. The public
library may display only visibly watermarked, screen-resolution previews. Those
previews are not source files and do not grant permission to reproduce, print,
distribute, modify, or sell the artwork. Print-ready artwork and physical packs
are released only after an event partnership is approved and its permitted use
is recorded in writing.

This restriction applies to sticker artwork, production sheets, and unwatermarked
exports. It does not close the Open Field colour tokens, typography guidance, or
general brand-usage guidance published by the portal.

## Approval record

Open Field was approved on 2026-10-16 with its colour roles, typography roles,
geometry, iconography, Oreo boundary, motion rules, and accessibility rules as a
single system. Representative README, research, package, Chapter, and timeline
components can now be produced against this stable grammar. Copyright and
identity permissions remain artifact-specific and are governed by the published
[trademark and brand-use policy](policies/trademark-and-brand-use.md). The
sticker-access boundary above remains controlling.
