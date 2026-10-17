// Diffuino STM32 matrix receiver for Arduino UNO Q.

#include <Arduino_LED_Matrix.h>
#include <Arduino_RouterBridge.h>
#include <vector>
#include <zephyr/kernel.h>

Arduino_LED_Matrix matrix;
K_MUTEX_DEFINE(frame_mutex);
K_MUTEX_DEFINE(selector_mutex);

constexpr size_t FRAME_ROWS = 8;
constexpr size_t FRAME_COLS = 13;
constexpr size_t FRAME_SIZE = FRAME_ROWS * FRAME_COLS;
constexpr uint8_t BCD_PINS[] = {2, 3, 4, 5};
constexpr uint8_t TRIGGER_PIN = 6;
constexpr uint8_t RESET_PIN = 7;
constexpr unsigned long DEBOUNCE_MS = 40;

uint8_t frame[FRAME_SIZE] = {0};
bool frame_dirty = false;
int pending_digit = -1;
bool linux_ready = false;
bool selector_busy = false;
bool request_complete = false;
bool trigger_armed = true;
bool raw_button = false;
bool stable_button = false;
unsigned long last_button_change_ms = 0;
bool raw_reset = false;
bool stable_reset = false;
unsigned long last_reset_change_ms = 0;

void set_led3_color(int red, int green, int blue) {
  analogWrite(LED3_R, constrain(red, 0, 255));
  analogWrite(LED3_G, constrain(green, 0, 255));
  analogWrite(LED3_B, constrain(blue, 0, 255));
}

void set_led4_color(bool red, bool green, bool blue) {
  // The digital RGB LED is active low.
  digitalWrite(LED4_R, red ? LOW : HIGH);
  digitalWrite(LED4_G, green ? LOW : HIGH);
  digitalWrite(LED4_B, blue ? LOW : HIGH);
}

void draw(std::vector<uint8_t> next_frame) {
  if (next_frame.size() != FRAME_SIZE) {
    return;
  }
  k_mutex_lock(&frame_mutex, K_FOREVER);
  memcpy(frame, next_frame.data(), FRAME_SIZE);
  frame_dirty = true;
  k_mutex_unlock(&frame_mutex);
}

void queue_frame(const uint8_t* next_frame) {
  k_mutex_lock(&frame_mutex, K_FOREVER);
  memcpy(frame, next_frame, FRAME_SIZE);
  frame_dirty = true;
  k_mutex_unlock(&frame_mutex);
}

void show_ready() {
  // The idle smile means the complete Linux/STM32 appliance is ready.
  uint8_t ready_frame[FRAME_SIZE] = {0};
  ready_frame[2 * FRAME_COLS + 3] = 7;
  ready_frame[2 * FRAME_COLS + 9] = 7;
  ready_frame[4 * FRAME_COLS + 2] = 6;
  ready_frame[4 * FRAME_COLS + 10] = 6;
  ready_frame[5 * FRAME_COLS + 3] = 6;
  ready_frame[5 * FRAME_COLS + 9] = 6;
  ready_frame[6 * FRAME_COLS + 4] = 6;
  ready_frame[6 * FRAME_COLS + 5] = 6;
  ready_frame[6 * FRAME_COLS + 6] = 6;
  ready_frame[6 * FRAME_COLS + 7] = 6;
  ready_frame[6 * FRAME_COLS + 8] = 6;
  for (size_t column = 5; column <= 7; ++column) {
    ready_frame[7 * FRAME_COLS + column] = 3;
  }
  queue_frame(ready_frame);
  set_led3_color(0, 0, 0);
  set_led4_color(false, true, false);
}

int read_bcd() {
  int value = 0;
  for (size_t bit = 0; bit < 4; ++bit) {
    if (digitalRead(BCD_PINS[bit]) == HIGH) {
      value |= 1 << bit;
    }
  }
  return value;
}

void selector_ready() {
  k_mutex_lock(&selector_mutex, K_FOREVER);
  linux_ready = true;
  pending_digit = -1;
  selector_busy = false;
  request_complete = false;
  trigger_armed = !stable_button;
  k_mutex_unlock(&selector_mutex);
  show_ready();
}

int poll_digit() {
  k_mutex_lock(&selector_mutex, K_FOREVER);
  int result = pending_digit;
  pending_digit = -1;
  k_mutex_unlock(&selector_mutex);
  return result;
}

