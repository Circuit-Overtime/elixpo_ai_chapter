"""Battery monitor — VBAT via the 100k/100k divider on ADC_VBAT.

A full 4.2 V Li-Po reads ~2.10 V at the pin (divider halves cell V);
empty 3.30 V reads ~1.65 V. Mapped to a percentage via a small
piecewise table modelling the Li-Po discharge curve.

If the ADC is unavailable, `read_percent()` returns a fixed 85.
"""

from oreoWare import pins

try:
    from machine import ADC, Pin
    _HAVE_ADC = True
except ImportError:
    _HAVE_ADC = False


_adc       = None
_initted   = False
_SAMPLES   = 8         # average across N reads to suppress mains noise
_DIVIDER   = 2.0       # 100k/100k → cell voltage = 2× pin voltage
_VREF_MV   = 3100      # ESP32-S3 ADC1 @ 11 dB ≈ 0–3.1 V full scale

# Li-Po discharge approximation — (cell_V, percent)
_CURVE = (
    (4.20, 100),
    (4.10,  90),
    (4.00,  80),
    (3.90,  65),
    (3.80,  50),
    (3.70,  35),
    (3.60,  20),
    (3.50,  10),
    (3.40,   5),
    (3.30,   0),
)


def _init():
    global _adc, _initted
    if _initted or not _HAVE_ADC:
        _initted = True
        return
    try:
        _adc = ADC(Pin(pins.ADC_VBAT))
        # 11 dB attenuation — full 0–3.1 V range. API varies across ports;
        # try the modern call first, fall back silently.
        try:
            _adc.atten(ADC.ATTN_11DB)
        except AttributeError:
            pass
        try:
            _adc.width(ADC.WIDTH_12BIT)
        except AttributeError:
            pass
    except Exception:
        _adc = None
    _initted = True


def read_voltage():
    """Return the estimated cell voltage in volts, or None if unavailable."""
    _init()
    if _adc is None:
        return None
    try:
        # read_uv() exists on modern MicroPython and is calibrated against
        # the eFuse Vref — much more accurate than read_u16(). Fall back to
        # read_u16() with the nominal VREF if needed.
        try:
            total = 0
            for _ in range(_SAMPLES):
                total += _adc.read_uv()
            pin_mv = total / _SAMPLES / 1000.0
        except AttributeError:
            total = 0
            for _ in range(_SAMPLES):
                total += _adc.read_u16()
            pin_mv = (total / _SAMPLES) * _VREF_MV / 65535.0
        return (pin_mv * _DIVIDER) / 1000.0
    except Exception:
        return None


def _curve_lookup(v):
    if v >= _CURVE[0][0]:
        return 100
    if v <= _CURVE[-1][0]:
        return 0
    for i in range(len(_CURVE) - 1):
        v_hi, p_hi = _CURVE[i]
        v_lo, p_lo = _CURVE[i + 1]
        if v_lo <= v <= v_hi:
            t = (v - v_lo) / (v_hi - v_lo)
            return int(p_lo + t * (p_hi - p_lo))
    return 0


def read_percent():
    """Return 0–100 battery percentage. On sim/no-ADC returns 85."""
    v = read_voltage()
    if v is None:
        return 85
    return max(0, min(100, _curve_lookup(v)))
