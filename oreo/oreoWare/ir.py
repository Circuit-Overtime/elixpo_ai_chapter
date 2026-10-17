"""IR driver — NEC TX + raw-edge RX.

Hardware (see oreoWare/pins.py):
    IR_TX = GPIO 2   — drives a 2N2222 base via 470 Ω. Collector → IR LED
                       cathode → IR LED anode → 10 Ω → 3V3.
    IR_RX = GPIO 18  — TSOP38238 OUT (open-collector active-LOW, with
                       internal 38 kHz demodulator). Idle HIGH; the AGC
                       inside the TSOP pulls LOW for the duration of each
                       carrier burst, so the line we read is the *envelope*
                       of the modulated signal.

TX uses esp32.RMT with carrier modulation — the RMT peripheral generates
the precise 38/40/56 kHz square wave on the pin while the pulse-train we
write decides when to "key" it on or off. Cost is sub-ms per frame.

RX prefers the built-in ``_oreo_ir`` module, which uses ESP-IDF RMT RX to
capture the demodulated envelope at 1 us resolution without depending on
Python or display timing. Pin.irq() remains as an old-firmware fallback.
Anything that doesn't decode as NEC still surfaces as a raw recording.

API:
    ir.transmit_nec(code32, carrier_hz=38000)
    ir.transmit_raw(durations_us, carrier_hz=38000)
    ir.start_receive(on_packet, mode="focus"|"beacon")
    ir.stop_receive()
    ir.poll()    — call once per app frame; runs the decoder

on_packet(code_or_None, info_dict)
    code is the 32-bit NEC value, or None when a raw/unknown packet hit
    info_dict includes "pulses", "protocol", "pulse_count", "duration_us",
    and nominal carrier metadata.
"""

import time
from array import array
from machine import Pin, disable_irq, enable_irq
from oreoWare import pins

try:
    import micropython
    micropython.alloc_emergency_exception_buf(128)
except Exception:
    pass

try:
    from esp32 import RMT
    _HAVE_RMT = True
except ImportError:
    _HAVE_RMT = False

try:
    import _oreo_ir as _native_rx
    _HAVE_NATIVE_RX = True
except ImportError:
    _native_rx = None
    _HAVE_NATIVE_RX = False


# ── NEC timing (microseconds) ────────────────────────────────────────────────
NEC_LEAD_HIGH = 9000
NEC_LEAD_LOW  = 4500
NEC_BIT_HIGH  = 562
NEC_BIT_LOW_0 = 562
NEC_BIT_LOW_1 = 1687
NEC_TAIL_HIGH = 562

# RMT clock: 80 MHz / clock_div. clock_div=80 → 1 µs per tick (easy maths
# and plenty of resolution at the 38 kHz / 26 µs carrier period).
_RMT_CLOCK_DIV = 80


# ── TX ──────────────────────────────────────────────────────────────────────

_rmt          = None
_rmt_carrier  = 0
_last_error   = None


def _get_rmt(carrier_hz):
    """Return a configured RMT TX object, reusing it when the carrier hasn't
    changed (re-creating costs ~3 ms)."""
    global _rmt, _rmt_carrier, _last_error
    if not _HAVE_RMT:
        raise RuntimeError("esp32.RMT not available on this firmware")
    if _rmt is None or _rmt_carrier != carrier_hz:
        if _rmt is not None:
            try:
                _rmt.deinit()
            except Exception:
                pass
            _rmt = None
        # tx_carrier=(freq_hz, duty_percent, idle_level)
        #   33 % duty is the canonical IR-remote level; the LED is only
        #   on for one-third of each carrier cycle which dramatically
        #   cuts average current while keeping the TSOP AGC happy.
        kwargs = {
            "pin": Pin(pins.IR_TX, Pin.OUT, value=0),
            "clock_div": _RMT_CLOCK_DIV,
            "tx_carrier": (carrier_hz, 33, 1),
            "num_symbols": 128,
        }
        try:
            _rmt = RMT(0, **kwargs)
        except TypeError:
            del kwargs["num_symbols"]
            _rmt = RMT(0, **kwargs)
        _rmt_carrier = carrier_hz
        _last_error = None
    return _rmt


