"""MPU6050 accelerometer + gyroscope driver.

Wiring (see oreoWare/pins.py):
    SDA → I2C_SDA  (GPIO 42)
    SCL → I2C_SCL  (GPIO 47)
    VCC → 3V3
    GND → GND
    AD0 → GND      (address 0x68)
    INT → IMU_INT  (GPIO 3, optional, for motion-wake)

Usage:
    from oreoWare import imu
    sensor = imu.MPU6050()
    ax, ay, az = sensor.read_accel_g()       # g (gravity = 1.0)
    gx, gy, gz = sensor.read_gyro_dps()      # degrees per second
    pitch, roll = sensor.tilt_deg()          # convenience for game apps

The driver caches I2C, reuses one read buffer per call, and exposes a
sleep() / wake() pair so the power manager can drop the chip to 5 µA when
no game is using it.
"""

try:
    from machine import SoftI2C, Pin
    # SoftI2C bit-bangs through the GPIO matrix and bypasses the
    # ESP32-S3's HW I²C peripheral. On the MicroPython 1.28 build we
    # ship, HW I²C scans correctly but `readfrom_mem*` calls time out
    # against the MPU6050 (ETIMEDOUT, errno 116) regardless of speed
    # or peripheral index. SoftI2C @ 50 kHz reads cleanly. Throughput
    # is plenty: a 14-byte burst takes ~3 ms — well under the racer
    # game's per-frame budget. Aliased as I2C so the rest of the
    # module reads naturally.
    I2C = SoftI2C
except ImportError:
    I2C = None
    Pin = None

import struct
from oreoWare import pins


# ── register map (subset we actually use) ────────────────────────────────────
_ADDR        = 0x68
_PWR_MGMT_1  = 0x6B
_PWR_MGMT_2  = 0x6C
_SMPLRT_DIV  = 0x19
_CONFIG      = 0x1A
_GYRO_CFG    = 0x1B
_ACCEL_CFG   = 0x1C
_ACCEL_OUT_H = 0x3B   # accel x_h, x_l, y_h, y_l, z_h, z_l (then temp + gyro)
_WHO_AM_I    = 0x75

# Full-scale ranges we configure.
_ACCEL_FS_2G   = 0x00         # ±2 g
_GYRO_FS_250   = 0x00         # ±250 °/s
_ACCEL_LSB_PER_G  = 16384.0   # at ±2 g full-scale
_GYRO_LSB_PER_DPS = 131.0     # at ±250 °/s

# 14-byte read covering accel(6) + temp(2) + gyro(6) starting at 0x3B.
_BURST_FMT = ">hhhhhhh"


# Both addresses the MPU6050 module can answer on. AD0 → GND = 0x68
# (datasheet default + most GY-521 breakouts), AD0 → 3V3 = 0x69. Some
# boards leave AD0 floating, which is why detection has to try both.
_ALT_ADDR = 0x69


def detect(i2c=None, retries=3):
    """Probe the I2C bus for an MPU6050 and return an idle driver.

    Tries the default 0x68 first, then 0x69, up to `retries` rounds.
    Returns the live MPU6050 instance, or None if neither address ACKs
    cleanly across the retries.

    The returned chip is put back to sleep before this function returns
    so we don't burn ~3.6 mA between launches. Callers must call
    `wake()` before reading. The racer game's on_enter / on_exit pair
    handles this; future tilt-aware apps should follow the same
    contract.
    """
    if I2C is None:
        return None
    if i2c is None:
        try:
            i2c = I2C(scl=Pin(pins.I2C_SCL), sda=Pin(pins.I2C_SDA),
                      freq=100_000)
        except Exception:
            return None

    # Quick pre-scan — only attempt addresses the bus actually saw, so
    # we don't waste retries on a chip that isn't even on the bus.
    try:
        present = set(i2c.scan())
    except Exception:
        present = None

    for addr in (_ADDR, _ALT_ADDR):
        if present is not None and addr not in present:
            continue
        for _ in range(retries):
            try:
                m = MPU6050(i2c=i2c, addr=addr)
                # Park the chip in low-power sleep until the caller
                # explicitly wakes it. _init_chip already left it
                # running; flip it back so detect() is power-neutral.
                try:
                    m.sleep()
                except Exception:
                    pass
                return m
            except Exception:
                # Brief settle before retry — bus can recover from a
                # clock-stretch timeout on a fresh power-on.
                try:
                    import time
                    time.sleep_ms(5)
                except Exception:
                    pass
    return None


