---
name: lixrl-links
description: Manage Lixrl production short links through the installed lixrl CLI. Use when creating, listing, editing, disabling, deleting, exporting, or inspecting analytics for Lixrl links, including links selected for articles or agent-assisted publishing.
---

# Lixrl Links

Use the installed `lixrl` executable. Do not read credential files or ask the user to paste an API key into chat.

## Workflow

1. Run `lixrl whoami --json --no-input` before authenticated work.
2. If authentication is missing, ask the user to run `lixrl login --open` locally. The user approves identity on the official Elixpo Accounts device page, then chooses the key name, access, and expiry on Lixrl. The CLI stores the resulting key in the OS keychain. Never ask the user to share the one-time code or key in chat.
3. If the user already has a Lixrl key, direct them to `lixrl login --key`; the masked prompt is the only interactive place to paste it.
4. For CI only, use the platform secret store to provide `LIXRL_API_KEY`; never write it to a file, command argument, generated post, or log.
5. Inspect state with `lixrl urls list --json --no-input` before modifying it.
6. Use `--json --no-input` for every automated command.
7. Show the exact target and ask the user before adding `--yes` to delete, revoke, remove, unmap, or overwrite.
8. Report the returned short code or resource ID. Never expose API-key values after key creation.

Run `lixrl --help` for the complete command surface. Prefer `urls disable` over deletion when the desired outcome is reversible.

For articles, release notes, or agent-authored posts, read [references/blog-writing.md](references/blog-writing.md) before creating or replacing links.
