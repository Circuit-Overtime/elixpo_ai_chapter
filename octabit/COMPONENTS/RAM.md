```mermaid
graph TD
    Addr[Address Bus] --> RAM[RAM (28C64 EEPROM)]
    DataIn[Data Bus] --> RAM
    Control[Read/Write Signal] --> RAM
    RAM --> DataOut[Data Output]

```