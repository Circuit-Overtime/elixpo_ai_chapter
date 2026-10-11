/*
 * Arduino Nano programmer for an 8 KiB 28C64 parallel EEPROM.
 *
 * Address bus: two cascaded 74HC595s (D2 data, D3 clock, D4 latch)
 * Data bus:    EEPROM I/O0..I/O7 -> Arduino D5..D12
 * Controls:    /WE -> D13, /OE -> A0, /CE -> A3
 *
 * The 74HC595 nearest the Arduino receives A0..A7.  Its QH' feeds the
 * second 74HC595, whose QA..QE provide A8..A12.
 */

#include <Arduino.h>
#include <ctype.h>
#include <stdlib.h>
#include <string.h>

constexpr uint8_t SHIFT_DATA_PIN  = 2;
constexpr uint8_t SHIFT_CLOCK_PIN = 3;
constexpr uint8_t SHIFT_LATCH_PIN = 4;
constexpr uint8_t DATA_FIRST_PIN  = 5;
constexpr uint8_t WRITE_ENABLE_PIN = 13;
constexpr uint8_t OUTPUT_ENABLE_PIN = A0;
constexpr uint8_t CHIP_ENABLE_PIN = A3;
// A6/A7 on the Nano are analog-input-only and cannot drive an LED.
constexpr uint8_t STATUS_LED_PIN = A5;

constexpr uint16_t EEPROM_SIZE = 8192;
constexpr uint16_t WRITE_TIMEOUT_MS = 20;

char commandLine[96];
uint8_t commandLength = 0;
bool intelHexMode = false;
uint16_t intelHexBytesWritten = 0;
uint16_t intelHexRecordsWritten = 0;

void flashStatus(uint8_t count, uint16_t onMs, uint16_t offMs) {
  for (uint8_t i = 0; i < count; ++i) {
    digitalWrite(STATUS_LED_PIN, HIGH);
    delay(onMs);
    digitalWrite(STATUS_LED_PIN, LOW);
    if (i + 1 < count) delay(offMs);
  }
}

void signalReady() { flashStatus(2, 80, 100); }
void signalSuccess() { flashStatus(3, 120, 120); }
void signalError() { flashStatus(5, 50, 60); }

void setDataBusInput() {
  for (uint8_t bit = 0; bit < 8; ++bit) {
    pinMode(DATA_FIRST_PIN + bit, INPUT);
  }
}

void setDataBusOutput(uint8_t value) {
  for (uint8_t bit = 0; bit < 8; ++bit) {
    pinMode(DATA_FIRST_PIN + bit, OUTPUT);
    digitalWrite(DATA_FIRST_PIN + bit, (value >> bit) & 1U);
  }
}

uint8_t sampleDataBus() {
  uint8_t value = 0;
  for (uint8_t bit = 0; bit < 8; ++bit) {
    value |= (digitalRead(DATA_FIRST_PIN + bit) ? 1U : 0U) << bit;
  }
  return value;
}

void setAddress(uint16_t address) {
  address &= 0x1FFF;
  digitalWrite(SHIFT_LATCH_PIN, LOW);
  // The first byte shifted travels to the far 595 (A8..A12).
  shiftOut(SHIFT_DATA_PIN, SHIFT_CLOCK_PIN, MSBFIRST, highByte(address));
  shiftOut(SHIFT_DATA_PIN, SHIFT_CLOCK_PIN, MSBFIRST, lowByte(address));
  digitalWrite(SHIFT_LATCH_PIN, HIGH);
}

// Fast AVR-only versions are used for the six-byte SDP command. Every command
// byte must begin within the AT28C64B's 150 us byte-load window.
void setAddressFast(uint16_t address) {
  address &= 0x1FFF;
  PORTD &= ~_BV(PD4);  // latch low (D4)
  for (int8_t bit = 15; bit >= 0; --bit) {
    if (address & ((uint16_t)1 << bit)) PORTD |= _BV(PD2);
    else PORTD &= ~_BV(PD2);
    PORTD |= _BV(PD3);   // clock high (D3)
    PORTD &= ~_BV(PD3);  // clock low
  }
  PORTD |= _BV(PD4);   // latch high
}

