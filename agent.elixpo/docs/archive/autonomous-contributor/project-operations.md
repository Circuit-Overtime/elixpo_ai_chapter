# GitHub Project operations view

The operations board contains public issue and pull-request metadata only. It
does not store source, prompts, transcripts, credentials, or authorization data.

## One-time setup

1. Create `ELIXPOO_GITHUB_PROJECT_TOKEN` for the `elixpoo` account with:
   - read access to public Issues and pull requests;
   - read/write access to the selected GitHub Project.
2. Set `ELIXPO_GITHUB_PROJECT_OWNER` locally to the user or organization login.
3. Create and provision the public Project explicitly:

   ```bash
   python -m agents.project --setup
   python -m json.tool state/project_setup.json
   ```

4. Set repository variables:
   - `ELIXPO_GITHUB_PROJECT_OWNER` to the same login;
   - `ELIXPO_GITHUB_PROJECT_NUMBER` to `project_number` from the setup receipt.
5. Run the `project operations` workflow manually once.

Setup creates the `Elixpoo Operations` Project, its default view, required custom
fields, `Agent Status` options, and filtered views for active work, maintainer
waiting, failures, merged work, token warnings, and cleanup debt. It runs only through the explicit `--setup`
flag. Existing fields with the same names must have the exact expected type;
mismatches fail closed rather than overwriting human data.

## Fields

- Agent Status
- Issue Key
- Current Squad
- Run ID
- Branch
- PR URL
- Started At / Updated At
- Token Target / Token Spend
- Doctor Warning
- Cleanup Status

GitHub supplies the issue title, repository, URL, assignees, labels, and native
open/closed state because each item is the original external issue.

## Test locally

Build and inspect sanitized snapshots without writing Project fields:

```bash
python -m agents.project --dry-run
python -m json.tool state/project.json
```

The dry run still requires `ELIXPOO_GITHUB_PROJECT_TOKEN` to resolve public issue
node IDs. A production run additionally requires the owner and project number.

## Recovery

The scheduled fifteen-minute reconciliation is authoritative after missed
workflow events. Updates are idempotent. A different run ID cannot overwrite a
newer Project item timestamp, and one failed item does not stop the remainder.
