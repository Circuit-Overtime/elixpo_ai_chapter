# App template

The minimal skeleton for a new OreoOS app. Copy this directory, rename
it, and start editing. Everything here is intentionally tiny — the
exhaustive reference (lifecycle hooks, drawing API, manifest fields,
persistence options) lives on the website:

➡ **<https://oreo.elixpo.com/docs/apps/>**

---

## Quick start

```bash
# From the repo root, with the badge connected over USB:
cp -r app_templates apps/my_app
python tools/deploy.py /dev/ttyACM0
```

Open the **Apps** drawer on the badge and you'll see *Example*. Press
**A** to increment the counter, **B** to decrement, **HOME** to exit.

To rename it: edit the `name` field in `manifest.json` and `name =` on
the `App` class in `src/app.py`. The on-device tile updates after the
next deploy.

---

## What's in the box

```
app_templates/
├── __init__.py            empty — makes the folder a Python package
├── manifest.json          name, version, author, icon
├── main.py                3-line entry shim — re-exports App
└── src/                   all real code lives here
    ├── __init__.py
    └── app.py             the App class — lifecycle + counter logic
```

`main.py` is a shim because the launcher imports it by convention.
Real code goes in `src/`. As your app grows, split it:

```
src/
├── app.py                 lifecycle hooks (on_enter/update/draw/input)
├── game.py                pure logic + constants
├── render.py              drawing functions
└── persistence.py         file/settings I/O
```

There's no rule about *how* to split — pick what makes the file you're
reading right now under 200 lines. `apps/snake/` is the reference for
a fully-split app; `apps/bt/` is the reference for an app that's
small enough to live as a single `src/app.py`.

---

## The contract (TL;DR)

Your app subclasses `oreoOS.App` and implements four methods, all
optional except `draw`:

```python
class App(oreoOS.App):
    name = "My App"

    def on_enter(self, os):       # once, when the app is opened
        ...

    def update(self, dt):         # per-frame logic
        ...

    def draw(self, d):            # per-frame render
        ...

    def on_button_press(self, btn):  # btn is api.BTN_A / B / UP / etc.
        ...
```

Set `self._dirty = True` when something visible changes and gate
`draw()` on it — re-flushing the framebuffer is the most expensive
thing per frame.

---

## Where do I put my app?

| Location | What it means |
|---|---|
| `apps/<name>/` | **Default-installed.** Tile appears in the drawer on every fresh deploy. Use for core OS tools + apps every badge owner should have. |
| `apps_market/<name>/` | **Opt-in.** Ships in the catalogue but isn't in the drawer until the user installs from the on-device **App Market** tile. Use for games, sketches, hackathon entries, themed extras. |

Both trees have the exact same shape — `tools/deploy.py` walks both.
When in doubt, ship to `apps_market/` so the drawer stays curated.

---

## Common gotchas

- **Don't call `d.present()`** — the OS does it once per frame.
- **Don't import `pygame` / `pillow`** — none of that ships on the device.
- **Network calls block the run loop.** Hide them behind
  `SHOW_LOADING = True` so the user sees the loading panel while
  `on_enter` runs.
- **Framebuf is RGB565 big-endian.** Use `oreoOS.api.rgb(r, g, b)` to
  pack colours — don't construct the integer by hand.
- **Themed colours over raw RGB.** Prefer `theme.PRIMARY`, `theme.BG`,
  `theme.TEAL` etc. — your app stays consistent if the brand palette
  shifts.

For everything else, the docs page has you covered:
**<https://oreo.elixpo.com/docs/apps/>**.
