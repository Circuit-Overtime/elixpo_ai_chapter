```mermaid
graph TD
    CLK[Clock Signal] --> PC[Program Counter]
    PC --> AddrBus[Address Bus]
    Control[Increment/Load/Reset] --> PC
```