void setDataBusOutputFast(uint8_t value) {
  // I/O0..2 are D5..7 (PORTD 5..7); I/O3..7 are D8..12 (PORTB 0..4).
  PORTD = (PORTD & 0x1F) | ((value & 0x07) << 5);
  PORTB = (PORTB & 0xE0) | ((value >> 3) & 0x1F);
  DDRD |= 0xE0;
  DDRB |= 0x1F;
}

void loadSdpCommandByte(uint16_t address, uint8_t value) {
  setAddressFast(address);
  setDataBusOutputFast(value);
  delayMicroseconds(1);
  PORTB &= ~_BV(PB5);  // /WE low on D13
  delayMicroseconds(1);
  PORTB |= _BV(PB5);   // /WE high; byte is latched
}

void disableSoftwareProtection() {
  digitalWrite(STATUS_LED_PIN, HIGH);
  digitalWrite(OUTPUT_ENABLE_PIN, HIGH);
  digitalWrite(WRITE_ENABLE_PIN, HIGH);

  // Keep interrupts from violating the 150 us maximum gap between bytes.
  const uint8_t savedSreg = SREG;
  noInterrupts();
  loadSdpCommandByte(0x1555, 0xAA);
  loadSdpCommandByte(0x0AAA, 0x55);
  loadSdpCommandByte(0x1555, 0x80);
  loadSdpCommandByte(0x1555, 0xAA);
  loadSdpCommandByte(0x0AAA, 0x55);
  loadSdpCommandByte(0x1555, 0x20);
  SREG = savedSreg;

  setDataBusInput();
  delay(12);  // tWC is at most 10 ms for AT28C64B.
  digitalWrite(STATUS_LED_PIN, LOW);
}

uint8_t readByte(uint16_t address) {
  digitalWrite(WRITE_ENABLE_PIN, HIGH);
  digitalWrite(OUTPUT_ENABLE_PIN, HIGH);
  setDataBusInput();
  setAddress(address);
  digitalWrite(OUTPUT_ENABLE_PIN, LOW);
  delayMicroseconds(1);
  const uint8_t value = sampleDataBus();
  digitalWrite(OUTPUT_ENABLE_PIN, HIGH);
  return value;
}

bool waitForWrite(uint16_t address, uint8_t expected) {
  const unsigned long started = millis();
  while (millis() - started < WRITE_TIMEOUT_MS) {
    // During programming DQ7 is the complement of the written DQ7.
    if ((readByte(address) & 0x80) == (expected & 0x80)) {
      return true;
    }
  }
  return false;
}

bool writeByte(uint16_t address, uint8_t value) {
  if (address >= EEPROM_SIZE) return false;

  digitalWrite(STATUS_LED_PIN, HIGH);
  digitalWrite(OUTPUT_ENABLE_PIN, HIGH);
  digitalWrite(WRITE_ENABLE_PIN, HIGH);

  // The AA/55/A0 prefix permits a write whether SDP is already enabled or
  // disabled. The target byte must follow within the 150 us load window.
  const uint8_t savedSreg = SREG;
  noInterrupts();
  loadSdpCommandByte(0x1555, 0xAA);
  loadSdpCommandByte(0x0AAA, 0x55);
  loadSdpCommandByte(0x1555, 0xA0);
  loadSdpCommandByte(address, value);
  SREG = savedSreg;

  setDataBusInput();

  if (!waitForWrite(address, value)) {
    digitalWrite(STATUS_LED_PIN, LOW);
    return false;
  }
  const bool verified = readByte(address) == value;
  digitalWrite(STATUS_LED_PIN, LOW);
  return verified;
}

void flashComplete() {
  signalSuccess();
}

