"""IMU / I2C bus diagnostic for the Oreo Badge.

Run this when the racer game says "no IMU" or the bus scan turns up
empty. Drives a sequence of probes against the ESP32-S3 over USB-CDC
and prints a verdict (wiring fault / power fault / dead chip / ok).

Usage:
    python tools/imu_probe.py                              # defaults
    python tools/imu_probe.py /dev/ttyACM1                 # alt port
    python tools/imu_probe.py --sda 42 --scl 33            # alt pins
    python tools/imu_probe.py /dev/ttyACM0 --scl 33        # combined

What it checks
--------------
1. **I2C scan** at three speeds (50 / 100 / 400 kHz) on hardware
   peripheral 0 + 1 + software bit-bang. If ANY scan finds 0x68 or
   0x69, the IMU is present — we then read WHO_AM_I to confirm the
   chip kind.
2. **Pull-up vs pull-down read** on SDA (GPIO 42) and SCL (GPIO 47).
   The two reads tell us:
       PULL_UP=1 + PULL_DOWN=0   no external influence (line floats /
                                 only the ESP32 internal pull is
                                 driving). Wires likely open.
       PULL_UP=1 + PULL_DOWN=1   strong external pull-up (or short to
                                 3V3). Bus pull-ups are healthy.
       PULL_UP=0 + PULL_DOWN=0   strong external pull-down (or short
                                 to GND). Wires probably swapped or
                                 shorted to GND.

The verdict combines (1) and (2) into a one-liner.
"""

import subprocess
import sys

DEFAULT_PORT  = "/dev/ttyACM0"
DEFAULT_SDA   = 42
DEFAULT_SCL   = 47
MPREMOTE      = ".venv/bin/mpremote"      # repo-local venv first
PROBE_SNIPPET = r"""
from machine import I2C, SoftI2C, Pin
import time

SDA, SCL = __SDA__, __SCL__

# ── I2C scans ──────────────────────────────────────────────────────────
results = []
configs = (
    ("HW(0) 50k",  lambda: I2C(0,    scl=Pin(SCL), sda=Pin(SDA), freq=50_000)),
    ("HW(0) 100k", lambda: I2C(0,    scl=Pin(SCL), sda=Pin(SDA), freq=100_000)),
    ("HW(0) 400k", lambda: I2C(0,    scl=Pin(SCL), sda=Pin(SDA), freq=400_000)),
    ("HW(1) 100k", lambda: I2C(1,    scl=Pin(SCL), sda=Pin(SDA), freq=100_000)),
    ("Soft   50k", lambda: SoftI2C(  scl=Pin(SCL), sda=Pin(SDA), freq=50_000)),
)
for label, mk in configs:
    try:
        b = mk()
        d = b.scan()
        results.append((label, d, b))
        print("SCAN %s -> %s" % (label, [hex(x) for x in d]))
    except Exception as e:
        print("SCAN %s -> FAIL: %s" % (label, e))

# ── WHO_AM_I on any responder at MPU6050 addresses ────────────────────
known_addrs = (0x68, 0x69)
for label, devs, bus in results:
    for addr in known_addrs:
        if addr in devs:
            try:
                w = bus.readfrom_mem(addr, 0x75, 1)[0]
                kind = {0x68: "MPU6050",
                        0x70: "MPU9250 (mag-on)",
                        0x71: "MPU9250",
                        0x73: "MPU9255",
                        0x12: "ICM-20948"}.get(w, "unknown chip")
                print("WHOAMI %s addr=%s val=%s (%s)" %
                      (label, hex(addr), hex(w), kind))
            except Exception as e:
                print("WHOAMI %s addr=%s FAIL: %s" % (label, hex(addr), e))

# ── pull-up vs pull-down line probe ────────────────────────────────────
print("---LINE---")
for label, gpio in (("SDA", SDA), ("SCL", SCL)):
    Pin(gpio, Pin.IN, Pin.PULL_UP);   time.sleep_ms(1)
    v_up = Pin(gpio, Pin.IN, Pin.PULL_UP).value()
    Pin(gpio, Pin.IN, Pin.PULL_DOWN); time.sleep_ms(1)
    v_dn = Pin(gpio, Pin.IN, Pin.PULL_DOWN).value()
    print("LINE %s gpio=%d up=%d down=%d" % (label, gpio, v_up, v_dn))
print("---END---")
"""


