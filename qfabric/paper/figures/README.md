# Figure assets

Place the real experimental testbed photograph at testbed.jpg. Use a landscape
image at 1600x900 pixels or higher, with the UNO Q in focus, its USB connection
to the test laptop visible, and the LED matrix illuminated if practical. Use a
clean, evenly lit background and crop out serial numbers, passwords, terminal
contents, and private network information.

The manuscript compiles with a labeled placeholder when that file is absent.
Do not use a generated or stock image: the figure is evidence about the actual
physical setup used for the experiments.

## Audited matrix state for the photograph

Use the Stage 8 decision journal and hold decision 2's accepted Linux-to-RT
transition overlay for two minutes:

    qf view placement \
      --decision 2 \
      --history data/processed/stage8/stage8-decisions-01/decisions.jsonl \
      --refresh-hz 8 \
      --overlay-ms 120000

Take the photograph while this command is waiting. The upper three matrix rows
show the Linux source at medium intensity, the two center rows show the bright
RPC crossing, and the lower three rows show the bright RT destination. Only
column 0 is active because the evaluated prototype has one concrete QTask. MCU
health should be green and transition activity white. This state is traceable
to audited decision 2 rather than being a decorative pattern.

After the photograph, restore the display to its disabled state:

    qf view off
