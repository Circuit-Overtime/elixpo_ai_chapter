# Diffuino BCD selector

This KiCad project documents the hardware selector used by Diffuino. Four
switches present a BCD value to Arduino UNO Q pins D2--D5. A validity network
allows the generate button to reach D6 only for decimal values 0--9, and a
separate reset button drives D7.

The request equation is:

    VALID = NOT(BCD3 AND (BCD2 OR BCD1))
    D6 = GENERATE_BUTTON AND VALID

BCD0 does not participate in validation because values 10--15 are identified by
BCD3 together with either BCD2 or BCD1.

## Revision from the breadboard prototype

The publication schematic deliberately improves the working prototype:

- 10 kOhm pull-downs replace 220 Ohm signal pull-downs, reducing the high-state
  current from about 23 mA to 0.5 mA per input;
- 10 nF switch filters and 100 nF button filters reject short transients, while
  the STM32 firmware independently applies a 40 ms debounce;
- 1 kOhm series resistors limit fault current into D2--D7;
- the trigger indicator is driven through a 2N3904 so it cannot load the logic
  output sent to D6;
- every logic IC has a 100 nF local bypass capacitor and the rail has a 10 uF
  bulk capacitor; and
- unused CMOS gate inputs must be tied to ground.

The final circuit uses single-gate 74AHC1G32, 74AHC1G08, and 74AHC1G04 devices
powered from the UNO Q 5 V rail. This avoids the unused-input problem of the
three multi-gate breadboard ICs while preserving exactly the same Boolean
network. Their inputs are driven only by rail-to-rail switches. The UNO Q datasheet
documents D2--D7 as 5 V-tolerant MCU digital inputs. Do not reuse this design on
non-5-V-tolerant pins or on the UNO Q's 1.8 V MPU GPIO.

## Pin mapping

| Signal | UNO Q pin |
| --- | --- |
| BCD0 / 2^0 | D2 |
| BCD1 / 2^1 | D3 |
| BCD2 / 2^2 | D4 |
| BCD3 / 2^3 | D5 |
| Valid generate pulse | D6 |
| Reset | D7 |

## Files

- `diffuino_selector.kicad_sch`: editable KiCad schematic;
- `diffuino_selector.svg` and `diffuino_selector.pdf`: generated exports;
- `generate_schematic.py`: reproducible schematic source generator;
- `BOM.csv`: component list; and
- `truth_table.csv`: exhaustive validity table.

Regenerate the schematic (requires `kicad-sch-api`) and publication assets with:

    python generate_schematic.py
    kicad-cli sch export svg --output . diffuino_selector.kicad_sch
    kicad-cli sch export pdf --output diffuino_selector.pdf diffuino_selector.kicad_sch

The external RC components improve noise immunity but are not the sole debounce
mechanism. The STM32 samples the BCD lines only after accepting D6, locks out
additional requests during inference, and leaves the final digit displayed until
a debounced D7 reset.
