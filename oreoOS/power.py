import time

try:
    import machine
except ImportError:
    machine = None

from oreoWare import pins


DEFAULT_IDLE_SECONDS = 120    # 2 min default — short enough to save battery
                              # in a pocket, long enough that idle reading
                              # the home screen doesn't get cut short.
                              # Slider in Settings goes 0..10 min; 0 = off.
SETTINGS = {
    "idle_enable":  True,
    "idle_seconds": DEFAULT_IDLE_SECONDS,
}


def load_settings(os_obj):
    """Pull persisted settings off the OS object if any were stored."""
    for k, default in SETTINGS.items():
        v = os_obj.settings_get(k, None)
        if v is not None:
            SETTINGS[k] = v


def save_settings(os_obj):
    for k, v in SETTINGS.items():
        os_obj.settings_set(k, v)


class PowerManager:
    """Polled from the main app loop, calls deepsleep() when idle elapses."""

    def __init__(self, os_obj):
        self._os         = os_obj
        self._last_event = time.ticks_ms()
        load_settings(os_obj)

    # ── public hooks the run loop calls ──────────────────────────────────
    def note_event(self):
        """Reset the idle clock. Called on any button press / motion."""
        self._last_event = time.ticks_ms()

    def tick(self, app):
        """Once per frame. Triggers light sleep when the threshold elapses.

        Auto-sleep is disabled when EITHER the toggle is off OR the
        Sleep-After slider sits at 0 minutes. The slider's 0 acts as a
        quick "never sleep" without having to flip the toggle row.
        """
        if not SETTINGS["idle_enable"]:
            return
        idle_seconds = SETTINGS.get("idle_seconds", 0)
        if idle_seconds <= 0:
            return
        if getattr(app, "BLOCK_IDLE", False):
            self._last_event = time.ticks_ms()
            return
        if time.ticks_diff(time.ticks_ms(), self._last_event) >= idle_seconds * 1000:
            self.enter_light_sleep()
            # IMPORTANT: light sleep RESUMES here on wake — we reset the idle
            # timer so the user has a full window to interact again.
            self._last_event = time.ticks_ms()

    # ── transitions ──────────────────────────────────────────────────────
    def enter_light_sleep(self):
        """Pause CPU, blank LCD, wait for any button press to wake.

        Light sleep keeps RAM, framebuffer state, and peripherals alive —
        the OS resumes EXACTLY at the line below, no boot, no app reset.
        This is the right model for "screen off but keep running" since
        the user's expectation is to return to the same screen on wake.

        Wake source: every matrix button (active-low → reads 0 on press).
        """
        if machine is None:
            return

        # Remember the user's brightness so we can restore it on wake.
        prev_brightness = 100
        try:
            prev_brightness = getattr(self._os, "_last_brightness", 100)
        except Exception:
            pass
        try:
            self._os.display.set_brightness(0)
        except Exception:
            pass

        # Soft-polled sleep. machine.lightsleep + Pin.irq(wake=) was
        # unreliable on this MicroPython build, so we just blank the LCD
        # and poll at 33 Hz. Pin objects are cached once outside the loop
        # so we don't churn the pin controller every tick.
        #
        # Wake condition: a button that was UNPRESSED at sleep entry now
        # reads PRESSED. Snapshot of initial state prevents a stuck press
        # from insta-waking us.
        btn_ids = (pins.BTN_HOME, pins.BTN_A, pins.BTN_B, pins.BTN_C,
                   pins.BTN_UP, pins.BTN_DOWN, pins.BTN_LEFT, pins.BTN_RIGHT)
        btn_pins = {}
        for b in btn_ids:
            try:
                btn_pins[b] = machine.Pin(b, machine.Pin.IN,
                                           machine.Pin.PULL_UP)
            except Exception:
                pass

        initial_btn = {b: pin.value() for b, pin in btn_pins.items()}

        # Safety ceiling: 24 h so a wedged pin can't strand us forever.
        deadline = time.ticks_add(time.ticks_ms(), 24 * 60 * 60 * 1000)

        while True:
            woke = False
            for b, pin in btn_pins.items():
                if pin.value() == 0 and initial_btn[b] == 1:
                    woke = True
                    break
            if woke:
                break

            if time.ticks_diff(deadline, time.ticks_ms()) <= 0:
                break
            time.sleep_ms(30)

        # Wait for the wake-button to be RELEASED before we return. Without
        # this the next frame's `buttons.update()` sees the button still
        # held, fires `just_pressed` against the pre-sleep frame's released
        # state, and the app receives a spurious tap of whatever woke us.
        # 200 ms safety ceiling so a stuck button doesn't strand us here.
        release_deadline = time.ticks_add(time.ticks_ms(), 200)
        while time.ticks_diff(release_deadline, time.ticks_ms()) > 0:
            any_held = False
            for pin in btn_pins.values():
                if pin.value() == 0:
                    any_held = True
                    break
            if not any_held:
                break
            time.sleep_ms(10)
        # Flag the run loop so it skips one input-dispatch frame and
        # re-syncs the buttons module's edge detector against the now-
        # released state.
        try:
            self._os._just_woke = True
        except Exception:
            pass

        # Restore the screen on wake. The next frame the run-loop draws
        # will repaint everything because each app's _dirty flag is still
        # whatever it was before — but we force a redraw just in case.
        try:
            self._os.display.set_brightness(prev_brightness)
        except Exception:
            pass

    def enter_deep_sleep(self):
        """Save state, configure wake sources, and call machine.deepsleep().

        Returns nothing - the chip resets out of this function. Next boot
        starts main.py from scratch; reset_cause() == DEEPSLEEP_RESET lets
        boot() decide to skip the splash for a faster wake.
        """
        if machine is None:
            return
        try:
            self._os.display.set_brightness(0)
        except Exception:
            pass
        # Wake mask: every matrix button. Active-low → wake on any going LOW.
        wake_pins = [
            pins.BTN_HOME, pins.BTN_A, pins.BTN_B, pins.BTN_C,
            pins.BTN_UP, pins.BTN_DOWN, pins.BTN_LEFT, pins.BTN_RIGHT,
        ]
        try:
            import esp32
            esp32.wake_on_ext1(pins=[machine.Pin(p) for p in wake_pins],
                               level=esp32.WAKEUP_ALL_LOW)
        except Exception:
            pass
        machine.deepsleep()


# ── reset-cause helper used by launcher.boot() to fast-path wake-from-sleep ──

def woke_from_deep_sleep():
    """True iff the previous reset was deep-sleep wake."""
    if machine is None:
        return False
    try:
        return machine.reset_cause() == machine.DEEPSLEEP_RESET
    except Exception:
        return False
