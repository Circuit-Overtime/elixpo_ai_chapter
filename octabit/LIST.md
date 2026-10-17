# 8-Bit CPU Component List

## 1. **PWM Clock**
- **Purpose**: Generates the clock signal for the CPU.
- **Components**:
  - 555 Timer IC (for PWM signal generation)
  - Frequency Divider (optional)

## 2. **Address Register**
- **Purpose**: Holds the address of the memory location being accessed.
- **Components**:
  - 8-bit Latch (e.g., 74LS373 or equivalent)
  - Multiplexer (e.g., 74LS157)

## 3. **RAM (28C64 EEPROM)**
- **Purpose**: Stores program instructions and data.
- **Components**:
  - 28C64 EEPROM (for non-volatile storage)
  - 8-bit Address Bus
  - 8-bit Data Bus
  - Read/Write Control Signal

## 4. **Instruction Register**
- **Purpose**: Holds the current instruction fetched from memory.
- **Components**:
  - 8-bit Register (e.g., 74LS273)
  - Instruction Decoder

## 5. **Control Logic**
- **Purpose**: Decodes microinstructions and generates control signals for the CPU.
- **Components**:
  - Arduino Nano (programmed with microinstructions)
  - Control Logic Unit (based on microinstruction set)
  - LEDs (as signals for control)

## 6. **Program Counter**
- **Purpose**: Keeps track of the address of the next instruction to be fetched.
- **Components**:
  - 8-bit Register (e.g., 74LS161)
  - Address Bus
  - Control Signals (Increment/Load/Reset)

## 7. **A Register**
- **Purpose**: Holds one operand for arithmetic or logic operations.
- **Components**:
  - 8-bit Register (e.g., 74LS273)
  - Data Bus
  - ALU (Arithmetic Logic Unit)

## 8. **B Register**
- **Purpose**: Holds the second operand for arithmetic or logic operations.
- **Components**:
  - 8-bit Register (e.g., 74LS273)
  - Data Bus
  - ALU (Arithmetic Logic Unit)

## 9. **ALU (Arithmetic Logic Unit)**
- **Purpose**: Performs arithmetic and logic operations.
- **Components**:
  - 8-bit ALU (e.g., 74LS181)
  - Flag Registers for Zero, Carry, Negative, Even, Odd

## 10. **Output Display**
- **Purpose**: Displays the result of computations or program outputs.
- **Components**:
  - 7-Segment Display or LEDs
  - Output Register

## 11. **EEPROM Programmer**
- **Purpose**: Programs the 28C64 EEPROM with data.
- **Components**:
  - EEPROM Programmer Circuit
  - 28C64 EEPROM
  - Address Bus
  - Data Bus
  - Write Control Signal

---

## Miscellaneous Components
- **Resistors** (for current limiting and pull-up/down)
- **Capacitors** (for decoupling)
- **Breadboard** (for prototyping)
- **Jumper Wires** (for connections)
- **Power Supply** (e.g., 5V DC)
- **LEDs** (for status indicators)
- **Switches** (for input signals)
