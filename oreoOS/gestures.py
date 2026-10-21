"""Gesture detection for the Oreo Badge.

Reads the MPU6050 accelerometer and emits high-level events:
    TAP         single sharp accel spike
    DOUBLE_TAP  two TAPs within 400ms
    FLIP_UP     lift + tilt-back (reading-a-watch motion)
    HARD_SHAKE  sustained shake for 5s in any orientation

Designed for minimum standby power. Each gesture is independently
toggleable from Settings, and the IMU is fully asleep (~5 µA) when no
gesture is active. When any gesture is on, the IMU runs in cycle mode
with motion interrupt — only spending bus time when the user actually
moves the badge.

Public surface:
    gestures.get(os_obj)       singleton accessor (lazy IMU detect)
    g.tick()                   call from run-loop tail every frame
    g.pop_event()              consume the oldest pending event
    g.apply_settings()         re-read settings + reconfigure IMU
"""

import time

# ── Settings keys ────────────────────────────────────────────────────────
SET_ENABLED         = "gestures_enabled"
SET_TAP             = "gesture_tap"
SET_DOUBLE_TAP      = "gesture_double_tap"
SET_FLIP_UP         = "gesture_flip_up"
SET_HARD_SHAKE      = "gesture_hard_shake"
SET_FLIP_UP_ACTION  = "gesture_flip_up_action"

# Flip-up action codes — stored verbatim in settings, dispatched by launcher.
ACTION_DRAWER  = "drawer"
ACTION_NOTIFS  = "notifs"
ACTION_WIFI    = "wifi"
ACTION_BT      = "bt"
ACTION_CAMERA  = "camera"     # reserved for IR-quest / future capture flow

FLIP_ACTIONS = (ACTION_DRAWER, ACTION_NOTIFS, ACTION_WIFI,
                ACTION_BT, ACTION_CAMERA)

# ── detection tuning (per-axis in g, durations in ms) ────────────────────
TAP_PEAK_G          = 1.6        # |a| crossing this counts as a spike
TAP_RETURN_G        = 1.2        # back-below to arm the next tap
TAP_REFRACTORY_MS   = 200        # min gap between two distinct TAPs
DOUBLE_TAP_MAX_MS   = 400        # two TAPs must land within this window

FLIP_AZ_REST_MIN    = 0.80       # gravity-Z floor in resting-flat orientation
FLIP_AZ_LIFTED_MAX  = 0.60       # gravity-Z ceiling when lifted off the table
FLIP_TILT_DELTA     = 0.40       # |Δay| from rest required for the tilt-back leg
FLIP_SUSTAIN_MS     = 180        # tilted state must persist this long
FLIP_REFRACTORY_MS  = 800        # don't re-fire too quickly

SHAKE_PEAK_G        = 1.8        # threshold for "this is a shake-event peak"
SHAKE_MIN_REVS_PS   = 8          # required direction-reversals per second
SHAKE_HOLD_MS       = 5000       # must sustain that rate for this long
SHAKE_GAP_MS        = 350        # if no peak this long, reset the streak

POLL_DT_MS          = 20         # 50 Hz when actively sampling


def get(os_obj):
    """Singleton accessor. Lazily detects the IMU. Returns None if no
    chip on the bus — caller treats absence as "gestures disabled".

    CRITICAL: a negative detect (no IMU on bus) MUST be cached. The OS
    run loop calls this every frame; without the negative cache,
    `_imu_mod.detect()` re-runs a full `i2c.scan()` (~50-100 ms blocking
    on 100 kHz) every frame, pinning the CPU and starving the UI/
    network. On a breadboard build without the MPU6050 wired, that's
    the whole boot suddenly feeling like molasses.
    """
    g = getattr(os_obj, "_gestures", None)
    if g is not None:
        return g
    # _imu can be:
    #   missing attr       → never tried
    #   None               → tried, no IMU (negative cache; don't retry)
    #   <MPU6050 instance> → tried, present
    if hasattr(os_obj, "_imu"):
        imu = os_obj._imu
    else:
        try:
            from oreoWare import imu as _imu_mod
            imu = _imu_mod.detect()
        except Exception:
            imu = None
        # Cache the result either way so we don't re-probe the bus.
        try:
            os_obj._imu = imu
        except Exception:
            pass
    if imu is None:
        return None
    g = Gestures(os_obj, imu)
    try:
        os_obj._gestures = g
    except Exception:
        pass
    return g


