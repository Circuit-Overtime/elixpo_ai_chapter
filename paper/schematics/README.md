# RV565 paper schematics

These are board-level schematics of the tested breadboard configuration:

- lcd_interface.kicad_sch documents the ST7789P3 SPI, control, power and
  backlight connections used by the DMA video experiment.
- experimental_platform.kicad_sch documents the DevKitC-1 N16R8, display,
  eight active-low buttons, USB connection and latency-measurement header.

To regenerate the native KiCad sources, reusable symbol library and cropped
paper PDFs, run:

    ./paper/schematics/build.sh

The schematics embed their custom symbols and therefore open without installing
the generated oreo_paper.kicad_sym library. A footprint is intentionally not
included: these figures document a breadboard experiment, not a PCB layout.

The optional latency header uses GPIO21 for the test stimulus, GPIO33 for the
action-entry marker and a common analyser ground. These pins remain reserved in
the normal build and must be configured by the measurement firmware.
