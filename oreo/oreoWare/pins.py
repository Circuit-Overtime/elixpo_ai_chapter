"""GPIO assignments for the Lix badge breadboard prototype.

Single source of truth. Every hardware module imports from here — never hardcode a
GPIO number anywhere else. When the PCB swaps pins, this is the only file to edit.
"""

# ----- Display: SmartElex 2.0" IPS, ST7789P3, 4-wire SPI -----
# Module silkscreen → our name:  CS=CS, RST=RESET, DC=DC, SDA=MOSI, SCL=SCK, EN=BL
# Power: VCC → DevKit 5V pin (module has onboard 3V3 LDO). TE pin left disconnected.
DISPLAY_CS    = 14
DISPLAY_RESET = 16
DISPLAY_DC    = 15
DISPLAY_MOSI  = 11     # display silkscreen: SDA
DISPLAY_SCK   = 12     # display silkscreen: SCL
DISPLAY_BL    = 17     # display silkscreen: EN. Active-high, PWM-capable for brightness
DISPLAY_BAUD  = 40_000_000  # 40MHz SPI. Each full framebuf transfer is
                            # 320×240×2 = 153,600 bytes → ~30.7 ms on the wire.
                            # 40 MHz is the practical ceiling for GPIO-matrix-
                            # routed pins on ESP32-S3 (MOSI=11, SCK=12 aren't
                            # on the IO_MUX — going higher loses bits at the
                            # GPIO matrix). Combined with the 4-chunk write
                            # and proper 5V power, this is stable.

# ----- Buttons (active-low, internal pull-up) -----
BTN_HOME   = 9
BTN_A      = 10
BTN_B      = 13
BTN_C      = 8
BTN_UP     = 4
BTN_DOWN   = 5
BTN_LEFT   = 6
BTN_RIGHT  = 7

# ----- Corner LEDs (LEDC PWM via 470Ω) -----
LED_TL = 38   # top-left
LED_TR = 39   # top-right
LED_BL = 40   # bottom-left
LED_BR = 41   # bottom-right

# ----- Status NeoPixel (onboard WS2812) -----
LED_STATUS = 48

# ----- IR subsystem -----
# Reassigned from BOM's original GPIO48 because that pin is the onboard NeoPixel.
# Picked from the unused pool: 2, 18, 21, 42, 47.
IR_TX = 2     # to 2N2222 base via 4.7kΩ
IR_RX = 18    # TSOP38238 OUT pin

# ----- Analog inputs -----
ADC_VBAT = 1  # ADC1_CH0, fed by the 100kΩ/100kΩ divider stub

# ----- I2C bus (shared by MPU6050; future expanders) -----
# Picked from the unused pool: 42, 47 are general-purpose, non-strapping,
# not on PSRAM lines for N16R8, and not USB-OTG pads.
I2C_SDA   = 42
I2C_SCL   = 47

# ----- MPU6050 -----
# +Y axis of the IMU is wired to "up" on the screen (the way the user holds
# the badge horizontally during the racer game). Mount in-plane with the
# board so pitch = front/back tilt, roll = side-to-side tilt, yaw = twist.
IMU_INT   = 3      # RTC_GPIO3 — wakes from deep sleep on a motion interrupt

# ----- TTP223 (planned v2 — NOT wired in v1 firmware) -----
# v2 hardware exposes TWO capacitive pads so apps + accessories can wire
# in independent touch interfaces (e.g. front-panda chest + back-cover
# secondary, or a paired-badge handshake). v1 firmware doesn't read
# either; button-only wake covers v1. Pins reserved here so v2 work
# doesn't have to re-pick GPIOs.
#
# Module jumper set to active-HIGH, momentary (no toggle).
#
# Pin selection:
#   TOUCH_OUT_1 = 21  RTC GPIO → wake-from-deep-sleep capable. Use this
#                     pad as the primary wake source on v2.
#   TOUCH_OUT_2 = 33  Non-RTC. Edge-poll only in firmware (no deep-sleep
#                     wake). Non-strapping, not on PSRAM lines for the
#                     N16R8 module, not a USB-OTG pad. Free in our map.
#
# Back-compat: `TOUCH_OUT` aliases TOUCH_OUT_1 so existing references in
# documentation / external sketches keep resolving.
TOUCH_OUT_1 = 21
TOUCH_OUT_2 = 33
TOUCH_OUT   = TOUCH_OUT_1
