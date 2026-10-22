# Contributing to Elixpo

Thank you for your interest in contributing! Elixpo is built in the open by a
community of 45+ contributors, and we welcome developers, designers, writers,
and first-time contributors alike. This guide is the **standard** used across
every Elixpo repository.

## Ways to contribute

- **Code** - fix a bug, build a feature, improve performance or accessibility.
- **Docs** - improve guides, READMEs, or inline comments.
- **Design & brand** - icons, illustrations, and assets (see `brand/MASCOT.md`).
- **Triage** - reproduce issues, suggest labels, help others in Discussions.
- **Ideas** - propose features in [GitHub Discussions](https://github.com/orgs/elixpo/discussions).

## Before you start

1. Read the [Code of Conduct](CODE_OF_CONDUCT.md) - it applies everywhere.
2. Look for issues labelled **good first issue** or **help wanted**.
3. For anything non-trivial, open or comment on an issue first so we can align
   before you invest time.

## Workflow

1. **Fork** the repository and create a branch from `main`:
   `git checkout -b feat/short-description`
2. **Make your change.** Match the existing code style and keep commits focused.
3. **Test it.** Make sure the project builds and existing checks pass.
4. **Open a pull request** with a clear title and description of what changed
   and why. Link any related issue.
5. A maintainer will review. Address feedback, and once approved we merge.

## Tests

Use Node.js 20 or newer and install dependencies from the repository root with `npm install`.

Run the complete LixSketch package suite from the repository root:

```sh
npm test
```

This runs the Vitest unit suite and the existing Node.js MCP tests. To run only unit tests:

```sh
npm run test:unit --workspace @elixpo/lixsketch
```

Unit tests live in `packages/lixsketch/test/unit/` and use the `*.test.js` suffix. Keep DOM-independent logic in the default Node environment and stub only the browser globals a module directly requires.

## Adding a UI or docs language

The current interface and legacy docs viewer support English (`en`), Bulgarian (`bg`), German (`de`), and Hindi (`hi`). Add only one language per pull request.

1. Copy `src/locales/en.json` to `src/locales/<code>.json` and translate every value without changing its key structure.
2. Copy the completed file to `public/locales/<code>.json`. The static docs viewer loads this copy through `docs/JS/docsI18n.js`.
3. Import the locale in `src/lib/i18n.js` and add the language to both Preferences selectors in `src/components/menu/AppMenu.jsx` and `packages/lixsketch/src/react/components/AppMenu.jsx`.
4. Compare the flattened keys with English and run `npm test`. A translation must not rely on missing-key fallback.

## Commit & PR conventions

- Write clear, present-tense commit messages (e.g. `fix: handle empty roster`).
- Keep pull requests small and single-purpose where possible.
- Update docs and tests alongside code changes.

## Licensing of contributions

By submitting a contribution you agree it is licensed inbound under the Elixpo
standard (**MIT** for code, **CC-BY-4.0** for assets) and that you have the
right to submit it. The
[Developer Certificate of Origin](https://developercertificate.org) applies to
every commit. We do not require a CLA. See [LICENSE](LICENSE) and
[NOTICE](LICENSES/NOTICE) for details, including the reserved Elixpo/Oreo brand.

## Questions?

Open a thread in [Discussions](https://github.com/orgs/elixpo/discussions) or
email **hello@elixpo.com**. We're glad you're here.
