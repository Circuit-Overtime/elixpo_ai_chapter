# Contributing to Oreo Badge

## Quick map

- **🐛 Bug?** → open an issue with the badge model, firmware version
  (`Settings → Version`), and a one-line description.
- **🎨 New app?** → see [Writing an app](#writing-an-app) below.
- **🔧 Driver / OS change?** → see [Hacking on the OS](#hacking-on-the-os).
- **📦 Release / OTA?** → see [Releasing](#releasing).
- **🧑‍🤝‍🧑 Conduct?** → see [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

---

## Setup

```bash
git clone https://github.com/elixpo/oreo
cd oreo
python -m venv .venv && source .venv/bin/activate
pip install -r oreoOS/requirements.txt
```

You don't strictly need a real badge to develop most apps — running the
CPython importers locally catches the majority of issues. But the real
test is always on hardware. If you don't have a badge, ping
**hello@elixpo.com** and we'll see what we can do.

---

## Writing an app

> The full reference lives on the website:
> [**oreo.elixpo.com/docs/apps**](https://oreo.elixpo.com/docs/apps/). This
> section is the quick start; the docs page goes deep on every
> lifecycle hook, manifest field, and drawing primitive.

The fastest path to a working app:

```bash
cp -r app_templates apps/my_app       # minimal counter app, ready to run
# OR start from snake — fully-split reference layout:
#   cp -r apps/snake apps/my_app
# edit apps/my_app/manifest.json — name, author, icon
# edit apps/my_app/src/app.py    — your App class lives here
python tools/deploy.py /dev/ttyACM0
```

**Default-installed vs Market apps.** Where you put the folder decides
how the app reaches the user:

| Path | Behaviour |
|---|---|
| `apps/<name>/` | **Default-installed.** Tile appears in the drawer on every fresh deploy. Use for core OS tools + apps every badge owner should have |
| `apps_market/<name>/` | **Opt-in.** Ships in the catalogue but isn't in the drawer until the user installs from the on-device **App Market** tile. Use for games, sketches, hackathon entries, themed extras |

Both trees have **identical shape** — the new modular layout below.
`tools/deploy.py` walks both and ships them to the matching path on
the device. The Market app calls into
[`oreoOS.store`](oreoOS/store.py) which `cp -r`s a folder between the
two trees on install / uninstall.

When in doubt, ship to `apps_market/` — flash and drawer real estate
are precious, and the install flow is one tap away.

**The layout (since v1.x — see the migration note at the bottom).**

```
apps/my_app/
├── __init__.py            empty marker
├── main.py                3-line shim → re-exports App from src/
├── manifest.json          name + version + icon + author
├── assets/                optional
│   ├── raw/               source images you commit
│   └── optimized/         baked RGB565 .py modules
└── src/                   your code, modular
    ├── __init__.py
    ├── app.py             the App class — lifecycle hooks
    ├── game.py            (example) pure logic + constants
    ├── render.py          (example) drawing functions
    └── highscore.py       (example) persistent I/O
```

`main.py` is now a thin re-export shim — the launcher still loads it
and reads `App` off it, but real code belongs under `src/`. The split
inside `src/` is your call. A tiny utility might be a single
`src/app.py`; a complex game can have a dozen modules. The deploy
script pushes every `.py` under `src/` recursively, so adding a new
module needs no tooling change.

**The contract.** Your app subclasses `oreoOS.App` and implements three
lifecycle methods:

```python
# apps/my_app/src/app.py
import oreoOS
from oreoOS import api, theme, widgets

class App(oreoOS.App):
    name = "My App"

    def on_enter(self, os):
        # one-shot setup. load sprites, restore state, calibrate sensors.

    def update(self, dt):
        # per-frame logic. dt is seconds since last frame.

    def draw(self, d):
        # per-frame render. d is the framebuffer. don't call d.present().
```

And the shim:

```python
# apps/my_app/main.py
from .src.app import App
__all__ = ["App"]
```

Optional hooks: `on_exit`, `on_button_press(btn)`,
`on_button_release(btn)`, `on_home_press()` (returns True to suppress
the default HOME-to-drawer behaviour).

**Class attributes you can set:**

- `name`            — what appears on the launcher tile + loading screen
- `SHOW_LOADING`    — `True` if `on_enter` takes > 200 ms
- `BLOCK_IDLE`      — `True` for apps that should keep the screen on
                       even without button presses (games, IR scanner)

To bake assets: drop a PNG/JPG into `assets/raw/`, run
`python tools/optimize_assets.py --app my_app`, commit the result.

The `theme` module is the source of truth for colours. If you find
yourself reaching for `api.rgb(...)` directly, ask whether there's a
themed constant that fits.

> **Migrating an older app.** Before the `src/` convention, every app
> kept its `App` class directly in `main.py`. Every app in this repo
> has since been migrated; if you're working from an old fork: move
> the contents of `main.py` to `src/app.py`, create an empty
> `src/__init__.py`, and replace `main.py` with the 3-line shim
> above. No other change is required — absolute imports keep working.

---

## Hacking on the OS

The OS lives in two packages:

- `oreoOS/` — pure Python: launcher, splash, theme, widgets, app base
  class, OTA client, cache, power manager, etc.
- `oreoWare/` — hardware drivers: display, buttons, WiFi, BT, IMU, IR,
  battery, touch. **Everything is funnelled through `oreoWare/pins.py`**
  so a PCB pin swap only touches that file.

**Conventions worth knowing:**

- One source of truth for pins, one for colours, one for VERSION.
- Apps that read network data should cache to disk with a TTL via
  `oreoOS.cache`. See `apps/badge/main.py` for the pattern.
- The framebuf is RGB565 big-endian. Use `api.rgb(r, g, b)` to pack —
  don't construct the integer by hand.
- Anything that might block (network, heavy compute) should either be
  short-timeout-bounded OR set `SHOW_LOADING = True` so the user sees a
  panel during `on_enter`.

---

## Pull requests

1. **Branch off main.** Name it something descriptive
   (`feature/ir-quest-leaderboard`, not `patch-1`).
2. **Run the deploy** locally to make sure the OS still boots. If your
   change touches drivers, test wake-from-sleep, OTA, and at least two
   apps you didn't write.
3. **One PR, one purpose.** Don't bundle a bug-fix with a rename, and
   don't fold a 4-file refactor into a typo PR.
4. **Title format:** `[scope] short description`, e.g.
   `[ota] fix peek() to handle malformed manifest`.
5. **Tag a maintainer** in the PR description so we see it. Right now
   that's [@Circuit-Overtime](https://github.com/Circuit-Overtime).

We try to respond within a week. If we haven't, please nudge — the
notification probably got lost in conference-season chaos.

---

## Releasing

Maintainers only — feel free to skip this section.

Releases are **manual on purpose**. We want a human to look at a badge
running the release candidate before the wider fleet pulls it in.

**Before tagging:** add the new version's section to the top of
[`CHANGELOG.md`](CHANGELOG.md). The CI release workflow takes the
**top section** of that file verbatim and posts it as the GitHub
release's `body` — which is what the badge's **Updates** screen shows
as the in-device changelog when an upgrade is found. Keep entries
short, bullet-style, present tense.

The one-liner:

```bash
# Dry-run first so you can read every command the script will execute.
python tools/release.py v1.4.0 --channel stable --dry-run

# Looks good? Drop --dry-run and ship.
python tools/release.py v1.4.0 --channel stable --notes "Fly mode + new pet sprites"
```

Under the hood the script:

1. Verifies `git` + `gh` are installed and you're authenticated.
2. Refuses to release if the working tree is dirty (override with `--force`).
3. Bumps `oreoOS/config.py:VERSION` to `v1.4.0` if it isn't already.
4. Commits the bump and pushes `main` + the new tag (`stable/v1.4.0`).
5. Runs `tools/build_release.py` to produce
   `dist/v1.4.0/{manifest.json, bundle.tar, files/...}`.
6. Calls `gh release create` to publish, uploading every file as a
   per-asset attachment so the manifest's per-file URLs resolve.

A few minutes later every badge in the field with WiFi will see the
SHA-based check find the new version within 6 h, and **Settings →
Check Update** will pull it down on demand.

For a **beta** channel: `python tools/release.py v1.4.0-rc1 --channel beta`.
Badges only pick up the channel they're configured for (`stable` by
default).

If you don't have a dev machine handy: the GitHub Actions
[`release` workflow](.github/workflows/release.yml) does the same thing
when you click **Run workflow** in the Actions tab — same script under
the hood, no auto-trigger on tag push.

---

## Project values

- **Friendly is feature.** A confusing-but-correct UI is a bug.
- **Readable comments beat clever code.** This project is meant to be
  hackable; if something would surprise a first-time reader, comment it.
- **Hardware is a teammate, not a constraint.** Lean on the chip's
  strengths. Don't fight the LDO.
- **Ship small, ship often.** The OTA pipeline is there so we can.

---

## Contact

- **Email:** hello@elixpo.com
- **GitHub:** https://github.com/elixpo/oreo
- **Maintainer:** [@Circuit-Overtime](https://github.com/Circuit-Overtime)

Thanks for being here. 🐼