void complete_request(bool success) {
  set_led4_color(!success, success, false);
  k_mutex_lock(&selector_mutex, K_FOREVER);
  request_complete = true;
  k_mutex_unlock(&selector_mutex);
}

void setup() {
  pinMode(LED3_R, OUTPUT);
  pinMode(LED3_G, OUTPUT);
  pinMode(LED3_B, OUTPUT);
  pinMode(LED4_R, OUTPUT);
  pinMode(LED4_G, OUTPUT);
  pinMode(LED4_B, OUTPUT);
  set_led3_color(0, 0, 0);
  set_led4_color(false, false, false);
  for (uint8_t pin : BCD_PINS) {
    pinMode(pin, INPUT_PULLDOWN);
  }
  pinMode(TRIGGER_PIN, INPUT_PULLDOWN);
  pinMode(RESET_PIN, INPUT_PULLDOWN);

  matrix.begin();
  matrix.setGrayscaleBits(3);

  // A short border confirms that the STM32 sketch booted independently of
  // Linux inference and Bridge RPC readiness.
  uint8_t boot_frame[FRAME_SIZE] = {0};
  for (size_t column = 0; column < FRAME_COLS; ++column) {
    boot_frame[column] = 2;
    boot_frame[(FRAME_ROWS - 1) * FRAME_COLS + column] = 2;
  }
  for (size_t row = 0; row < FRAME_ROWS; ++row) {
    boot_frame[row * FRAME_COLS] = 2;
    boot_frame[row * FRAME_COLS + FRAME_COLS - 1] = 2;
  }
  matrix.draw(boot_frame);
  delay(500);
  matrix.clear();
  Bridge.begin();
  Bridge.provide("draw", draw);
  Bridge.provide("set_led3_color", set_led3_color);
  Bridge.provide("set_led4_color", set_led4_color);
  Bridge.provide("selector_ready", selector_ready);
  Bridge.provide("poll_digit", poll_digit);
  Bridge.provide("complete_request", complete_request);
}

void loop() {
  bool observed_button = digitalRead(TRIGGER_PIN) == HIGH;
  unsigned long now = millis();
  if (observed_button != raw_button) {
    raw_button = observed_button;
    last_button_change_ms = now;
  }

  k_mutex_lock(&selector_mutex, K_FOREVER);
  bool stable_button_snapshot = stable_button;
  k_mutex_unlock(&selector_mutex);
  if (raw_button != stable_button_snapshot &&
      now - last_button_change_ms >= DEBOUNCE_MS) {
    bool pressed = raw_button;
    k_mutex_lock(&selector_mutex, K_FOREVER);
    stable_button = pressed;
    if (pressed) {
      if (linux_ready && !selector_busy && trigger_armed) {
        pending_digit = read_bcd();
        selector_busy = true;
        request_complete = false;
        trigger_armed = false;
        set_led4_color(false, false, true);
      }
    } else if (!selector_busy) {
      trigger_armed = true;
    }
    k_mutex_unlock(&selector_mutex);
  }

  bool observed_reset = digitalRead(RESET_PIN) == HIGH;
  if (observed_reset != raw_reset) {
    raw_reset = observed_reset;
    last_reset_change_ms = now;
  }
  k_mutex_lock(&selector_mutex, K_FOREVER);
  bool stable_reset_snapshot = stable_reset;
  k_mutex_unlock(&selector_mutex);
  bool reset_accepted = false;
  if (raw_reset != stable_reset_snapshot &&
      now - last_reset_change_ms >= DEBOUNCE_MS) {
    bool reset_pressed = raw_reset;
    k_mutex_lock(&selector_mutex, K_FOREVER);
    stable_reset = reset_pressed;
    if (reset_pressed && linux_ready &&
        (!selector_busy || request_complete)) {
      pending_digit = -1;
      selector_busy = false;
      request_complete = false;
      trigger_armed = !stable_button;
      reset_accepted = true;
    }
    k_mutex_unlock(&selector_mutex);
  }
  if (reset_accepted) {
    show_ready();
  }

  k_mutex_lock(&frame_mutex, K_FOREVER);
  if (frame_dirty) {
    matrix.draw(frame);
    frame_dirty = false;
  }
  k_mutex_unlock(&frame_mutex);
  delay(5);
}