def _release_rmt_tx():
    """Release the idle TX channel before handing RMT back to RX."""
    global _rmt, _rmt_carrier
    if _rmt is not None:
        try:
            _rmt.deinit()
        except Exception:
            pass
    _rmt = None
    _rmt_carrier = 0


def transmit_nec(code32, carrier_hz=38000):
    """Encode a 32-bit NEC frame least-significant-bit first."""
    global _last_error
    pulses = [NEC_LEAD_HIGH, NEC_LEAD_LOW]
    for i in range(32):
        bit = (code32 >> i) & 1
        pulses.append(NEC_BIT_HIGH)
        pulses.append(NEC_BIT_LOW_1 if bit else NEC_BIT_LOW_0)
    pulses.append(NEC_TAIL_HIGH)
    try:
        rmt = _get_rmt(carrier_hz)
        rmt.write_pulses(pulses, 1)
        if not rmt.wait_done(timeout=500):
            raise RuntimeError("RMT transmit timeout")
    except Exception as exc:
        _last_error = "TX: %s" % exc
        raise
    _last_error = None
    return True


def transmit_raw(durations_us, carrier_hz=38000):
    """Replay captured mark/space durations, beginning with a carrier mark."""
    global _last_error
    pulses = list(durations_us)
    if len(pulses) < 2:
        raise ValueError("raw IR frame is empty")
    for duration in pulses:
        if duration <= 0 or duration > 32767:
            raise ValueError("IR duration out of range: %s" % duration)
    try:
        rmt = _get_rmt(carrier_hz)
        rmt.write_pulses(pulses, 1)
        if not rmt.wait_done(timeout=1000):
            raise RuntimeError("RMT transmit timeout")
    except Exception as exc:
        _last_error = "TX: %s" % exc
        raise
    _last_error = None
    return True


# ── RX ──────────────────────────────────────────────────────────────────────

_rx_pin       = None
_rx_callback  = None
_rx_mode      = "focus"
_MAX_PULSES   = 700
_pulse_buf    = array("I", [0] * _MAX_PULSES)
_spare_buf    = array("I", [0] * _MAX_PULSES)
_pulse_count  = 0
_pulse_overflow = False
_last_edge_us = 0
_frame_start  = 0
_last_capture = None
_END_OF_FRAME_US = 25_000


def _on_edge(p):
    """Pin IRQ fires on every rising/falling edge of TSOP OUT.

    We just record the elapsed micros since the previous edge — the pulse
    widths are what carry the data. This path is only a compatibility
    fallback for firmware without the
    native RMT receiver; precise capture uses ``_oreo_ir``.
    """
    global _last_edge_us, _frame_start, _pulse_count, _pulse_overflow
    now = time.ticks_us()
    if _last_edge_us:
        dt = time.ticks_diff(now, _last_edge_us)
        if dt >= 40:
            if _pulse_count < _MAX_PULSES:
                _pulse_buf[_pulse_count] = dt
                _pulse_count += 1
            else:
                _pulse_overflow = True
    else:
        _frame_start = now
    _last_edge_us = now


def start_receive(on_packet, mode="focus"):
    """Begin listening. on_packet(code_or_None, info_dict).

    `mode` is just a hint we pass through to the callback so the Quest
    app can render differently — the decoder runs the same in both.
    """
    global _rx_pin, _rx_callback, _rx_mode, _pulse_count
    global _pulse_overflow, _last_edge_us, _last_error
    _rx_callback  = on_packet
    _rx_mode      = mode
    _pulse_count  = 0
    _pulse_overflow = False
    _last_edge_us = 0
    if _HAVE_NATIVE_RX:
        # TX keeps its hardware channel after a send. Release the idle
        # transmitter before recreating RX during a SEND -> FOCUS switch.
        _release_rmt_tx()
        _native_rx.start(pins.IR_RX)
        _last_error = None
        return
    if _rx_pin is None:
        _rx_pin = Pin(pins.IR_RX, Pin.IN, Pin.PULL_UP)
    _rx_pin.irq(handler=_on_edge,
                trigger=Pin.IRQ_FALLING | Pin.IRQ_RISING)
    _last_error = None