def _run(port, sda, scl):
    """Invoke mpremote exec and return its stdout as text."""
    snippet = PROBE_SNIPPET.replace("__SDA__", str(sda)).replace("__SCL__", str(scl))
    cmd = [MPREMOTE, "connect", port, "exec", snippet]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
    except FileNotFoundError:
        sys.exit("mpremote not found at %s — `pip install mpremote` "
                 "into the venv first." % MPREMOTE)
    except subprocess.TimeoutExpired:
        sys.exit("Probe timed out — device unreachable on %s. "
                 "Check the cable + that the badge isn't in deep-sleep."
                 % port)
    if r.returncode != 0:
        sys.stderr.write(r.stderr or "(no stderr)\n")
        sys.exit("mpremote exec failed (rc=%d)." % r.returncode)
    return r.stdout


def _verdict(out):
    """Translate the raw probe output into a one-line diagnosis."""
    devs_seen   = set()
    whoami_hits = []
    line        = {}
    for ln in out.splitlines():
        if ln.startswith("SCAN ") and "->" in ln and "FAIL" not in ln:
            # SCAN HW(0) 100k -> ['0x68', '0x36']
            after = ln.split("->", 1)[1].strip()
            for tok in after.strip("[]").split(","):
                tok = tok.strip().strip("'\"")
                if tok:
                    try:
                        devs_seen.add(int(tok, 16))
                    except ValueError:
                        pass
        elif ln.startswith("WHOAMI "):
            whoami_hits.append(ln)
        elif ln.startswith("LINE "):
            # LINE SDA gpio=42 up=1 down=0
            parts = dict(p.split("=") for p in ln.split() if "=" in p)
            try:
                line[ln.split()[1]] = (int(parts["up"]), int(parts["down"]))
            except (KeyError, ValueError):
                pass

    print()
    print("─" * 60)
    if 0x68 in devs_seen or 0x69 in devs_seen:
        print("VERDICT: ✅ IMU detected on the bus.")
        for w in whoami_hits:
            print("        ", w[len("WHOAMI "):])
        return

    # No IMU. Inspect the line states to give a useful nudge.
    sda = line.get("SDA", (None, None))
    scl = line.get("SCL", (None, None))

    def _classify(up, dn):
        if up == 1 and dn == 0: return "FLOATING"   # only ESP32 pull driving
        if up == 1 and dn == 1: return "PULLED_HIGH" # external pull-up wins
        if up == 0 and dn == 0: return "PULLED_LOW"  # external short / pull-down
        return "UNCERTAIN (up=%s down=%s)" % (up, dn)

    sda_cls = _classify(*sda)
    scl_cls = _classify(*scl)
    print("VERDICT: ❌ no I2C devices ACKed (no MPU at 0x68/0x69, no MAX17048 at 0x36).")
    print("        SDA line: %s" % sda_cls)
    print("        SCL line: %s" % scl_cls)
    print()
    if sda_cls == "FLOATING" and scl_cls == "FLOATING":
        print("➡ Bus has no external pull-ups. The GY-521's onboard 4.7 kΩ")
        print("  pull-ups should hold these HIGH when the module is wired in.")
        print("  Likely cause: SDA/SCL wires aren't reaching the module's")
        print("  data pads (cold solder joint, breadboard contact, or the")
        print("  jumpers are in the wrong rows).")
    elif sda_cls == "PULLED_HIGH" and scl_cls == "PULLED_HIGH":
        print("➡ Pull-ups are present — bus is electrically alive — but no")
        print("  slave is responding. Likely cause: chip-side I/O is dead")
        print("  (LED can light from VCC even if the silicon's I2C side is")
        print("  broken), wires are SWAPPED at the module side, or AD0 is")
        print("  in a weird intermediate state. Try: swap to a different")
        print("  GY-521 board.")
    else:
        print("➡ Mixed line states. Check for shorts (SDA touching GND or")
        print("  3V3 pins), and verify the module's GND is actually wired.")


def _parse_args():
    """Tiny ad-hoc parser — keeps the script dep-free.
    First positional is the serial port; --sda / --scl override pins."""
    port, sda, scl = DEFAULT_PORT, DEFAULT_SDA, DEFAULT_SCL
    args = sys.argv[1:]
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--sda":
            sda = int(args[i + 1]); i += 2
        elif a == "--scl":
            scl = int(args[i + 1]); i += 2
        elif a in ("-h", "--help"):
            print(__doc__); sys.exit(0)
        elif a.startswith("--"):
            sys.exit("unknown flag: %s" % a)
        else:
            port = a; i += 1
    return port, sda, scl


def main():
    port, sda, scl = _parse_args()
    print("Probing IMU on %s  (SDA=GPIO %d, SCL=GPIO %d) ..."
          % (port, sda, scl))
    out = _run(port, sda, scl)
    print(out, end="")
    _verdict(out)


if __name__ == "__main__":
    main()
