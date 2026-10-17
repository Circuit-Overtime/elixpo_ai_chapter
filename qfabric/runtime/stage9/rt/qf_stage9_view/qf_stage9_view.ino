#include <Arduino_LED_Matrix.h>
#include <Arduino_RouterBridge.h>
#include <zephyr/kernel.h>

#include <cstdint>

#include "qtasks/add.qtask.h"

constexpr std::size_t QF_MATRIX_PIXELS = 104;
constexpr std::uint32_t QF_VIEW_OFF = 0;
constexpr std::uint32_t QF_VIEW_MAX = 4;
constexpr std::uint32_t QF_MIN_REFRESH_HZ = 5;
constexpr std::uint32_t QF_MAX_REFRESH_HZ = 10;

Arduino_LED_Matrix qf_matrix;
K_MUTEX_DEFINE(qf_view_mutex);

std::uint8_t qf_current_frame[QF_MATRIX_PIXELS] = {};
std::uint8_t qf_pending_frame[QF_MATRIX_PIXELS] = {};
bool qf_pending = false;
bool qf_matrix_enabled = false;
std::uint32_t qf_mode = QF_VIEW_OFF;
std::uint32_t qf_refresh_hz = 0;
std::uint32_t qf_refresh_interval_us = 0;
std::uint32_t qf_last_refresh_us = 0;
std::uint32_t qf_pending_decision_id = 0;
std::uint32_t qf_pending_health_rgb = 0;
std::uint32_t qf_pending_activity_rgb = 0;
std::uint32_t qf_submitted_frames = 0;
std::uint32_t qf_applied_frames = 0;
std::uint32_t qf_coalesced_frames = 0;
std::uint32_t qf_changed_pixels = 0;
std::uint32_t qf_last_decision_id = 0;
std::uint32_t qf_maximum_draw_us = 0;
std::uint32_t qf_last_draw_us = 0;
std::uint32_t qf_current_health_rgb = 0;
std::uint32_t qf_current_activity_rgb = 0;

std::uint32_t qf_last_epoch = 0;
std::uint32_t qf_last_invocation = 0;
std::uint64_t qf_last_execution_ns = 0;
std::uint32_t qf_last_instrumentation = 0;

void qf_set_rgb(pin_size_t red, pin_size_t green, pin_size_t blue,
                std::uint32_t packed) {
  digitalWrite(red, (packed & 0xFF0000U) != 0 ? HIGH : LOW);
  digitalWrite(green, (packed & 0x00FF00U) != 0 ? HIGH : LOW);
  digitalWrite(blue, (packed & 0x0000FFU) != 0 ? HIGH : LOW);
}

void qf_matrix_start() {
  if (!qf_matrix_enabled) {
    qf_matrix.begin();
    qf_matrix.setGrayscaleBits(3);
    qf_matrix_enabled = true;
  }
}

void qf_matrix_stop() {
  if (qf_matrix_enabled) {
    qf_matrix.clear();
    qf_matrix.end();
    qf_matrix_enabled = false;
  }
  qf_set_rgb(LED3_R, LED3_G, LED3_B, 0);
  qf_set_rgb(LED4_R, LED4_G, LED4_B, 0);
}

bool qf_stage9_configure(std::uint32_t mode, std::uint32_t refresh_hz) {
  if (mode > QF_VIEW_MAX) return false;
  if (mode == QF_VIEW_OFF && refresh_hz != 0) return false;
  if (mode != QF_VIEW_OFF &&
      (refresh_hz < QF_MIN_REFRESH_HZ || refresh_hz > QF_MAX_REFRESH_HZ)) {
    return false;
  }

  k_mutex_lock(&qf_view_mutex, K_FOREVER);
  qf_mode = mode;
  qf_refresh_hz = refresh_hz;
  qf_refresh_interval_us = refresh_hz == 0 ? 0 : 1000000U / refresh_hz;
  qf_last_refresh_us = 0;
  if (mode == QF_VIEW_OFF) {
    for (std::size_t index = 0; index < QF_MATRIX_PIXELS; ++index) {
      qf_pending_frame[index] = 0;
    }
    qf_pending_decision_id = 0;
    qf_pending_health_rgb = 0;
    qf_pending_activity_rgb = 0;
    if (qf_pending) ++qf_coalesced_frames;
    qf_pending = true;
  }
  k_mutex_unlock(&qf_view_mutex);
  return true;
}

bool qf_stage9_submit(std::uint32_t decision_id, std::uint32_t health_rgb,
                      std::uint32_t activity_rgb, String encoded_frame) {
  if (decision_id == 0 || qf_mode == QF_VIEW_OFF ||
      encoded_frame.length() != QF_MATRIX_PIXELS) {
    return false;
  }
  std::uint8_t decoded[QF_MATRIX_PIXELS];
  for (std::size_t index = 0; index < QF_MATRIX_PIXELS; ++index) {
    const char value = encoded_frame[index];
    if (value < '0' || value > '7') return false;
    decoded[index] = static_cast<std::uint8_t>(value - '0');
  }

  k_mutex_lock(&qf_view_mutex, K_FOREVER);
  if (qf_pending) ++qf_coalesced_frames;
  for (std::size_t index = 0; index < QF_MATRIX_PIXELS; ++index) {
    qf_pending_frame[index] = decoded[index];
  }
  qf_pending_decision_id = decision_id;
  qf_pending_health_rgb = health_rgb & 0xFFFFFFU;
  qf_pending_activity_rgb = activity_rgb & 0xFFFFFFU;
  qf_pending = true;
  ++qf_submitted_frames;
  k_mutex_unlock(&qf_view_mutex);
  return true;
}

