"""Oreo OS — app loader, generic run loop, crash screen, boot entry point.

Apps live in apps/<name>/ with a manifest.json and a main.py that exposes
an App class subclassing oreoOS.App.  The OS launcher owns the top-level loop;
individual screens (splash, home, app-menu) live in separate modules.
"""

import gc
import json
import os as _os
import time

from oreoOS import api

from oreoOS.config import VERSION   # single source of truth; deploy bumps PATCH
# Target ~33 fps (30 ms cap). At 40 MHz SPI a full framebuf push is 30.7 ms,
# plus ~3 ms render → total ≈ 34 ms. The sleep rarely actually fires during
# gameplay; it caps idle screens so they don't hammer the panel >50 fps.
FRAME_MIN_MS = 30

_APPS_CANDIDATES = ("/apps", "/remote/apps", "apps")


def _find_apps_dir():
    for d in _APPS_CANDIDATES:
        try:
            _os.stat(d)
            return d
        except OSError:
            continue
    return None


APPS_DIR = _find_apps_dir() or "/apps"


# ── app discovery ─────────────────────────────────────────────────────────────

def list_apps():
    """Return [{'dir':..., 'name':..., 'type':...}, ...]  sorted by dir name."""
    apps = []
    try:
        entries = _os.listdir(APPS_DIR)
    except OSError:
        return apps
    for entry in sorted(entries):
        try:
            with open("%s/%s/manifest.json" % (APPS_DIR, entry)) as f:
                manifest = json.loads(f.read())
            apps.append({
                "dir":    entry,
                "name":   manifest.get("name", entry),
                "type":   manifest.get("type", "app"),
                "color":  manifest.get("color", None),
                "icon":   manifest.get("icon", None),
                "author": manifest.get("author", None),
            })
        except (OSError, ValueError):
            continue
    return [a for a in apps if a["type"] == "app"]


def load_app(app_dir):
    module_path = "apps.%s.main" % app_dir
    mod = __import__(module_path, None, None, ["App"])
    app = mod.App()
    # Pull the `author` field off the manifest and stamp it onto the app
    # instance so `_show_loading()` can render "By @author" without each
    # app needing to declare the attribute on the class.
    try:
        with open("%s/%s/manifest.json" % (APPS_DIR, app_dir)) as f:
            manifest = json.loads(f.read())
        if manifest.get("author"):
            app.author = manifest["author"]
    except (OSError, ValueError):
        pass
    return app


# ── loading transition (used for slow apps) ──────────────────────────────────
# A flag-on-the-App-class opts in:    class App(oreoOS.App): SHOW_LOADING = True
# Cost: ~210 ms slide-in animation BEFORE app.on_enter — the heavy load then
# runs while the loading panel is the only thing on screen.

def _show_loading(os_obj, label, author=None):
    """Slide a primary-coloured panel down from the top, covering the screen.

    Polls HOME each frame so the user can abort a slow app launch without
    waiting for the on_enter to finish — returns True when interrupted.
    """
    from oreoOS import theme
    display = os_obj.display
    buttons = os_obj.buttons
    SW = api.SCREEN_W
    SH = api.SCREEN_H
    label  = (label  or "")[:16].upper()
    byline = ("By @" + author[:24]) if author else ""

    steps      = 12          # more keyframes = smoother slide
    frame_ms   = 33          # ≈ 30 fps
    label_lbl  = "LOADING"
    label_x_l  = (SW - len(label_lbl) * 16) // 2
    label_x_n  = (SW - len(label)     *  8) // 2
    byline_x   = (SW - len(byline)    *  8) // 2
    hint       = "HOME to cancel"
    hint_x     = (SW - len(hint) * 8) // 2

    for i in range(steps + 1):
        # HOME interrupt — the only escape hatch while the slide plays,
        # since the app's on_enter blocks the main loop once we exit.
        buttons.update()
        if buttons.just_pressed(api.BTN_HOME):
            return True

        t        = i / steps
        eased    = 1.0 - (1.0 - t) ** 3
        panel_h  = int(eased * SH)

        display.rect(0, 0, SW, panel_h, theme.PRIMARY, fill=True)
        if panel_h < SH:
            display.rect(0, panel_h, SW, SH - panel_h, theme.BG, fill=True)

        if panel_h > 60:
            cy = panel_h // 2
            display.text(label_lbl, label_x_l, cy - 16, api.WHITE, scale=2)
            display.text(label,     label_x_n, cy +  6, api.WHITE)
            if byline and panel_h > 100:
                display.text(byline, byline_x, cy + 24, api.WHITE)
            if panel_h > 140:
                display.text(hint, hint_x, panel_h - 22, api.WHITE)

        display.present()
        time.sleep_ms(frame_ms)
    return False


