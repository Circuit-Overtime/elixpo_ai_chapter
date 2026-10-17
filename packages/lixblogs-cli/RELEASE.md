# Release and compatibility policy

## Compatibility

- CLI `1.x` targets LixBlogs API `/api/v1` and the Accounts OAuth discovery contract.
- Additive response fields and commands are minor releases. Fixes without contract changes are patch releases.
- Removing a command, field, scope, or error code requires a CLI major release or API `/api/v2`.
- The resource metadata `minCliVersion` is authoritative. An older client must stop before authenticated requests and ask the user to upgrade.
- Node 18 is the supported runtime floor. Release gates run on Node 22.

## Release

1. Merge a reviewed CLI change to `main`, or manually dispatch **Deploy** with the `packages` target.
2. `deploy.yml` selects the CLI branch from the changed paths and calls `./deploy.sh --package --cli build`.
3. The deployment reports package size, enforces smoke contracts, signs the exact checksummed tarball, then passes it back to `deploy.sh` for npm and GitHub Packages publishing.
4. The workflow commits the generated patch version with `[skip deploy]`, creates `lixblogs-cli-vX.Y.Z`, and attaches the tarball and checksum to the GitHub release.

The `npm` environment must expose `NPM_TOKEN` with publish access to both scoped packages. GitHub Packages uses the workflow token with `packages: write`.

Consumers can verify a downloaded release with:

```bash
sha256sum --check elixpo-lixblogs-cli-*.tgz.sha256
gh attestation verify elixpo-lixblogs-cli-*.tgz --repo elixpo/blogs.elixpo
```

## Smoke criteria

The packed artifact's [distribution size](SIZE_BUDGET.md) is reported for review. It must install into an empty prefix, render `--help`, discover all scoped skills, and pass auth, blog lifecycle, organization, collaboration, and analytics command tests. Accounts must pass device approval, refresh rotation, replay protection, and revocation. Blogs must pass bearer validation, concurrency/idempotency, analytics, and media request-boundary tests.

## Rollback

1. Stop a broken release with `npm deprecate @elixpo/lixblogs-cli@X.Y.Z "Do not use; upgrade to X.Y.N"`.
2. Restore the previous compatible version with `npm dist-tag add @elixpo/lixblogs-cli@GOOD latest`.
3. Open a patch PR; never reuse or delete the published version.
4. Re-run the release gate and publish a new patch tag.
5. If the API contract caused the failure, raise `minCliVersion` only after the compatible patch is available.