std::uint32_t qf_frame_checksum() {
  std::uint32_t checksum = 0;
  for (std::size_t index = 0; index < QF_MATRIX_PIXELS; ++index) {
    checksum += static_cast<std::uint32_t>(index + 1) * qf_current_frame[index];
  }
  return checksum;
}

std::uint32_t qf_stage9_diagnostic(std::uint32_t diagnostic) {
  switch (diagnostic) {
    case 0: return qf_mode;
    case 1: return qf_refresh_hz;
    case 2: return qf_submitted_frames;
    case 3: return qf_applied_frames;
    case 4: return qf_coalesced_frames;
    case 5: return qf_changed_pixels;
    case 6: return qf_last_decision_id;
    case 7: return qf_maximum_draw_us;
    case 8: return qf_last_draw_us;
    case 9: return qf_frame_checksum();
    case 10: return qf_current_health_rgb;
    case 11: return qf_current_activity_rgb;
    default: return UINT32_MAX;
  }
}

std::int32_t qf_stage4_add_disabled(std::int32_t a, std::int32_t b) {
  return qf_task_add(a, b);
}

std::int32_t qf_stage4_add_profiled(std::uint32_t epoch, std::uint32_t invocation,
                                    std::int32_t a, std::int32_t b,
                                    std::uint32_t instrumentation) {
  qf_last_epoch = epoch;
  qf_last_invocation = invocation;
  qf_last_instrumentation = instrumentation;
  qf_last_execution_ns = 0;
  if (instrumentation != 2) return qf_task_add(a, b);
  const std::uint32_t started = k_cycle_get_32();
  const std::int32_t result = qf_task_add(a, b);
  qf_last_execution_ns = k_cyc_to_ns_floor64(k_cycle_get_32() - started);
  return result;
}

std::uint32_t qf_stage4_diagnostic(std::uint32_t diagnostic) {
  switch (diagnostic) {
    case 0: return qf_last_epoch;
    case 1: return qf_last_invocation;
    case 2: return static_cast<std::uint32_t>(qf_last_execution_ns);
    case 3: return static_cast<std::uint32_t>(qf_last_execution_ns >> 32);
    case 4: return qf_last_instrumentation;
    default: return UINT32_MAX;
  }
}

void qf_apply_pending() {
  std::uint8_t next[QF_MATRIX_PIXELS];
  std::uint32_t decision_id = 0;
  std::uint32_t health_rgb = 0;
  std::uint32_t activity_rgb = 0;
  std::uint32_t mode = QF_VIEW_OFF;

  k_mutex_lock(&qf_view_mutex, K_FOREVER);
  if (!qf_pending) {
    k_mutex_unlock(&qf_view_mutex);
    return;
  }
  for (std::size_t index = 0; index < QF_MATRIX_PIXELS; ++index) {
    next[index] = qf_pending_frame[index];
  }
  decision_id = qf_pending_decision_id;
  health_rgb = qf_pending_health_rgb;
  activity_rgb = qf_pending_activity_rgb;
  mode = qf_mode;
  qf_pending = false;
  k_mutex_unlock(&qf_view_mutex);

  std::uint32_t changed = 0;
  for (std::size_t index = 0; index < QF_MATRIX_PIXELS; ++index) {
    if (qf_current_frame[index] != next[index]) {
      qf_current_frame[index] = next[index];
      ++changed;
    }
  }
  if (mode == QF_VIEW_OFF) {
    qf_matrix_stop();
  } else {
    qf_matrix_start();
    if (changed > 0) {
      const std::uint32_t started = micros();
      qf_matrix.draw(qf_current_frame);
      qf_last_draw_us = micros() - started;
      qf_maximum_draw_us = max(qf_maximum_draw_us, qf_last_draw_us);
    } else {
      qf_last_draw_us = 0;
    }
    qf_set_rgb(LED3_R, LED3_G, LED3_B, health_rgb);
    qf_set_rgb(LED4_R, LED4_G, LED4_B, activity_rgb);
  }
  qf_changed_pixels += changed;
  qf_last_decision_id = decision_id;
  qf_current_health_rgb = health_rgb;
  qf_current_activity_rgb = activity_rgb;
  ++qf_applied_frames;
}

void setup() {
  pinMode(LED3_R, OUTPUT);
  pinMode(LED3_G, OUTPUT);
  pinMode(LED3_B, OUTPUT);
  pinMode(LED4_R, OUTPUT);
  pinMode(LED4_G, OUTPUT);
  pinMode(LED4_B, OUTPUT);
  qf_matrix_stop();

  if (!Bridge.begin()) {
    while (true) delay(1000);
  }
  Bridge.provide_safe("qf_stage9_configure", qf_stage9_configure);
  Bridge.provide_safe("qf_stage9_submit", qf_stage9_submit);
  Bridge.provide_safe("qf_stage9_diagnostic", qf_stage9_diagnostic);
  Bridge.provide_safe("qf_stage4_add_disabled", qf_stage4_add_disabled);
  Bridge.provide_safe("qf_stage4_add_profiled", qf_stage4_add_profiled);
  Bridge.provide_safe("qf_stage4_diagnostic", qf_stage4_diagnostic);
}

void loop() {
  if (qf_mode == QF_VIEW_OFF) {
    qf_apply_pending();
    delay(10);
    return;
  }
  const std::uint32_t now = micros();
  if (qf_pending &&
      (qf_last_refresh_us == 0 ||
       now - qf_last_refresh_us >= qf_refresh_interval_us)) {
    qf_last_refresh_us = now;
    qf_apply_pending();
  }
  delay(5);
}