void runSlowHardwareTest() {
  constexpr uint16_t testAddress = 0x1FFF;
  constexpr uint8_t testValue = 0xA5;

  digitalWrite(OUTPUT_ENABLE_PIN, HIGH);
  digitalWrite(WRITE_ENABLE_PIN, HIGH);
  setAddress(testAddress);
  setDataBusOutput(testValue);

  Serial.print(F("BUS driven A5, Nano reads "));
  printHexByte(sampleDataBus());
  Serial.println();
  Serial.println(F("TEST: /WE LOW on EEPROM pin 27 for 15 seconds (LED on)"));
  Serial.flush();

  digitalWrite(STATUS_LED_PIN, HIGH);
  digitalWrite(WRITE_ENABLE_PIN, LOW);
  delay(15000);
  digitalWrite(WRITE_ENABLE_PIN, HIGH);
  digitalWrite(STATUS_LED_PIN, LOW);
  setDataBusInput();

  delay(12);
  Serial.print(F("TEST: read 1FFF = "));
  printHexByte(readByte(testAddress));
  Serial.println(F(" (expected A5)"));
}

void runAddressHardwareTest() {
  digitalWrite(CHIP_ENABLE_PIN, HIGH);
  digitalWrite(OUTPUT_ENABLE_PIN, HIGH);
  digitalWrite(WRITE_ENABLE_PIN, HIGH);
  setDataBusInput();

  digitalWrite(SHIFT_LATCH_PIN, LOW);
  digitalWrite(SHIFT_CLOCK_PIN, LOW);
  digitalWrite(SHIFT_DATA_PIN, HIGH);
  Serial.println(F("ADDR TEST: D2/SER HIGH for 5 seconds"));
  Serial.flush();
  delay(5000);

  Serial.println(F("ADDR TEST: sending sixteen slow clock pulses on D3"));
  Serial.flush();
  for (uint8_t i = 0; i < 16; ++i) {
    digitalWrite(SHIFT_CLOCK_PIN, HIGH);
    delay(250);
    digitalWrite(SHIFT_CLOCK_PIN, LOW);
    delay(250);
  }

  digitalWrite(SHIFT_LATCH_PIN, HIGH);
  digitalWrite(STATUS_LED_PIN, HIGH);
  Serial.println(F("ADDR TEST: 1FFF latched for 15 seconds (LED on)"));
  Serial.flush();
  delay(15000);

  digitalWrite(SHIFT_LATCH_PIN, LOW);
  digitalWrite(SHIFT_DATA_PIN, LOW);
  for (uint8_t i = 0; i < 16; ++i) {
    digitalWrite(SHIFT_CLOCK_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(SHIFT_CLOCK_PIN, LOW);
    delayMicroseconds(10);
  }
  digitalWrite(SHIFT_LATCH_PIN, HIGH);
  digitalWrite(STATUS_LED_PIN, LOW);
  Serial.println(F("ADDR TEST: 0000 latched for 15 seconds (LED off)"));
  Serial.flush();
  delay(15000);

  digitalWrite(CHIP_ENABLE_PIN, LOW);
  Serial.println(F("ADDR TEST: complete"));
}

void printHexByte(uint8_t value) {
  if (value < 0x10) Serial.print('0');
  Serial.print(value, HEX);
}

void printHexAddress(uint16_t value) {
  if (value < 0x1000) Serial.print('0');
  if (value < 0x0100) Serial.print('0');
  if (value < 0x0010) Serial.print('0');
  Serial.print(value, HEX);
}

void dumpRange(uint16_t start, uint16_t count) {
  if (start >= EEPROM_SIZE) return;
  if (count > EEPROM_SIZE - start) count = EEPROM_SIZE - start;
  for (uint16_t offset = 0; offset < count; offset += 16) {
    printHexAddress(start + offset);
    Serial.print(F(": "));
    const uint16_t remaining = count - offset;
    const uint8_t row = remaining < 16 ? remaining : 16;
    for (uint8_t i = 0; i < row; ++i) {
      printHexByte(readByte(start + offset + i));
      Serial.write(' ');
    }
    Serial.println();
  }
}

uint16_t crc16Range(uint16_t start, uint16_t count) {
  uint16_t crc = 0xFFFF;
  for (uint16_t offset = 0; offset < count; ++offset) {
    crc ^= (uint16_t)readByte(start + offset) << 8;
    for (uint8_t bit = 0; bit < 8; ++bit) {
      crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return crc;
}

bool parseNumber(const char *text, uint16_t &value) {
  if (!text || !*text) return false;
  char *end = nullptr;
  const unsigned long parsed = strtoul(text, &end, 16);
  if (*end != '\0' || parsed > 0xFFFFUL) return false;
  value = (uint16_t)parsed;
  return true;
}

int8_t hexNibble(char c) {
  c = toupper(c);
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

bool hexPair(const char *text, uint8_t &value) {
  const int8_t high = hexNibble(text[0]);
  const int8_t low = hexNibble(text[1]);
  if (high < 0 || low < 0) return false;
  value = (uint8_t)((high << 4) | low);
  return true;
}

void processIntelHex(char *line) {
  if (!strcmp(line, "!")) {
    intelHexMode = false;
    signalError();
    Serial.println(F("ERR Intel HEX mode aborted"));
    return;
  }
  if (line[0] != ':') {
    signalError();
    Serial.println(F("ERR expected ':' record"));
    return;
  }

  const size_t chars = strlen(line);
  if (chars < 11 || ((chars - 1) & 1U)) {
    signalError();
    Serial.println(F("ERR malformed HEX record"));
    return;
  }

  uint8_t length, addrHigh, addrLow, type;
  if (!hexPair(line + 1, length) || !hexPair(line + 3, addrHigh) ||
      !hexPair(line + 5, addrLow) || !hexPair(line + 7, type)) {
    signalError();
    Serial.println(F("ERR non-hex character"));
    return;
  }
  if (length > 32 || chars != (size_t)(11 + 2 * length)) {
    signalError();
    Serial.println(F("ERR record too long or wrong length (max 32 bytes)"));
    return;
  }

  uint8_t bytes[32];
  uint8_t sum = length + addrHigh + addrLow + type;
  for (uint8_t i = 0; i < length; ++i) {
    if (!hexPair(line + 9 + 2 * i, bytes[i])) {
      signalError();
      Serial.println(F("ERR non-hex data"));
      return;
    }
    sum += bytes[i];
  }
  uint8_t checksum;
  if (!hexPair(line + 9 + 2 * length, checksum) || (uint8_t)(sum + checksum) != 0) {
    signalError();
    Serial.println(F("ERR checksum"));
    return;
  }

  if (type == 0x01) {
    intelHexMode = false;
    Serial.print(F("OK EOF; programmed and verified "));
    Serial.print(intelHexBytesWritten);
    Serial.print(F(" bytes in "));
    Serial.print(intelHexRecordsWritten);
    Serial.println(F(" records"));
    flashComplete();
    return;
  }
  if (type != 0x00) {
    signalError();
    Serial.println(F("ERR only data (00) and EOF (01) records are supported"));
    return;
  }

  const uint16_t address = ((uint16_t)addrHigh << 8) | addrLow;
  if ((uint32_t)address + length > EEPROM_SIZE) {
    signalError();
    Serial.println(F("ERR record outside 0000-1FFF"));
    return;
  }
  for (uint8_t i = 0; i < length; ++i) {
    if (!writeByte(address + i, bytes[i])) {
      signalError();
      Serial.print(F("ERR write/verify at "));
      printHexAddress(address + i);
      Serial.println(F(" (device may have software protection enabled)"));
      return;
    }
  }
  intelHexBytesWritten += length;
  ++intelHexRecordsWritten;
  Serial.print(F("OK "));
  printHexAddress(address);
  Serial.print('-');
  printHexAddress(address + length - 1);
  Serial.println();
}

void showHelp() {
  Serial.println(F("Commands use hexadecimal numbers:"));
  Serial.println(F("  R address [count]  read (default count 1)"));
  Serial.println(F("  D                  dump all 8192 bytes"));
  Serial.println(F("  X address count [crc]  CRC16; optional expected value"));
  Serial.println(F("  W address byte     protected write and verify"));
  Serial.println(F("  F address count byte  protected fill and verify"));
  Serial.println(F("  U                  disable AT28C64B software protection"));
  Serial.println(F("  T                  slow one-byte hardware write test"));
  Serial.println(F("  S 0|1              hold SER/D2 low or high"));
  Serial.println(F("  C 0|1              hold SRCLK/D3 low or high"));
  Serial.println(F("  L 0|1              hold RCLK/D4 low or high"));
  Serial.println(F("  K count            pulse SRCLK slowly (count is hex)"));
  Serial.println(F("  A address          load and hold a 13-bit address"));
  Serial.println(F("  I                  enter Intel HEX mode (max 32 data bytes/record)"));
  Serial.println(F("                     send ! to abort HEX mode"));
  Serial.println(F("  H                  show this help"));
}

void processCommand(char *line) {
  char *command = strtok(line, " \t");
  if (!command) return;
  const char op = toupper(command[0]);

  if (op == 'H' || op == '?') {
    showHelp();
  } else if (op == 'D') {
    dumpRange(0, EEPROM_SIZE);
  } else if (op == 'I') {
    intelHexMode = true;
    intelHexBytesWritten = 0;
    intelHexRecordsWritten = 0;
    digitalWrite(STATUS_LED_PIN, HIGH);
    delay(300);
    digitalWrite(STATUS_LED_PIN, LOW);
    Serial.println(F("READY for Intel HEX"));
  } else if (op == 'U') {
    disableSoftwareProtection();
    Serial.println(F("OK AT28C64B protection-disable sequence sent"));
  } else if (op == 'T') {
    runSlowHardwareTest();
  } else if (op == 'A') {
    uint16_t address;
    if (!parseNumber(strtok(nullptr, " \t"), address) || address >= EEPROM_SIZE) {
      Serial.println(F("ERR usage: A address (0000-1FFF)"));
      return;
    }
    setAddress(address);
    Serial.print(F("OK address held at "));
    printHexAddress(address);
    Serial.println();
  } else if (op == 'S' || op == 'C' || op == 'L') {
    uint16_t level;
    if (!parseNumber(strtok(nullptr, " \t"), level) || level > 1) {
      Serial.println(F("ERR usage: S/C/L 0|1"));
      return;
    }
    const uint8_t pin = op == 'S' ? SHIFT_DATA_PIN :
                        op == 'C' ? SHIFT_CLOCK_PIN : SHIFT_LATCH_PIN;
    digitalWrite(pin, level ? HIGH : LOW);
    Serial.print(F("OK "));
    Serial.print(op == 'S' ? F("SER/D2") : op == 'C' ? F("SRCLK/D3") : F("RCLK/D4"));
    Serial.print(F(" commanded "));
    Serial.print(level ? F("HIGH, reads ") : F("LOW, reads "));
    Serial.println(digitalRead(pin) ? F("HIGH") : F("LOW"));
  } else if (op == 'K') {
    uint16_t count;
    if (!parseNumber(strtok(nullptr, " \t"), count) || count == 0 || count > 0x100) {
      Serial.println(F("ERR usage: K count (0001-0100)"));
      return;
    }
    digitalWrite(SHIFT_CLOCK_PIN, LOW);
    for (uint16_t i = 0; i < count; ++i) {
      digitalWrite(SHIFT_CLOCK_PIN, HIGH);
      delay(250);
      digitalWrite(SHIFT_CLOCK_PIN, LOW);
      delay(250);
    }
    Serial.print(F("OK sent "));
    Serial.print(count, HEX);
    Serial.println(F(" clock pulses"));
  } else if (op == 'R') {
    uint16_t address, count = 1;
    if (!parseNumber(strtok(nullptr, " \t"), address)) {
      Serial.println(F("ERR usage: R address [count]"));
      return;
    }
    char *countText = strtok(nullptr, " \t");
    if (countText && !parseNumber(countText, count)) {
      Serial.println(F("ERR invalid count"));
      return;
    }
    dumpRange(address, count);
  } else if (op == 'X') {
    uint16_t address, count;
    if (!parseNumber(strtok(nullptr, " \t"), address) ||
        !parseNumber(strtok(nullptr, " \t"), count) || count == 0 ||
        (uint32_t)address + count > EEPROM_SIZE) {
      Serial.println(F("ERR usage/range: X address count [crc]"));
      signalError();
      return;
    }
    const uint16_t crc = crc16Range(address, count);
    Serial.print(F("CRC16 "));
    printHexAddress(crc);
    char *expectedText = strtok(nullptr, " \t");
    if (expectedText) {
      uint16_t expected;
      if (!parseNumber(expectedText, expected)) {
        Serial.println(F(" ERR invalid expected CRC"));
        signalError();
        return;
      }
      if (crc == expected) {
        Serial.println(F(" OK"));
        signalSuccess();
      } else {
        Serial.print(F(" ERR expected "));
        printHexAddress(expected);
        Serial.println();
        signalError();
      }
    } else {
      Serial.println();
    }
  } else if (op == 'W') {
    uint16_t address, value;
    if (!parseNumber(strtok(nullptr, " \t"), address) ||
        !parseNumber(strtok(nullptr, " \t"), value) || value > 0xFF) {
      Serial.println(F("ERR usage: W address byte"));
      return;
    }
    if (writeByte(address, (uint8_t)value)) {
      Serial.println(F("OK"));
      signalSuccess();
    } else {
      Serial.println(F("ERR write/verify failed"));
      signalError();
    }
  } else if (op == 'F') {
    uint16_t address, count, value;
    if (!parseNumber(strtok(nullptr, " \t"), address) ||
        !parseNumber(strtok(nullptr, " \t"), count) ||
        !parseNumber(strtok(nullptr, " \t"), value) || value > 0xFF ||
        (uint32_t)address + count > EEPROM_SIZE) {
      Serial.println(F("ERR usage/range: F address count byte"));
      return;
    }
    for (uint16_t i = 0; i < count; ++i) {
      if (!writeByte(address + i, (uint8_t)value)) {
        Serial.print(F("ERR at "));
        printHexAddress(address + i);
        Serial.println();
        signalError();
        return;
      }
    }
    Serial.println(F("OK"));
    signalSuccess();
  } else {
    Serial.println(F("ERR unknown command; use H"));
  }
}

void setup() {
  // Preload HIGH before changing these pins to outputs. /WE must never glitch low.
  digitalWrite(WRITE_ENABLE_PIN, HIGH);
  digitalWrite(OUTPUT_ENABLE_PIN, HIGH);
  digitalWrite(CHIP_ENABLE_PIN, HIGH);
  pinMode(WRITE_ENABLE_PIN, OUTPUT);
  pinMode(OUTPUT_ENABLE_PIN, OUTPUT);
  pinMode(CHIP_ENABLE_PIN, OUTPUT);
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);

  pinMode(SHIFT_DATA_PIN, OUTPUT);
  pinMode(SHIFT_CLOCK_PIN, OUTPUT);
  pinMode(SHIFT_LATCH_PIN, OUTPUT);
  digitalWrite(SHIFT_CLOCK_PIN, LOW);
  digitalWrite(SHIFT_LATCH_PIN, HIGH);
  setDataBusInput();
  setAddress(0);
  digitalWrite(CHIP_ENABLE_PIN, LOW);

  Serial.begin(115200);
  while (!Serial) {}
  Serial.println(F("28C64 programmer v10 ready. Type H for help."));
  signalReady();
}

void loop() {
  while (Serial.available()) {
    const char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      commandLine[commandLength] = '\0';
      if (commandLength) {
        if (intelHexMode) processIntelHex(commandLine);
        else processCommand(commandLine);
      }
      commandLength = 0;
    } else if (commandLength < sizeof(commandLine) - 1) {
      commandLine[commandLength++] = c;
    } else {
      commandLength = 0;
      Serial.println(F("ERR line too long"));
    }
  }
}
