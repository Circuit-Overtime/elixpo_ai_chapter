<h1 align="center">
  <img src="crumb.elixpo/public/favicon.png" width="42" height="42" alt="Crumb panda" />
  <br />
  Crumb CLI
</h1>

<p align="center">
  <strong>Your terminal, with an agent that actually gets the work done.</strong>
</p>

<p align="center">
  Ask naturally. Keep using the commands you know. Stay in control.
</p>

<p align="center">
  <a href="https://crumb.elixpo.com">Website</a> ·
  <a href="https://crumb.elixpo.com/docs">Docs</a> ·
  <a href="https://github.com/elixpo/crumb.elixpo/issues">Ideas & feedback</a>
</p>

<p align="center">
  <img src="crumb.elixpo/public/og-image.png" alt="Crumb natural-language terminal" width="100%" />
</p>

## Install

Linux and macOS:

```bash
curl --proto '=https' --tlsv1.2 -LsSf \
  https://raw.githubusercontent.com/elixpo/crumb.elixpo/main/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/elixpo/crumb.elixpo/main/install.ps1 | iex
```

The installer downloads the matching GitHub Release asset, verifies its
SHA-256 checksum, and installs `crumb` into a user-owned directory. See the
[release process](docs/development/release-process.md) for version pinning,
signature verification, supported platforms, and uninstall instructions.

## The goal

Crumb turns the terminal into a capable teammate. Tell it what you want done, let it use the tools you approve, and get a clear report when the work is finished.

It is made for people who want the speed of an AI agent without giving up the control, familiarity, or power of their own terminal.

## What you can do

- Ask Crumb to investigate, build, fix, search, or explain.
- Use normal Bash, Zsh, and PowerShell commands as usual.
- Watch commands, file edits, progress, and results while Crumb works.
- Steer, pause, cancel, or continue a task at any time.
- Keep useful context across sessions without losing sight of what is stored.
- Add skills and connect services when you need them.
- Choose how much access Crumb has—and change it whenever you want.

Try requests like:

> Find out why the tests are failing, fix the problem, and tell me what changed.

> Check whether I am signed in to GitHub and show me the current branch.

> Research this error, compare the likely fixes, and apply the safest one.

## Clear while it works

Crumb keeps the important parts visible: what it is doing, which tools it is using, how long commands take, what files changed, and how much context has been used. Detailed tool output stays out of the way until you choose to open it.

## You stay in charge

Crumb asks before sensitive actions, keeps permissions in your hands, and shows the exact command it wants to run. You can work in planning mode, approve one action at a time, or allow broader access for a trusted workspace.

If an AI service is unavailable, your terminal still works.

## Make it yours

Use model packs for different kinds of work, add focused [skills](https://crumb.elixpo.com/skills), install [plugins](https://crumb.elixpo.com/plugins), and connect outside services through [connectors](https://crumb.elixpo.com/profile/connectors).

<p align="center">
  <img src="crumb.elixpo/public/icon-192.png" width="96" height="96" alt="Crumb app icon" />
</p>

<p align="center">
  <img src="crumb.elixpo/public/pollinations-favicon.png" width="18" height="18" alt="" />
  Powered by <a href="https://pollinations.ai">Pollinations</a> · Built by <a href="https://elixpo.com">Elixpo</a> for people who live in the terminal.
</p>
