"""Device boot entrypoint — deployed to /main.py on the badge.

Wraps launcher.boot() in a recovery harness so an uncaught exception
can never wedge the badge into the MicroPython REPL with a frozen LCD
and no button polling. On any escape from boot() we:

  1. Try to paint a minimal crash screen (no app-level deps — just text
     on the framebuffer) so the user sees that we're rebooting.
  2. Wait briefly so the message is readable.
  3. machine.reset() to start fresh.

The retry loop also protects against a transient boot-time fault
(e.g. WiFi init exception that didn't get caught upstream) — after the
reset the next boot tries again from scratch.
"""


def _crash_message(err):
    """Try to surface the error on the LCD. Best-effort — if drawing
    itself fails (display not initialized, OOM, etc.) we silently fall
    through to the reset path so the badge never gets stuck."""
    try:
        from oreoWare.display import Display
        from oreoOS import api
        d = Display()
        d.clear(api.rgb(220, 40, 60))
        d.text("OREO CRASHED",   16, 40,  api.WHITE, scale=2)
        d.text("rebooting...",   16, 70,  api.WHITE, scale=1)
        # Truncate so a long traceback line doesn't blow past 36 chars
        # at scale=1 (≈8 px/glyph on a 320 px-wide screen).
        msg = (str(err) or "(no message)")[:36]
        d.text(msg, 16, 100, api.WHITE, scale=1)
        d.text("if this loops, hold HOME on power",
               16, 200, api.WHITE, scale=1)
        d.present()
    except Exception:
        pass


def _settle_then_reset():
    try:
        import time
        time.sleep_ms(3000)
    except Exception:
        pass
    try:
        import machine
        machine.reset()
    except Exception:
        # Build-host fallback — no machine module. Re-raise to surface
        # the original error in tests.
        raise


def main():
    from oreoOS import launcher
    try:
        launcher.boot()
    except Exception as e:
        try:
            print("FATAL: boot() escaped:", e)
        except Exception:
            pass
        _crash_message(e)
        _settle_then_reset()


main()