class Gestures:
    """State machine fed one accel sample per tick.

    Owns the IMU's wake/sleep cycle: arms motion-int + cycle-mode when
    any gesture is on, drops the chip to sleep when all are off.
    """

    def __init__(self, os_obj, imu):
        self._os         = os_obj
        self._imu        = imu
        self._last_poll  = 0
        self._events     = []
        self._cfg        = self._read_settings()
        self._cfg_ts_ms  = time.ticks_ms()
        # Per-detector state ────────────────────────────────────────────
        self._tap_armed       = True            # below TAP_RETURN_G
        self._last_tap_ms     = 0
        self._pending_tap_ms  = 0               # waiting for a 2nd tap
        self._flip_phase      = "rest"          # rest | lifted | tilted
        self._flip_tilted_at  = 0
        self._flip_last_fire  = 0
        self._flip_rest_ay    = 0.0             # captured at "rest" entry
        self._shake_peaks     = []              # ticks_ms of recent peaks
        self._shake_streak_at = 0               # when the streak first met threshold
        self._shake_last_dir  = 0
        # Apply settings now so the IMU enters the right power state.
        self._apply_imu_power()

    # ── settings ────────────────────────────────────────────────────────
    def _read_settings(self):
        get_ = self._os.settings_get
        return {
            "enabled":      bool(get_(SET_ENABLED, False)),
            "tap":          bool(get_(SET_TAP, False)),
            "double_tap":   bool(get_(SET_DOUBLE_TAP, False)),
            "flip_up":      bool(get_(SET_FLIP_UP, False)),
            "hard_shake":   bool(get_(SET_HARD_SHAKE, False)),
            "flip_action":  get_(SET_FLIP_UP_ACTION, ACTION_DRAWER),
        }

    def apply_settings(self):
        """Re-read settings + reconfigure the IMU. Settings page calls
        this after the user flips a toggle so power state updates without
        waiting for the 2-second auto-refresh."""
        self._cfg      = self._read_settings()
        self._cfg_ts_ms = time.ticks_ms()
        self._apply_imu_power()

    def _any_gesture_on(self):
        c = self._cfg
        if not c["enabled"]:
            return False
        return c["tap"] or c["double_tap"] or c["flip_up"] or c["hard_shake"]

    def _apply_imu_power(self):
        """Wake the IMU into cycle mode when any gesture wants samples;
        otherwise drop it to sleep so the bus + chip burn nothing."""
        try:
            if self._any_gesture_on():
                self._imu.wake()
                # 5 Hz cycle mode keeps the gyro off entirely and only
                # samples the accel every 200 ms when idle — motion-int
                # bumps to full-rate on real movement. If the IMU
                # driver doesn't expose cycle mode (older build),
                # wake() alone still works at higher idle current.
                fn = getattr(self._imu, "enable_cycle_mode", None)
                if fn:
                    fn(rate_hz=5)
                # Arm motion-INT so the chip can flag the MCU on a
                # jerk; firmware reads it via pins.IMU_INT later.
                try:
                    self._imu.enable_motion_int(thresh_mg=128, duration_ms=1)
                except Exception:
                    pass
            else:
                self._imu.sleep()
        except Exception:
            pass

    # ── run-loop entry point ────────────────────────────────────────────
    def tick(self):
        """Read one accel sample and update every detector. Cheap when
        gestures are disabled (returns before any I/O)."""
        if not self._any_gesture_on():
            return
        now = time.ticks_ms()
        # Refresh settings every 2 s so Settings-page edits propagate
        # without an explicit apply_settings() callback.
        if time.ticks_diff(now, self._cfg_ts_ms) > 2000:
            self._cfg     = self._read_settings()
            self._cfg_ts_ms = now
            self._apply_imu_power()
        # 50 Hz poll cap — we don't need to read faster than the
        # underlying IMU sample rate.
        if time.ticks_diff(now, self._last_poll) < POLL_DT_MS:
            return
        self._last_poll = now
        try:
            ax, ay, az = self._imu.read_accel_g()
        except Exception:
            return
        mag = (ax * ax + ay * ay + az * az) ** 0.5
        if self._cfg["tap"] or self._cfg["double_tap"]:
            self._detect_tap(mag, now)
        if self._cfg["flip_up"]:
            self._detect_flip_up(ax, ay, az, now)
        if self._cfg["hard_shake"]:
            self._detect_hard_shake(ax, ay, az, mag, now)

    def pop_event(self):
        return self._events.pop(0) if self._events else None

    def _emit(self, kind, **payload):
        payload["kind"] = kind
        payload["at_ms"] = time.ticks_ms()
        self._events.append(payload)

    # ── detectors ───────────────────────────────────────────────────────
    def _detect_tap(self, mag, now):
        """A TAP is one spike above TAP_PEAK_G that returns below
        TAP_RETURN_G — implemented as an armed/disarmed pair so a single
        long bump can't double-fire."""
        # Refractory: ignore activity right after a confirmed tap.
        if time.ticks_diff(now, self._last_tap_ms) < TAP_REFRACTORY_MS:
            return
        if self._tap_armed:
            if mag >= TAP_PEAK_G:
                self._tap_armed = False
                # Defer the EMIT until we either confirm DOUBLE_TAP or
                # the window expires — but only if double_tap is on.
                if self._cfg["double_tap"]:
                    pending = self._pending_tap_ms
                    self._pending_tap_ms = 0
                    if pending and (now - pending) <= DOUBLE_TAP_MAX_MS:
                        self._emit("double_tap")
                        self._last_tap_ms = now
                    else:
                        self._pending_tap_ms = now
                        # If single TAP is also enabled, we wait DOUBLE_TAP_MAX_MS
                        # before firing it so the same event isn't both.
                        if not self._cfg["tap"]:
                            self._last_tap_ms = now
                elif self._cfg["tap"]:
                    self._emit("tap")
                    self._last_tap_ms = now
        else:
            if mag <= TAP_RETURN_G:
                self._tap_armed = True
        # Single-tap deferred fire: if a pending tap exists and the
        # window closed without a second tap, fire single tap now.
        if (self._cfg["tap"] and self._pending_tap_ms
                and self._cfg["double_tap"]
                and time.ticks_diff(now, self._pending_tap_ms) > DOUBLE_TAP_MAX_MS):
            self._emit("tap")
            self._last_tap_ms = self._pending_tap_ms
            self._pending_tap_ms = 0

    def _detect_flip_up(self, ax, ay, az, now):
        """3-phase state machine: REST (badge flat) → LIFTED (az drops
        as the user picks it up) → TILTED (top edge swings toward face,
        |Δay| > FLIP_TILT_DELTA from the resting ay). Held for
        FLIP_SUSTAIN_MS in TILTED to commit."""
        if time.ticks_diff(now, self._flip_last_fire) < FLIP_REFRACTORY_MS:
            return
        if self._flip_phase == "rest":
            if az >= FLIP_AZ_REST_MIN:
                self._flip_rest_ay = ay     # capture orientation baseline
            if az <= FLIP_AZ_LIFTED_MAX:
                self._flip_phase = "lifted"
        elif self._flip_phase == "lifted":
            d_ay = ay - self._flip_rest_ay
            if abs(d_ay) >= FLIP_TILT_DELTA:
                self._flip_phase    = "tilted"
                self._flip_tilted_at = now
            elif az >= FLIP_AZ_REST_MIN:
                self._flip_phase = "rest"   # placed back down without tilting
        elif self._flip_phase == "tilted":
            if time.ticks_diff(now, self._flip_tilted_at) >= FLIP_SUSTAIN_MS:
                self._emit("flip_up", action=self._cfg["flip_action"])
                self._flip_phase    = "rest"
                self._flip_last_fire = now

    def _detect_hard_shake(self, ax, ay, az, mag, now):
        """Count direction-reversals across all 3 axes. A reversal is a
        sign-flip on the dominant axis between consecutive peaks above
        SHAKE_PEAK_G. If the rate stays >= SHAKE_MIN_REVS_PS for
        SHAKE_HOLD_MS, fire HARD_SHAKE."""
        if mag < SHAKE_PEAK_G:
            # Idle gap — if we go too long without a peak, the streak
            # dies and we restart from scratch.
            if (self._shake_peaks
                    and time.ticks_diff(now, self._shake_peaks[-1])
                        > SHAKE_GAP_MS):
                self._shake_peaks     = []
                self._shake_streak_at = 0
                self._shake_last_dir  = 0
            return
        # Pick the strongest-magnitude axis for direction tracking.
        axes = (("x", ax), ("y", ay), ("z", az - 1.0))   # subtract gravity
        axes_sorted = sorted(axes, key=lambda kv: -abs(kv[1]))
        _name, val = axes_sorted[0]
        cur_dir = 1 if val > 0 else -1
        if cur_dir == self._shake_last_dir:
            return   # same direction = same peak; need a reversal
        self._shake_last_dir = cur_dir
        self._shake_peaks.append(now)
        # Window the peaks list to the last 1 second so the rate calc
        # is bounded.
        cutoff = time.ticks_add(now, -1000)
        while self._shake_peaks and time.ticks_diff(self._shake_peaks[0],
                                                    cutoff) < 0:
            self._shake_peaks.pop(0)
        if len(self._shake_peaks) >= SHAKE_MIN_REVS_PS:
            if self._shake_streak_at == 0:
                self._shake_streak_at = now
            elif time.ticks_diff(now, self._shake_streak_at) >= SHAKE_HOLD_MS:
                self._emit("hard_shake")
                self._shake_peaks     = []
                self._shake_streak_at = 0
                self._shake_last_dir  = 0
        else:
            self._shake_streak_at = 0


def push_default_settings(os_obj):
    """Seed Settings defaults so the rows exist before the user opens
    Settings the first time. All gestures default OFF — opt-in keeps
    standby power at the IMU's sleep current (~5 µA)."""
    set_ = os_obj.settings_set
    get_ = os_obj.settings_get
    pairs = (
        (SET_ENABLED,        False),
        (SET_TAP,            False),
        (SET_DOUBLE_TAP,     False),
        (SET_FLIP_UP,        False),
        (SET_HARD_SHAKE,     False),
        (SET_FLIP_UP_ACTION, ACTION_DRAWER),
    )
    for k, default in pairs:
        if get_(k, None) is None:
            try:
                set_(k, default)
            except Exception:
                pass
