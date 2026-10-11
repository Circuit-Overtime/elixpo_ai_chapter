# Firmware reference

Firmware v10 lives in
`firmware/28c64_programmer/28c64_programmer.ino` and communicates at 115200
baud with newline-terminated commands.

Normal users should use the desktop CLI. The commands below remain available
for bench testing and recovery.

| Command | Action |
|---|---|
| `R address [count]` | Read bytes |
| `D` | Print all 8192 bytes |
| `W address byte` | Protected write followed by read-back verification |
| `F address count byte` | Fill and verify a range |
| `X address count [crc]` | Calculate or compare CRC-16/CCITT-FALSE |
| `I` | Enter Intel HEX receiver mode |
| `!` | Abort Intel HEX receiver mode |
| `U` | Disable AT28C64B software protection |
| `A address` | Load and hold an address for probing |
| `S 0/1` | Hold 74HC595 SER low/high |
| `C 0/1` | Hold SRCLK low/high |
| `L 0/1` | Hold RCLK low/high |
| `K count` | Send slow SRCLK pulses; count is hexadecimal |
| `T` | Fifteen-second `/WE` hardware test at `1FFF` |

Every normal write sends the AT28C64B protected-write prefix and uses DQ7
polling followed by a full-byte comparison. The address and command timing for
software data protection uses direct ATmega328P port access so the maximum
150 microsecond byte-load interval is respected.