def stop_receive():
    global _rx_pin, _rx_callback, _pulse_count, _pulse_overflow
    if _HAVE_NATIVE_RX:
        _native_rx.stop()
    if _rx_pin is not None:
        _rx_pin.irq(handler=None)
    _rx_pin = None
    _rx_callback = None
    _pulse_count = 0
    _pulse_overflow = False


def poll():
    """Drain any buffered pulses, decode complete frames, fire callbacks.

    Called once per app frame. Cheap when no IR is incoming (~10 µs).
    """
    global _pulse_buf, _spare_buf, _pulse_count, _pulse_overflow
    global _last_edge_us, _last_capture, _last_error
    if _HAVE_NATIVE_RX:
        if not _rx_callback:
            return
        pulses = _native_rx.poll()
        if pulses is not None:
            _deliver_frame(pulses)
        return
    if not _pulse_count or not _rx_callback:
        return
    now = time.ticks_us()
    # If the line has been quiet long enough we treat the buffer as one
    # complete frame.
    if time.ticks_diff(now, _last_edge_us) < _END_OF_FRAME_US:
        return

    # Swap buffers while IRQs are briefly masked. The callback immediately
    # writes into the spare buffer, while foreground safely copies the
    # completed one without holding off GPIO interrupts.
    irq_state = disable_irq()
    # An edge may have arrived between the quiet-period check above and
    # masking IRQs. If so, it belongs to a new/in-progress frame; leave the
    # buffer untouched and let a later poll finish it.
    if time.ticks_diff(time.ticks_us(), _last_edge_us) < _END_OF_FRAME_US:
        enable_irq(irq_state)
        return
    completed = _pulse_buf
    _pulse_buf = _spare_buf
    _spare_buf = completed
    count = _pulse_count
    overflow = _pulse_overflow
    _pulse_count = 0
    _pulse_overflow = False
    _last_edge_us = 0
    enable_irq(irq_state)
    if overflow:
        _last_error = "RX frame exceeded %d pulses" % _MAX_PULSES
        return

    pulses = tuple(completed[i] for i in range(count))
    _deliver_frame(pulses)


def _deliver_frame(pulses):
    """Decode and publish one hardware- or fallback-captured envelope."""
    global _last_capture, _last_error
    count = len(pulses)
    duration = sum(pulses)
    code = _try_decode_nec(pulses)
    info = {
        "pulse_count": count,
        "duration_us": duration,
        "carrier":     38000,
        "carrier_hz":  38000,
        "carrier_known": False,
        "start_level": 1,
        "pulses":      pulses,
        "protocol":    "nec" if code is not None else "raw",
    }
    _last_capture = info
    _last_error = None
    try:
        _rx_callback(code, info)
    except Exception as exc:
        _last_error = "RX callback: %s" % exc


def last_capture():
    """Return the most recent raw envelope capture, or None."""
    return _last_capture


def transmit_capture(capture=None, carrier_hz=None):
    """Replay a raw capture at its nominal or caller-selected carrier."""
    if capture is None:
        capture = _last_capture
    if not capture or not capture.get("pulses"):
        raise ValueError("no recorded IR signal")
    if carrier_hz is None:
        carrier_hz = capture.get("carrier_hz", 38000)
    return transmit_raw(capture["pulses"], carrier_hz=int(carrier_hz))


def last_error():
    return _last_error


def _try_decode_nec(pulses):
    """Best-effort 32-bit NEC decode. Returns int or None.

    Lenient timing windows so cheap remotes / breadboard wiring still
    decode without requiring a logic analyser.
    """
    if len(pulses) < 67:    # leader(2) + 32×bits(64) + tail(1)
        return None
    if not (7500 < pulses[0] < 10500):  return None    # 9 ms leader HIGH
    if not (3500 < pulses[1] < 5500):   return None    # 4.5 ms leader LOW

    code = 0
    for i in range(32):
        h = pulses[2 + i * 2]
        l = pulses[3 + i * 2]
        if not (300 < h < 800):
            return None
        if 1200 < l < 2200:
            code |= 1 << i
        elif 300 < l < 800:
            pass
        else:
            return None
    return code
