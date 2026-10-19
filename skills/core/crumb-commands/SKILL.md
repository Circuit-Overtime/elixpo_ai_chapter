---
name: crumb-commands
description: Explain Crumb CLI input syntax, slash commands, keyboard controls, sessions, memory, model packs, effort, permissions, and configuration. Use when the user asks what a Crumb command or shortcut does or how to control Crumb itself; do not use for ordinary shell-command help.
---

# Crumb Commands

Answer from this reference. Be concise and name the exact command. Never execute a slash command through Bash: Crumb owns `/`, `?`, `:`, and `@` syntax before native-shell routing.

## Input syntax

- Natural text follows the configured router; prefix `:` to force an agent request.
- `/` then Tab completes Crumb commands. `?` is the short form of `/help`.
- `? config` shows the effective session configuration and its sources.
- `@file:<path>` and `@folder:<path>` attach bounded workspace context. `/context` explains all inline references; `/attach` and `/detach` manage persistent session context.
- Enter submits or steers an active turn; Ctrl+Enter queues; Alt/Shift+Enter inserts a newline; Ctrl+C cancels; PgUp/PgDn scroll.

## Agent controls

- `/mode [use auto|negotiate|plan]` inspects or changes execution mode.
- `/pack [use <id>]` shows or switches the router, vision, image-generation, and coder models as one capability pack.
- `/model [use <provider>/<model>]` inspects routes or selects an exact text model.
- `/effort [use light|medium|high|extra high|default]` inspects or changes reasoning effort. Higher effort can consume more provider tokens or credits.
- `/cost` shows provider-reported input/output tokens and the local fallback estimate.
- `/pause`, `/resume`, and `/cancel` control the active turn. `/jobs` and `/background` manage background work.
- `/review` manages Crumb edit checkpoints.

## Sessions, memory, and capabilities

- `/session` manages saved agent sessions; use `list`, `search`, `resume`, `inspect`, `rename`, `archive`, `restore`, `export`, or `delete`.
- `/memory` manages explicitly approved memory; use `show`, `remember`, `forget`, `search`, `inspect`, `tag`, `untag`, `replace`, `compact`, `conflicts`, `resolve`, or `repair`.
- `/skills` lists skills; `load`, `unload`, `add`, and `remove` change their registration or active state.
- `/skill` manages verified packages. `/skill run <publisher/name>[@version] -- <task>` runs only that exact installed and enabled skill; it never installs or enables one implicitly.
- `/tools` lists agent tools. `/permissions` inspects permissions; choose `always-ask`, `sensitive`, or `full-access`, and use `allow-network` or `deny-network` for network tools.
- `/plugins` and `/marketplace` manage external capabilities. `/graph` manages bounded local project-graph evidence. `/profile` manages persona profiles.

## Account, shell, and configuration

- `/auth login|status|logout` manages the Crumb account; `/connectors` shows connected services.
- `/config` shows live configuration; `/config provider ...` manages providers and discovery; `/config harness native` selects the native harness.
- `/history` shows native history and `/history search <query>` searches it.
- `/platform`, `/version`, and `/doctor` report system state. `/shell` enters raw native-shell mode. `/exit` exits.

If the user asks for the entire current palette, direct them to `/help`; it is the runtime source of truth and includes build-specific commands.
