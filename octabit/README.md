# Programmable 8-bit Computer on Breadboards

![Computer](https://firebasestorage.googleapis.com/v0/b/videolize-3563f.appspot.com/o/mySkillsImages%2Fmsg6432412431-145895.jpg?alt=media&token=35921957-3199-47e0-983f-543870513678)

<p align="center">
  <img src="https://img.shields.io/badge/EASY_EDA-Schematic-blue" alt="shields"> <img src="https://img.shields.io/badge/openSource%20in%20GitHub-8A2BE2" alt="shields"> <img src="https://img.shields.io/badge/with-Arduino_Nano-00ff65" alt="shields">
</p>


This repository contains the code, schematics, and documentation for a programmable 8-bit computer built from scratch using simple logic gates on breadboards. The project is open source and fully scalable, capable of integrating additional functions and ICs.

## Project Overview

The computer is divided into several parts:

- PWM Clock
- Address Register
- RAM
- Instruction Register
- Control Logic
- Program Counter
- A Register
- B Register
- ALU (Arithmetic Logic Unit)
- Output Display
- Output Register
- Control Word
- Overflow, Underflow, Negative Flag Register

## Credits

This project is inspired by and credits Ben Eater for the original idea and guidance. While based on his concepts, this implementation includes updates and differences, enhancing functionality and scalability.

## Features

- **Scalability:** Easily expandable with additional functions and integrated circuits.
- **Custom Updates:** Includes enhancements and modifications beyond the original design.
- **Open Source:** Available for anyone to study, modify, and contribute to.

## Repository Structure

- `code/`: Contains the code for each component of the computer. [Code](https://github.com/Circuit-Overtime/8Bit-Computer-Programs/blob/1290e9e6d5b0815a8bc3304a0e4bb99490d9940c/8_Bit%20Computer%20Control%20Logic.ino)
- `eepromFlasher/`: Contains the code to flash OP Code into EEPROM for anyone following Ben Eaters Approach of Creating Control Logic. [eepromFlasher.ino]()
- `schematics/`: Includes schematics and diagrams detailing the computer's architecture.[Schematics](https://eater.net/8bit/schematics)
- `docs/`: Documentation, user manual, and design notes at [Dedicated Docs Dropping Soon](https://github.com/Circuit-Overtime/8Bit-Computer-Programs/blob/7d66061673cd8eb7509ea8b8da835e5c4654d911/Docs)

## Getting Started

1. Clone the repository to your local machine.
2. Refer to the documentation for assembly instructions, usage, and programming the computer.
3. Explore and contribute to the project as desired.

![Computer](https://firebasestorage.googleapis.com/v0/b/videolize-3563f.appspot.com/o/mySkillsImages%2Fmsg6432412431-145897.jpg?alt=media&token=d36dbc96-da91-45cc-a37d-31657e645f3d)
<div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
    <img src="https://firebasestorage.googleapis.com/v0/b/videolize-3563f.appspot.com/o/mySkillsImages%2Fmsg6432412431-145896.jpg?alt=media&token=7bcc363b-dd5d-4477-9c1a-314ed98063f4" alt="Schematic2" width="30%">
    <img src="https://firebasestorage.googleapis.com/v0/b/videolize-3563f.appspot.com/o/mySkillsImages%2Fmsg6432412431-145898.jpg?alt=media&token=96697968-a0e8-4ad4-b03e-d779f98ee663" alt="Schematic3" width="30%">
      <img src="https://firebasestorage.googleapis.com/v0/b/videolize-3563f.appspot.com/o/mySkillsImages%2Fmsg6432412431-145899.jpg?alt=media&token=2c5d123b-e003-47b0-95af-bf26a02d17cf" alt="Schematic1" width="30%">
</div>

##Changes

- Used Arduino Nano to drive control logic in place of ATC16 EEPROMS  [Code](https://github.com/Circuit-Overtime/8Bit-Computer-Programs/blob/1290e9e6d5b0815a8bc3304a0e4bb99490d9940c/8_Bit%20Computer%20Control%20Logic.ino)
- Added a negative flag register to the system [Specific Schematic will be Dropping Soon]
```c++
IF ALU_MSB == 1 and SUB = 1 THEN NEG_FLAG = 1
```

- Updated the Code to detect negative number and push a -ve sign at the output display mux ![Specific Code will be Dropping Soon]
```.c
#define NFLAG 11;
pinMode(NFLAG, INPUT);

if(NFLAG == 1)
{
  negativeFlgFunc();
}

```

- Updated the B register to be able to output contents to the BUS
- Updated the step counter to be able to count from (000)~2~ to (110)~2~
``` Now the Step Counter can Count Upto 7 Steps, the current repo code has only 5 Steps without NOP) ```
- Smoother Clock Speed with `20ms` delay from Arduino and `333Hz` PWM Clock.

## Contributions

Contributions are welcome! If you have ideas, improvements, or bug fixes, feel free to open an issue or submit a pull request.

## License

This project is licensed under the [MIT License](LICENSE).
