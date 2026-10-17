Run Biome to fix lint/format issues on the current branch.

```bash
./biome.sh         # apply safe + unsafe fixes
./biome.sh ci      # must exit 0 before commit
```

If `./biome.sh ci` fails:
1. Read the output. Real errors are the only thing that fails CI — `info` and `warn` don't.
2. Fix the errors by hand in the files listed.
3. Re-run `./biome.sh ci` until it exits 0.

Do NOT disable rules or add `biome-ignore` comments to silence errors unless the rule genuinely doesn't apply to this code — and if you do, add a comment on the same line explaining why.

`noExplicitAny` is set to `info` (warning) in `biome.jsonc` because `any` is used intentionally at OAuth/auth boundaries. Don't add `any` elsewhere just to quiet the linter.
