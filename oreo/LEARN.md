<div align="center">

# Learn from OreoOS

**A guided tour of an open-source Python OS for a conference badge.**

[![Built with Pollinations](https://img.shields.io/badge/Built%20with-Pollinations-8a2be2?style=for-the-badge&logoColor=white&labelColor=6a0dad)](https://pollinations.ai)
[![Docs](https://img.shields.io/badge/docs-oreo.elixpo.com-FF5D68?style=for-the-badge)](https://oreo.elixpo.com)
[![Contribute](https://img.shields.io/badge/contribute-good_first_issues-00B4A5?style=for-the-badge)](https://github.com/elixpo/oreo/contribute)

</div>

---

This document is for **anyone who wants to learn from this repo** — students
joining via GitHub Global Campus, hackathon teams looking for a real
embedded-systems project to study, or developers who want to see how a
MicroPython OS hangs together end-to-end.

You **don't need a badge** to start. Most of the code is plain Python you
can read on a laptop. The hardware is optional until you want to see
your changes light up an LCD.

---

## 🧠 What you can learn here

OreoOS is small enough to read in a weekend but real enough to teach
patterns you'll use everywhere:

| Topic | Where to look |
|---|---|
| **Designing a tiny app SDK** — base class, lifecycle hooks, dependency injection | [`oreoOS/app.py`](oreoOS/app.py), [`oreoOS/launcher.py`](oreoOS/launcher.py) |
| **Cooperative scheduling** — running games at ~33 FPS without preemption | [`oreoOS/launcher.py`](oreoOS/launcher.py) main loop |
| **MicroPython idioms** — what's missing vs CPython, what's faster | every `oreoOS/*.py` file |
| **Bitmap framebuffer rendering** — RGB565, chroma-key transparency, blit, scaled blit | [`oreoWare/display.py`](oreoWare/display.py) |
| **Pixel-art bitmap fonts** — baked-at-build-time `.py` modules | [`oreoOS/pixelfont.py`](oreoOS/pixelfont.py) |
| **A multipart HTTP server in 1200 lines** — accept, parse, stream-to-disk | [`oreoOS/http_server.py`](oreoOS/http_server.py) |
| **BLE pairing + adv** — NimBLE on ESP32, GATT services, scan + advertise | [`oreoWare/bt.py`](oreoWare/bt.py) |
| **OTA update mechanism** — GitHub Releases as a delivery channel, SHA verification | [`oreoOS/ota.py`](oreoOS/ota.py) |
| **An on-device app store** — pulling apps from GitHub at runtime, no flash | [`oreoOS/store.py`](oreoOS/store.py) |
| **Caching with TTL** — small disk + memory cache for network responses | [`oreoOS/cache.py`](oreoOS/cache.py) |
| **A theme system** — single colour source of truth across the OS | [`oreoOS/theme.py`](oreoOS/theme.py) |
| **Game design on tiny screens** — Snake, Flappy, Racer, IR Quest | [`apps/snake/`](apps/snake/), [`apps/flappy/`](apps/flappy/), [`apps/racer/`](apps/racer/), [`apps/quest/`](apps/quest/) |
| **Static-site deployment** — Next.js → Cloudflare Pages, custom domain | [`oreo.elixpo/`](oreo.elixpo/) |
| **Asset pipelines** — PNG → RGB565 baked Python modules | [`tools/optimize_assets.py`](tools/optimize_assets.py) |
| **A custom hardware-design notebook** — pin maps, schematics, BOM thinking | [`docs/`](docs/) |

---

## 🚀 Quick start (no badge required)

```bash
git clone https://github.com/elixpo/oreo
cd oreo

# Browse the code
ls apps/                  # 20 apps, each in its own folder
ls oreoOS/                # the OS layer
ls oreoWare/              # hardware drivers
```

Read **one file per evening** for a week and you'll have a solid model
of how the whole thing works. Suggested order in the learning path
below.

If you do have hardware later:

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r oreoOS/requirements.txt
python tools/deploy.py /dev/ttyACM0     # flash to a connected ESP32-S3
```

---

## 🧭 Learning path

A progression from "first look" to "writing your own apps." Each level
takes about an evening.

### Level 1 — Read one app, end-to-end

Start with **[`apps/snake/`](apps/snake/)**. It's the reference for
the modular layout and small enough to read in 30 minutes.

Open these four files in order:

1. **[`apps/snake/manifest.json`](apps/snake/manifest.json)** — metadata
   the launcher reads.
2. **[`apps/snake/main.py`](apps/snake/main.py)** — the 3-line entry
   shim. Notice it just re-exports `App` from `src/`.
3. **[`apps/snake/src/app.py`](apps/snake/src/app.py)** — the lifecycle
   hooks (`on_enter`, `update`, `draw`, `on_button_press`). Read this
   first to understand the contract.
4. **[`apps/snake/src/game.py`](apps/snake/src/game.py)** — pure logic.
   The `step()` function is a pure function you could literally test
   on a laptop with `pytest`. That's the whole point of the
   logic/render/persistence split.

**What you should walk away with**: the lifecycle contract, the
`_dirty` redraw pattern, and the split between logic and rendering.

### Level 2 — Read the OS that calls those apps

Now look at the other side of the contract — how the OS *loads* and
*runs* apps:

1. **[`oreoOS/app.py`](oreoOS/app.py)** — the `App` base class.
   ~80 lines. Read all of it.
2. **[`oreoOS/launcher.py`](oreoOS/launcher.py)** — the main run loop.
   Find `load_app()`, then trace one frame: `app.update(dt)` → `app.draw(d)`
   → display flush → frame-pacing `sleep_ms`.
3. **[`oreoOS/theme.py`](oreoOS/theme.py)** — every colour the OS uses,
   in one file. A useful pattern for any UI project.
4. **[`oreoOS/widgets.py`](oreoOS/widgets.py)** — the shared chrome
   (header bar, hint bar) that every app uses. Composition over
   inheritance.

**Insight**: an app SDK is mostly about *what shape you want the
user's code to take*. Three methods + one base class + a manifest is
plenty.

### Level 3 — Pick a subsystem that excites you

Pick **one** of these and read it. Each is self-contained and teaches
something specific.

- **HTTP server** — [`oreoOS/http_server.py`](oreoOS/http_server.py).
  How to build a single-threaded, non-blocking HTTP+multipart server
  in MicroPython. Hand-written multipart parsing, streaming to disk,
  rotating one-time codes, session state machine.
- **BLE** — [`oreoWare/bt.py`](oreoWare/bt.py) + [`oreoOS/pair_prompt.py`](oreoOS/pair_prompt.py).
  Real NimBLE GATT services, advertising, scanning, pairing flow.
- **OTA** — [`oreoOS/ota.py`](oreoOS/ota.py). Background update
  checks, SHA verification, staging + atomic swap. Production-grade
  patterns at a readable size.
- **Asset baking** — [`tools/optimize_assets.py`](tools/optimize_assets.py).
  PNG → RGB565 with chroma-key transparency, baked into importable
  Python modules. A build pipeline you can copy for any embedded
  graphics project.
- **App store** — [`oreoOS/store.py`](oreoOS/store.py). How to use the
  GitHub Contents API as a runtime app catalogue. Cute hack;
  surprisingly robust.

### Level 4 — Write your own app

You don't need a badge for this — read your code, reason about it,
catch typos, get the shape right. When you do have hardware, deploy
takes one command.

```bash
cp -r app_templates apps/my_app
# Edit apps/my_app/manifest.json — name, author, icon
# Edit apps/my_app/src/app.py    — your logic
```

See **[`app_templates/README.md`](app_templates/README.md)** for the
walkthrough and **<https://oreo.elixpo.com/docs/apps/>** for the deep
reference (lifecycle hooks, drawing API, manifest fields, persistence).

Suggested first apps to build:

- **Clock with a custom face** — practice the framebuffer + theme.
- **Coin flip / dice roller** — practice random + animation.
- **A list of your favourite quotes** — practice file persistence +
  scrolling text.
- **Calculator** — practice button handling + state machines.

### Level 5 — Contribute back

Once you can write apps, the next step is upstreaming improvements to
the OS itself, or shipping an app to the on-device store.

- Browse [`good first issue`](https://github.com/elixpo/oreo/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
  labels.
- Read [`CONTRIBUTING.md`](CONTRIBUTING.md).
- Ship a Market app: drop a folder into [`apps_market/`](apps_market/).
  It'll show up on every badge's App Market tile the next time the
  catalogue refreshes.

---

## 🛠️ Suggested first contributions

These are scoped small enough for a first-time contributor and don't
require having the hardware on your desk to write correctly.

| Task | Files to touch | Difficulty |
|---|---|:-:|
| Add a new quote to the Reader's default set | [`apps/reader/`](apps/reader/) | ⭐ |
| Add a new colour to the theme | [`oreoOS/theme.py`](oreoOS/theme.py) | ⭐ |
| Write a Market app (any small game / utility) | [`apps_market/`](apps_market/) | ⭐⭐ |
| Add a new lifecycle hook the OS calls | [`oreoOS/app.py`](oreoOS/app.py), [`oreoOS/launcher.py`](oreoOS/launcher.py) | ⭐⭐⭐ |
| Improve the WiFi-transfer UI | [`oreoOS/http_server.py`](oreoOS/http_server.py), [`apps/wifi/`](apps/wifi/) | ⭐⭐⭐ |
| Add a power-management feature to OTA | [`oreoOS/ota.py`](oreoOS/ota.py), [`oreoOS/power.py`](oreoOS/power.py) | ⭐⭐⭐⭐ |

---

## 🔗 Resources

- **Website** — <https://oreo.elixpo.com> (overview, badge, apps, hacks)
- **App-building docs** — <https://oreo.elixpo.com/docs/apps/>
- **Contributing guide** — [`CONTRIBUTING.md`](CONTRIBUTING.md)
- **Issues** — <https://github.com/elixpo/oreo/issues>
- **App template** — [`app_templates/`](app_templates/)
- **Reference app (fully split)** — [`apps/snake/`](apps/snake/)

External:

- [MicroPython docs](https://docs.micropython.org/en/latest/) — the
  language reference. Different from CPython in important places.
- [ESP32-S3 datasheet](https://www.espressif.com/en/products/socs/esp32-s3) — the
  SoC powering the badge.
- [Pollinations.ai](https://pollinations.ai) — used for every asset
  in the project.

---

## 💬 Stuck? Ask.

Open a [Discussion](https://github.com/elixpo/oreo/discussions) with
the tag `learning` — questions about why something is the way it is
are *especially* welcome, because they often reveal docs we should
have written. There is no such thing as a beginner question here.

Happy hacking. 🐼