def i2c_scan(freq=100_000):
    """Probe the bus and return the list of addresses that ACKed.

    Useful when 'OSError: ETIMEDOUT' shows up — calling this first tells you
    whether the chip is reachable AT ALL, separately from any driver bug.
    Returns [] when nothing answered (check wiring + power + pull-ups).
    """
    if I2C is None:
        raise RuntimeError("machine.I2C not available")
    bus = I2C(scl=Pin(pins.I2C_SCL), sda=Pin(pins.I2C_SDA), freq=freq)
    return bus.scan()


class MPU6050:
    def __init__(self, i2c=None, addr=_ADDR):
        if i2c is None:
            if I2C is None:
                raise RuntimeError("machine.I2C not available")
            # 100 kHz default — slow mode, forgiving of breadboard parasitic
            # capacitance and long jumper wires. Bump to 400 kHz only once
            # you've confirmed the bus is stable.
            i2c = I2C(scl=Pin(pins.I2C_SCL), sda=Pin(pins.I2C_SDA), freq=100_000)
        self._i2c    = i2c
        self._addr   = addr
        self._buf    = bytearray(14)
        # Persistent biases — set by calibrate(); zero until then.
        self._a_bias = (0.0, 0.0, 0.0)
        self._g_bias = (0.0, 0.0, 0.0)
        self._init_chip()

    # ── lifecycle ────────────────────────────────────────────────────────
    def _w(self, reg, val):
        self._i2c.writeto_mem(self._addr, reg, bytes((val,)))

    def _init_chip(self):
        # Wake from default sleep, use the PLL with X gyro reference (more
        # stable than the internal oscillator).
        self._w(_PWR_MGMT_1, 0x01)
        # 1 kHz sample rate, DLPF ≈ 44 Hz on accel, 42 Hz on gyro
        self._w(_SMPLRT_DIV, 0x00)
        self._w(_CONFIG,     0x03)
        self._w(_GYRO_CFG,   _GYRO_FS_250)
        self._w(_ACCEL_CFG,  _ACCEL_FS_2G)

    def whoami(self):
        return self._i2c.readfrom_mem(self._addr, _WHO_AM_I, 1)[0]

    def sleep(self):
        """Put the IMU into low-power sleep (~5 µA)."""
        self._w(_PWR_MGMT_1, 0x40)

    def wake(self):
        self._init_chip()

    def enable_cycle_mode(self, rate_hz=5):
        """Drop the chip into accel-only cycle mode at `rate_hz`.

        Cycle mode auto-toggles between sleep + a single accel sample
        at the configured wake-up rate, with the gyro disabled. Power
        is roughly:
            1.25 Hz   ~10 µA
            5 Hz      ~25 µA   (default — snappy for gesture detect)
            20 Hz     ~70 µA
            40 Hz     ~140 µA
        Followed by `enable_motion_int()` this gives the gesture engine
        a near-zero-cost idle: the chip only spends bus cycles when the
        accel actually crosses the motion threshold.
        """
        # PWR_MGMT_1: CYCLE=1, SLEEP=0, TEMP_DIS=1, internal 8MHz osc.
        self._w(_PWR_MGMT_1, 0x28)
        # PWR_MGMT_2: gyro X/Y/Z standby + LP_WAKE_CTRL field selects rate.
        rate_bits = {1: 0b00, 2: 0b00, 5: 0b01,
                     20: 0b10, 40: 0b11}.get(int(rate_hz), 0b01) << 6
        # 0x07 = gyro X/Y/Z all in standby.
        self._w(_PWR_MGMT_2, rate_bits | 0x07)

    def disable_motion_int(self):
        """Clear the motion-interrupt configuration (re-enable temp,
        return to the full-rate config from _init_chip)."""
        self._w(0x37, 0x00)
        self._w(0x38, 0x00)
        self._init_chip()

    # ── reads ────────────────────────────────────────────────────────────
    def _burst(self):
        """Single 14-byte read → 7 signed-16 ints: ax, ay, az, temp, gx, gy, gz."""
        self._i2c.readfrom_mem_into(self._addr, _ACCEL_OUT_H, self._buf)
        return struct.unpack(_BURST_FMT, self._buf)

    def read_raw(self):
        return self._burst()

    def read_accel_g(self):
        ax, ay, az, _t, _gx, _gy, _gz = self._burst()
        bx, by, bz = self._a_bias
        return (ax / _ACCEL_LSB_PER_G - bx,
                ay / _ACCEL_LSB_PER_G - by,
                az / _ACCEL_LSB_PER_G - bz)

    def read_gyro_dps(self):
        _ax, _ay, _az, _t, gx, gy, gz = self._burst()
        bx, by, bz = self._g_bias
        return (gx / _GYRO_LSB_PER_DPS - bx,
                gy / _GYRO_LSB_PER_DPS - by,
                gz / _GYRO_LSB_PER_DPS - bz)

    def read_all(self):
        """Return (ax, ay, az, gx, gy, gz, temp_C) in physical units."""
        ax, ay, az, t, gx, gy, gz = self._burst()
        bax, bay, baz = self._a_bias
        bgx, bgy, bgz = self._g_bias
        # Datasheet: T_C = TEMP_OUT / 340 + 36.53
        return (ax / _ACCEL_LSB_PER_G - bax,
                ay / _ACCEL_LSB_PER_G - bay,
                az / _ACCEL_LSB_PER_G - baz,
                gx / _GYRO_LSB_PER_DPS - bgx,
                gy / _GYRO_LSB_PER_DPS - bgy,
                gz / _GYRO_LSB_PER_DPS - bgz,
                t / 340.0 + 36.53)

    # ── derived ──────────────────────────────────────────────────────────
    def tilt_deg(self):
        """Return (pitch, roll) in degrees from the accel vector.

        Assumes the badge is held HORIZONTAL (screen up). Pitch is rotation
        around the X axis (front/back tilt) and roll is around the Y axis
        (side-to-side tilt). Drives the racer game's throttle + steer.
        """
        import math
        ax, ay, az = self.read_accel_g()
        # atan2 with mag of the orthogonal pair keeps small-angle behaviour
        # smooth even near the gimbal-lock edges.
        pitch = math.degrees(math.atan2(ay, math.sqrt(ax * ax + az * az)))
        roll  = math.degrees(math.atan2(ax, math.sqrt(ay * ay + az * az)))
        return pitch, roll

    # ── calibration ──────────────────────────────────────────────────────
    def calibrate(self, samples=200, settle_ms=2):
        """Sit still on a flat surface and average N samples to learn biases.

        Captures the resting gyro drift AND any accel offset away from
        (0, 0, +1g). After this, read_accel_g/read_gyro_dps return values
        with the resting bias subtracted out.

        Called once at racer game start; takes ~0.5 s with the defaults.
        """
        import time
        ax = ay = az = 0.0
        gx = gy = gz = 0.0
        for _ in range(samples):
            rax, ray, raz, _t, rgx, rgy, rgz = self._burst()
            ax += rax / _ACCEL_LSB_PER_G
            ay += ray / _ACCEL_LSB_PER_G
            az += raz / _ACCEL_LSB_PER_G
            gx += rgx / _GYRO_LSB_PER_DPS
            gy += rgy / _GYRO_LSB_PER_DPS
            gz += rgz / _GYRO_LSB_PER_DPS
            time.sleep_ms(settle_ms)
        n = float(samples)
        # Accel bias = mean offset from (0, 0, +1g). Z keeps the gravity 1g
        # so subsequent reads still see Z ≈ 1 at rest.
        self._a_bias = (ax / n, ay / n, (az / n) - 1.0)
        self._g_bias = (gx / n, gy / n, gz / n)
        return self._a_bias, self._g_bias

    # ── motion interrupt (used by the power manager for wake-on-motion) ──
    def enable_motion_int(self, thresh_mg=128, duration_ms=1):
        """Configure the chip to raise INT when |accel| jerks above thresh."""
        # Registers per the MPU6050 RM (Motion Detection Mode).
        self._w(0x37, 0x60)                            # INT pin latched, push-pull
        self._w(0x38, 0x40)                            # int enable: motion only
        self._w(0x1F, max(1, int(thresh_mg / 2)))      # thresh, 2 mg/LSB
        self._w(0x20, max(1, int(duration_ms)))        # duration, ms

    def clear_int(self):
        self._i2c.readfrom_mem(self._addr, 0x3A, 1)    # INT_STATUS read clears it
