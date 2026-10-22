# CLI distribution size guidance

The release workflow reports the unpacked size of `@elixpo/lixblogs-cli` so
reviewers can catch accidental growth. Size is an optimization signal rather
than a hard release gate. Runtime dependencies installed separately by npm are
not included in the reported package payload.

Registry metadata sampled on 2026-08-29:

| Package | Unpacked | Files | Runtime dependencies | Functional scope |
| --- | ---: | ---: | ---: | --- |
| `@tryghost/ghst@0.17.0` | 1,515,748 B | 5 | 19 | Broad publishing, members, newsletters, migrations, stats, and MCP |
| `@sinedied/devto-cli@1.4.0` | 60,170 B | 33 | 16 | Initialize, create, push, and inspect article stats |
| `@elixpo/lixblogs-cli@1.3.3` | 167,982 B | 50 | 1 | Auth, profiles, blog lifecycle, organizations, collaboration, analytics, and skills |
| Optimized LixBlogs payload | 101,811 B | 15 | 1 | Full CLI surface including six bundled skills and BYOP media generation |

Sources: [Ghost CLI](https://github.com/TryGhost/ghst),
[Dev.to CLI](https://www.npmjs.com/package/@sinedied/devto-cli), and npm registry
`dist` metadata. The optimized value is measured from the generated executable,
README, license, package metadata, and six bundled skills; GitHub Actions measures the
actual tarball contents again before release and reports their unpacked size.

## Rules

- Bundle and minify first-party modules into `dist/lixblogs.mjs`.
- Keep `@napi-rs/keyring` external so npm selects the correct native binary.
- Publish user-facing essentials only; keep contributor and contract documents
  in the repository and link to them from the packaged README.
- Review unexpected size growth alongside the packed artifact's file list.
- Do not remove commands, skills, validation, or security behavior to meet the
  budget.
