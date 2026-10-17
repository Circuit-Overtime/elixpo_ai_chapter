# Paper figure evidence

The paper currently uses two vector TikZ figures because they communicate the
design evolution and the end-to-end data path more clearly than decorative
screenshots.

It also contains a two-panel placeholder for the LCD interface and complete
ESP32-S3 circuit. Replace those boxes only with schematics from the exact board
revision used for the reported measurements.

Add raster images only when they provide experimental evidence. Preferred
future figures are:

1. `hardware-testbench.jpg` — the complete ESP32-S3, ST7789, power, and USB
   measurement setup, with important connections visible;
2. `gallery-playback.jpg` — a real badge photograph showing the playback HUD;
3. `standalone-playback.jpg` — the same clip under the ESP-IDF benchmark; and
4. `logic-analyser.png` — an SPI/DMA timing capture aligned with one frame.

Keep the original files and record capture date, device revision, firmware
commit, and any crop or colour adjustment. Do not substitute website renders,
marketing mockups, or generated badge artwork for experimental photographs.