# ── generic app run loop ──────────────────────────────────────────────────────

def run_app(os_obj, app):
    os_obj._quit_requested = False
    os_obj._launch_request = None

    # Optional loading transition for heavy apps. The panel covers the screen
    # while on_enter does its work; the very next frame fully overwrites it.
    # If the user mashes HOME during the slide, abort the launch entirely and
    # route them back to the apps drawer instead of waiting for on_enter.
    if getattr(app, "SHOW_LOADING", False):
        label  = getattr(app, "name",   app.__class__.__name__)
        author = getattr(app, "author", None)
        if _show_loading(os_obj, label, author):
            os_obj._launch_request = "__appmenu__"
            return

    # Power manager — singleton on the OS object; idle timer drives deep sleep.
    pm = getattr(os_obj, "_power", None)
    if pm is None:
        try:
            from oreoOS.power import PowerManager
            pm = PowerManager(os_obj)
            os_obj._power = pm
        except Exception:
            pm = None

    # Notification panel singleton — global C-button hotkey, OS-level
    # overlay. Same instance survives app switches so notifications you
    # push from inside an app are visible the moment the user opens it.
    from oreoOS import notif_panel as _np_mod
    panel = _np_mod.get(os_obj)

    # Pair-confirm overlay — sits above the notif panel and the app.
    # While active it eats all input. Drawn after the panel so a fresh
    # SMP prompt is never visually clobbered by a passing notification.
    from oreoOS import pair_prompt as _pp_mod
    pair_pp = _pp_mod.get(os_obj)

    # Consecutive-frame error counter. A single bad frame (transient
    # I2C glitch, momentary divide-by-zero) shouldn't kill the whole
    # OS — we count, log, and only escalate to a crash screen if the
    # error is sticky. Reset on every successful frame.
    frame_errs = 0
    FRAME_ERR_LIMIT = 8

    # Long-press auto-repeat for navigation buttons. Held UP/DOWN/LEFT/
    # RIGHT will fire on_button_press repeatedly at REPEAT_MS cadence
    # after HOLD_MS of continuous hold. Action buttons (A/B/C/HOME) are
    # NOT included — those are commit-style and one fire per press is
    # the right semantic. Apps inherit this behaviour for free: any
    # scrollable list already handles UP/DOWN, no per-app changes.
    HOLD_MS   = 350
    REPEAT_MS = 80
    AUTOREPEAT_BUTTONS = (api.BTN_UP, api.BTN_DOWN, api.BTN_LEFT, api.BTN_RIGHT)
    next_repeat_ms = {b: 0 for b in AUTOREPEAT_BUTTONS}

    app.on_enter(os_obj)
    last = time.ticks_ms()
    try:
        while not os_obj._quit_requested:
            now = time.ticks_ms()
            dt  = time.ticks_diff(now, last) / 1000.0
            last = now

            os_obj.buttons.update()

            # Wake-button swallow. PowerManager sets this when light sleep
            # exits — without it, the press that woke us would also fire
            # as a fresh just_pressed against the pre-sleep frame and the
            # current app would handle it (e.g. HOME → go-home).
            if getattr(os_obj, "_just_woke", False):
                os_obj._just_woke = False
            else:
                for b in api.BUTTONS:
                    if os_obj.buttons.just_pressed(b):
                        if pm: pm.note_event()

                        # Pair-confirm prompt has top priority — when an
                        # SMP numeric comparison is in flight, NOTHING
                        # else gets the button. Eats every key including
                        # C and HOME so the user can't accidentally
                        # accept a stranger's pair attempt by hitting C.
                        if pair_pp.is_active():
                            pair_pp.handle_button(b)
                            continue

                        # Global C hotkey → toggle the notification panel
                        # before anything else gets a look. Works from any
                        # app, including ones that would otherwise consume C.
                        if b == api.BTN_C:
                            panel.toggle()
                            continue

                        # Panel-open input is routed to the panel and the
                        # underlying app sees nothing.
                        if panel.is_active():
                            panel.handle_button(b)
                            continue

                        if b == api.BTN_HOME:
                            handled = False
                            hook = getattr(app, "on_home_press", None)
                            if hook is not None:
                                try:
                                    handled = bool(hook())
                                except Exception:
                                    handled = False
                            if not handled:
                                # Default: HOME → apps drawer (not the clock screen).
                                # Skip the redirect when we ARE in a drawer/home — quit
                                # then so boot()'s outer loop reaches the home screen.
                                app_name = getattr(app, "name", "")
                                if app_name in ("Apps", "home"):
                                    os_obj.quit()
                                else:
                                    os_obj.launch("__appmenu__")
                        else:
                            app.on_button_press(b)
                    if os_obj.buttons.just_released(b):
                        if not panel.is_active():
                            app.on_button_release(b)

                # ── auto-repeat synthesis for held nav buttons ────────
                # After the initial just_pressed dispatch above, a held
                # UP/DOWN/LEFT/RIGHT keeps firing on_button_press every
                # REPEAT_MS so the user can drag-scroll a list without
                # tapping repeatedly. Routed identically to the initial
                # press so the panel-open / app dispatch / HOME-redirect
                # paths all stay consistent.
                tick_ms = time.ticks_ms()
                for b in AUTOREPEAT_BUTTONS:
                    held = os_obj.buttons.pressed_for_ms(b)
                    if held <= HOLD_MS:
                        next_repeat_ms[b] = 0
                        continue
                    if next_repeat_ms[b] == 0:
                        # First repeat fires HOLD_MS after press.
                        next_repeat_ms[b] = tick_ms + REPEAT_MS
                        fire = True
                    elif time.ticks_diff(tick_ms, next_repeat_ms[b]) >= 0:
                        next_repeat_ms[b] = tick_ms + REPEAT_MS
                        fire = True
                    else:
                        fire = False
                    if not fire:
                        continue
                    if pm: pm.note_event()
                    if b == api.BTN_C:
                        # Defensive — BTN_C isn't in AUTOREPEAT_BUTTONS,
                        # but keep the guard so a future edit can't make
                        # the panel re-toggle on every repeat tick.
                        continue
                    if panel.is_active():
                        panel.handle_button(b)
                    else:
                        app.on_button_press(b)

            # Tick the panel BEFORE the app draws so we can detect the
            # exact frame the close animation finishes and force the app
            # to redraw the area the panel just vacated. Without this the
            # last frame of the panel lingers as visible artifacts because
            # the app's _dirty flag is False and panel.draw bails on _t==0.
            panel_was_active = panel.is_active()
            panel.tick(dt)
            if panel_was_active and not panel.is_active():
                try:
                    app._dirty = True
                except Exception:
                    pass

            # Refresh the pair-confirm overlay's view of the SMP state
            # every frame. Cheap — just one module-level dict peek.
            pp_was_active = pair_pp.is_active()
            try:
                pair_pp.tick()
            except Exception:
                pass
            if pp_was_active and not pair_pp.is_active():
                # Prompt dismissed — force the underlying app to redraw
                # because the overlay painted over its frame.
                try:
                    app._dirty = True
                except Exception:
                    pass

            try:
                app.update(dt)
                app.draw(os_obj.display)
                panel.draw(os_obj.display)
                # Pair prompt is the topmost layer — drawn last so the
                # 6-digit code can never be obscured by a panel slide-in.
                if pair_pp.is_active():
                    try:
                        pair_pp.draw(os_obj.display)
                    except Exception:
                        pass
                present_hook = getattr(app, "after_present", None)
                if present_hook is None:
                    os_obj.display.present()
                else:
                    present_start_us = time.ticks_us()
                    os_obj.display.present()
                    present_hook(time.ticks_diff(
                        time.ticks_us(), present_start_us))
                frame_errs = 0
            except Exception as e:
                # Per-frame exception swallow + counter. Logging via
                # print keeps a breadcrumb on the USB serial console for
                # post-mortem; we don't draw anything because the
                # framebuf state mid-failure is unknown. After
                # FRAME_ERR_LIMIT consecutive bad frames we give up and
                # let the outer handler crash-screen this app.
                try:
                    print("frame error in", getattr(app, "name", "?"), ":", e)
                except Exception:
                    pass
                frame_errs += 1
                if frame_errs >= FRAME_ERR_LIMIT:
                    raise

            # A realtime app (currently Gallery RV565 playback) retains the
            # normal input path but defers unbounded network/filesystem work.
            # It also gets a 1 ms scheduler floor while waiting for its next
            # frame; the normal 30 ms floor would quantise a 24 FPS timeline
            # into visibly uneven 30/60 ms intervals.
            try:
                realtime = bool(app.realtime_mode())
            except Exception:
                realtime = False

            # Idle check AFTER the frame so the user sees the result of their
            # last input before the chip dozes off. PowerManager calls
            # machine.deepsleep() internally when the threshold is hit — that
            # call never returns; next reset starts main.py fresh.
            if pm and not realtime:
                pm.tick(app)

            # Background OTA probe — cheap, rate-limited internally to one
            # call every 6 hours, and only fires when WiFi is up. The call
            # itself is bounded by T_GH_API so a slow GitHub can never
            # stall the frame loop.
            if not realtime:
                try:
                    from oreoOS import ota as _ota
                    _ota.background_check(os_obj)
                except Exception:
                    pass

            # Gestures are NOT polled in the OS run loop. The IMU is
            # opt-in per app: an app that wants tilt / tap / shake
            # imports oreoOS.gestures itself and ticks the engine on
            # its own update(). Polling here previously cost ~50-100 ms
            # per frame on a breadboard without the IMU wired because
            # i2c.scan ran every iteration — now apps without an IMU
            # need pay nothing.

            # BLE adv watchdog. Internal rate-limit means this is a
            # ticks_diff comparison on the fast path; only every 30 s
            # does it actually re-issue gap_advertise. Fixes the
            # "phone says paired-but-not-connected and won't reconnect"
            # case where adv silently stopped between sessions.
            if not realtime:
                try:
                    from oreoWare import bt as _bt
                    _bt.watchdog_tick()
                except Exception:
                    pass

            # LAN HTTP upload server tick. Non-blocking accept on the
            # listening socket — costs one syscall per frame on the
            # idle path. Handles one request synchronously when a
            # phone POSTs, which briefly stalls the UI for the
            # duration of the upload (fine for sub-second photo
            # transfers; we'll move to a background worker later if
            # uploads ever grow above a few hundred KB).
            if not realtime:
                try:
                    from oreoOS import http_server as _hs
                    _hs.tick()
                except Exception:
                    pass

            elapsed = time.ticks_diff(time.ticks_ms(), now)
            frame_floor = 1 if realtime else FRAME_MIN_MS
            if elapsed < frame_floor:
                time.sleep_ms(frame_floor - elapsed)
    finally:
        app.on_exit()
        gc.collect()


