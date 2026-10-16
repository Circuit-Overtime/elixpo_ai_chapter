# Public README synchronization

The canonical README sources live in `content/readme/` in `elixpo/elixpo`.
`scripts/render-readmes.mjs` combines those sources with the organization,
taxonomy, repository, and licensing records.

## Outputs

| Output | Destination |
| --- | --- |
| `docs/readme/generated/organization.md` | `elixpo/.github/profile/README.md` |
| `docs/readme/generated/chapter.md` | `elixpo/elixpo_chapter/README.md` |
| `docs/readme/generated/portal.md` | `elixpo/elixpo/README.md` |

The shared block is byte-identical across all three outputs and carries a
SHA-256 marker. Repository-specific wrapper content is also canonical here.

## Fine-grained PAT

Create a fine-grained personal access token with:

- resource owner: the `elixpo` organization;
- repository access: only `.github` and `elixpo_chapter`;
- repository permission `Contents`: read and write;
- repository permission `Pull requests`: read and write;
- `Metadata`: read, granted automatically; and
- an explicit expiry date with a named rotation owner.

Store it as `ELIXPO_README_SYNC_TOKEN`. If an organization Actions secret is
used, grant it only to the `elixpo/elixpo` source repository. Do not grant
administration, actions, deployments, environments, secrets, packages, issues,
or organization-management permissions.

The workflow pushes only the dedicated branch
`automation/sync-elixpo-readme` and opens or updates a pull request. It does not
push to a default branch and should not receive a branch-protection bypass.

## Normal operation

1. Change canonical registry facts or files under `content/readme/`.
2. Run `npm run registry:check`.
3. Run `npm run readme:write`.
4. Review and commit the canonical sources, generated outputs, and portal
   README together.
5. After the change reaches `main`, `sync-readmes.yml` opens or updates PRs in
   `.github` and `elixpo_chapter`.
6. Review downstream PRs normally; automation never merges them.

`npm run readme:check` fails when canonical output or the portal README drifts.
When sibling repositories are present locally, it checks their synchronized
READMEs as well.

## Emergency manual synchronization

Use this only when the workflow or scoped token is unavailable:

```bash
cd /home/elixpo/elixpo_projects/elixpo
npm run registry:check
npm run readme:sync-workspace
```

Then create separate feature branches and pull requests in `.github` and
`elixpo_chapter`. Do not copy only the shared block, edit generated markers, or
push directly to either default branch.

## Rotation and failure handling

- Rotate the PAT before its expiry and immediately after a maintainer or device
  security change.
- A missing or expired token intentionally fails before either target checkout.
- If a synchronization PR contains unrelated changes, close it, delete the
  automation branch, inspect the workflow run, and rotate the PAT before retry.
- If generated output is wrong, fix the canonical registry or source and rerun;
  never patch the downstream generated block as the permanent fix.