# ── crash screen ──────────────────────────────────────────────────────────────

def show_crash(os_obj, name, err):
    """Centred, themed crash screen — Pixelify Sans title + app name,
    framebuf body text. Press any button to dismiss."""
    d  = os_obj.display
    SW = api.SCREEN_W
    SH = api.SCREEN_H

    BG     = api.rgb( 40,   8,  16)
    HDR    = api.rgb(255,  93, 104)
    ACCENT = api.rgb(255, 230,  80)
    TEXT   = api.rgb(245, 230, 220)
    DIM    = api.rgb(180, 150, 150)

    d.clear(BG)

    # Header bar
    HDR_H = 30
    d.rect(0, 0, SW, HDR_H,    HDR,    fill=True)
    d.rect(0, HDR_H, SW, 1,    ACCENT, fill=True)

    # Pixelify display font for the app name; fall back to framebuf if missing.
    try:
        from oreoOS import pixelfont
        title_font = pixelfont.load("pixelify_24")
    except (ImportError, AttributeError):
        title_font = None

    # ── title "APP CRASHED" centred inside the header (small) ────────────
    short_title = "APP CRASHED"
    tw = len(short_title) * 16
    d.text(short_title, (SW - tw) // 2, (HDR_H - 16) // 2, api.WHITE, scale=2)

    # ── big Pixelify app name below the header ──────────────────────────
    nm = (name or "?")[:14]
    name_y = HDR_H + 14
    if title_font:
        nw = title_font.measure(nm)
        title_font.text(d, nm, (SW - nw) // 2, name_y, ACCENT)
        name_h = title_font.h
    else:
        nw = len(nm) * 16
        d.text(nm, (SW - nw) // 2, name_y, ACCENT, scale=2)
        name_h = 16

    # ── error message panel ─────────────────────────────────────────────
    panel_y = name_y + name_h + 12
    panel_h = SH - panel_y - 26          # leave room for footer hint
    d.rect(8, panel_y - 4, SW - 16, panel_h + 8, api.rgb(56, 16, 24), fill=True)
    d.rect(8, panel_y - 4, SW - 16, 1, HDR, fill=True)

    msg       = str(err)
    max_chars = (SW - 32) // 8
    lines     = _wrap_text(msg, max_chars)
    max_lns   = panel_h // 12
    lines     = lines[:max_lns]
    block_h   = len(lines) * 12
    text_y    = panel_y + max(0, (panel_h - block_h) // 2)
    for i, line in enumerate(lines):
        lw = len(line) * 8
        d.text(line, (SW - lw) // 2, text_y + i * 12, TEXT)

    # ── centred footer hint ──────────────────────────────────────────────
    hint = "press any button to continue"
    hw   = len(hint) * 8
    d.text(hint, (SW - hw) // 2, SH - 18, DIM)

    d.present()

    # Wait for any keypress
    while True:
        os_obj.buttons.update()
        if any(os_obj.buttons.just_pressed(b) for b in api.BUTTONS):
            return
        time.sleep_ms(20)


def _wrap_text(text, max_chars):
    """Greedy word-wrap to ≤ max_chars per line; hard-breaks oversized words."""
    if not text:
        return [""]
    out = []
    cur = ""
    for w in text.split():
        if not cur:
            if len(w) > max_chars:
                while len(w) > max_chars:
                    out.append(w[:max_chars])
                    w = w[max_chars:]
                cur = w
            else:
                cur = w
        else:
            candidate = cur + " " + w
            if len(candidate) <= max_chars:
                cur = candidate
            else:
                out.append(cur)
                cur = w
    if cur:
        out.append(cur)
    return out


# ── boot entry point ─────────────────────────────────────────────────────────

def _maybe_apply_ota(os_obj=None):
    """Run any staged OTA update BEFORE we import the home screen.

    Drives a progress splash while files are copied so the user knows
    the badge hasn't locked up. apply_pending() is a no-op when
    /_ota/manifest.json is absent (the common case), in which case the
    splash is never shown.
    """
    try:
        from oreoOS import ota
        if not ota.is_pending():
            return None
        # Peek at the staged manifest to learn the target version + file
        # count for the splash. Cheap — just opens one JSON file.
        try:
            import json as _j
            with open(ota.STAGE_DIR + "/" + ota.MANIFEST_NAME) as f:
                m = _j.load(f)
            target = m.get("version", "")
            total  = len(m.get("files", ()))
        except Exception:
            target, total = "", 1
        if os_obj is not None:
            try:
                from oreoOS.splash import show_updating
                advance = show_updating(os_obj, target, total)
            except Exception:
                advance = None
        else:
            advance = None
        if advance is None:
            return ota.apply_pending()
        # Keep promotion and cleanup inside ota.apply_pending().  Its return
        # value remains false on a copy failure, leaving staging intact for a
        # controlled retry rather than rebooting a partially applied system.
        return ota.apply_pending(on_progress=advance)
    except Exception:
        return None


def _bc(tag):
    """Boot breadcrumb — print to USB serial with monotonic timestamp.

    Used to live-diagnose boot freezes over the USB-CDC REPL (host runs
    `mpremote connect /dev/ttyACM0`). Each phase prints a short tag so
    we can tell whether a freeze is in WiFi, NTP, OTA-stage-copy, etc.
    Cheap enough to leave in for v1 — one print per boot phase, nothing
    in the run-loop hot path.
    """
    try:
        print("[boot %d] %s" % (time.ticks_ms(), tag))
    except Exception:
        pass


def boot():
    _bc("entered boot()")
    from oreoWare.os import OS
    from oreoOS.splash import show_splash
    from oreoOS.home   import Home
    _bc("imports done")

    # Bring the hardware up first so the OTA splash has a display to draw
    # on. The trade-off: if an OTA swaps oreoWare/display.py we'll have
    # already imported the old version — _maybe_apply_ota does a
    # machine.reset() after apply to guarantee the new drivers boot fresh.
    os_obj = OS()
    _bc("OS() constructed")

    # Stamp the boot timestamp on the OS object so OTA can refuse to
    # probe inside the first minute of uptime — without this the very
    # first run-loop frame fires a synchronous GitHub API GET, freezing
    # whichever transition the user triggers (e.g. "press A on home").
    try:
        os_obj._boot_ts_s = int(time.time())
    except Exception:
        os_obj._boot_ts_s = 0

    # Gestures intentionally NOT seeded at the OS layer — the IMU stack
    # is opt-in per app now. The Gestures settings page (`apps/gestures`)
    # imports oreoOS.gestures itself when the user opens it.

    _bc("checking pending OTA")
    applied = _maybe_apply_ota(os_obj)
    _bc("OTA check done (applied=%s)" % bool(applied))
    if applied:
        # Persist the version for the post-reboot "Updated to vX.Y.Z" toast.
        try:
            os_obj.settings_set("ota_just_applied", applied)
            os_obj.settings_set("ota_status",       "applied")
            os_obj.settings_set("ota_pending_peek_ok", False)
        except Exception:
            pass
        # Clean reboot so every module imports the new code on the next
        # boot. apply_pending already deleted /_ota so the boot path
        # won't re-apply this round.
        try:
            import machine
            machine.reset()
        except Exception:
            pass
    # Splash must NEVER kill the boot — if the big bg asset OOMs or the
    # mascot module is missing we just want to fall through to the home
    # screen. Whatever's on the LCD stays visible (initial black frame from
    # Display.__init__, or partial splash) until Home draws its first frame.
    _bc("show_splash")
    try:
        show_splash(os_obj)
    except Exception as e:
        _bc("show_splash FAILED: %s" % e)
    _bc("splash done")

    # Start WiFi and BT after splash. Two safety gates so a weak supply
    # (e.g. powered from an FTDI's onboard 3V3 LDO @ ~100 mA) doesn't brown
    # the chip out when the radio first powers up:
    #   1. honour secrets.WIFI_AUTO_CONNECT — user can flip to False to
    #      keep WiFi off entirely
    #   2. skip WiFi for one boot after a brownout reset, so the device
    #      can at least reach the home screen
    wifi_ok_to_try = True
    try:
        from secrets import WIFI_AUTO_CONNECT
        if not WIFI_AUTO_CONNECT:
            wifi_ok_to_try = False
    except Exception:
        pass
    try:
        import machine
        # MicroPython exposes BROWNOUT_RESET on most ports; treat unknown
        # constants as "not a brownout" so this stays portable.
        if hasattr(machine, "BROWNOUT_RESET"):
            if machine.reset_cause() == machine.BROWNOUT_RESET:
                wifi_ok_to_try = False
    except Exception:
        pass

    try:
        from oreoWare import wifi, bt
        if wifi_ok_to_try:
            _bc("wifi.connect_from_config begin")
            wifi.connect_from_config()
            _bc("wifi.connect_from_config done")
            # Bring up the LAN file-upload server now that we have an
            # IP. Listener is non-blocking + idempotent; the run-loop
            # tick handles accept(). No-op if WiFi failed.
            try:
                from oreoOS import http_server as _hs
                _hs.start(os_obj)
            except Exception:
                pass
        else:
            _bc("wifi skipped")
        _bc("bt.init_from_config begin")
        bt.init_from_config()
        _bc("bt.init_from_config done")
        if wifi_ok_to_try and wifi.is_connected():
            _bc("ntp sync begin")
            try:
                from oreoOS import timeutil
                timeutil.sync_from_ntp()
            except Exception as e:
                _bc("ntp sync FAILED: %s" % e)
            _bc("ntp sync done")
    except Exception as e:
        _bc("wifi/bt block FAILED: %s" % e)
    _bc("entering main loop")

    while True:
        apps = list_apps()
        home = Home(apps)
        # Reaching the home screen is the "I'm done" signal — clear any
        # launcher resume context so the next drawer open starts fresh
        # rather than restoring the user to where they last were inside
        # a category. HOME-from-app already chains via __appmenu__ and
        # consumes the context; this just guarantees a clean slate when
        # the user actually lands on home.
        try:
            os_obj._launcher_resume = None
        except Exception:
            pass
        # Home is wrapped just like app launches below — a crash in the
        # home screen used to take the whole OS down silently (the LCD
        # froze on whatever was last drawn, no button polling, requiring
        # a hardware reset). Now we paint a crash screen and loop back
        # so the next iteration rebuilds Home from scratch.
        try:
            run_app(os_obj, home)
        except Exception as e:
            show_crash(os_obj, "home", e)
            continue

        # Chain-launch loop. Each app may call os.launch(...) on the
        # way out (e.g. Settings → Gestures, Settings → WiFi). We keep
        # consuming _launch_request until it's empty — otherwise a
        # sub-launched app would get clobbered by Home's run_app re-
        # initialising _launch_request = None on entry, and the user
        # would briefly see Home flash before having to re-navigate.
        while True:
            target = os_obj._launch_request

            # Home's APPS dock sends "__appmenu__" — route it to the
            # first-class apps/launcher/ implementation.
            if target == "__appmenu__":
                target = "launcher"

            if not target:
                break    # nothing queued; outer loop returns to Home

            try:
                app = load_app(target)
                run_app(os_obj, app)
            except Exception as e:
                show_crash(os_obj, target, e)
                break


if __name__ == "__main__":
    boot()
