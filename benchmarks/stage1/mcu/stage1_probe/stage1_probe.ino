#include <Arduino_LED_Matrix.h>
#include <Arduino_RouterBridge.h>

Arduino_LED_Matrix qf_matrix;

constexpr size_t QF_MATRIX_ROWS = 8;
constexpr size_t QF_MATRIX_COLUMNS = 13;
constexpr size_t QF_MATRIX_PIXELS = QF_MATRIX_ROWS * QF_MATRIX_COLUMNS;
constexpr uint32_t QF_RESOURCE_KERNEL_HEAP_BYTES = 0;
constexpr uint32_t QF_RESOURCE_MAIN_STACK_BYTES = 1;
constexpr uint32_t QF_RESOURCE_BRIDGE_STACK_BYTES = 2;
constexpr uint32_t QF_RESOURCE_DECODER_BUFFER_BYTES = 3;
constexpr uint32_t QF_RESOURCE_REQUEST_BUFFER_BYTES = 4;
constexpr uint32_t QF_RESOURCE_CAPABILITIES = 5;

constexpr uint32_t QF_DIAGNOSTIC_REQUEST_COUNT = 0;
constexpr uint32_t QF_DIAGNOSTIC_LOOP_ITERATIONS = 1;
constexpr uint32_t QF_DIAGNOSTIC_MAX_LOOP_GAP_US = 2;
constexpr uint32_t QF_DIAGNOSTIC_UPTIME_US = 3;

constexpr uint32_t QF_MATRIX_PROFILE_DISABLED = 0;
constexpr uint32_t QF_MATRIX_PROFILE_STATIC = 1;
constexpr uint32_t QF_MATRIX_PROFILE_REFRESH = 2;
constexpr uint32_t QF_MATRIX_PROFILE_MAX_REFRESH_HZ = 120;

constexpr uint32_t QF_MATRIX_PROFILE_DIAGNOSTIC_MODE = 0;
constexpr uint32_t QF_MATRIX_PROFILE_DIAGNOSTIC_TARGET_HZ = 1;
constexpr uint32_t QF_MATRIX_PROFILE_DIAGNOSTIC_UPDATE_COUNT = 2;
constexpr uint32_t QF_MATRIX_PROFILE_DIAGNOSTIC_MAX_DRAW_US = 3;

uint8_t qf_frame[QF_MATRIX_PIXELS] = {};

enum class QfReverseState : uint8_t {
  idle = 0,
  pending = 1,
  running = 2,
  ready = 3,
  error = 4,
};

QfReverseState qf_reverse_state = QfReverseState::idle;
uint32_t qf_reverse_token = 0;
uint32_t qf_reverse_duration_us = 0;
atomic_t qf_request_count = ATOMIC_INIT(0);
uint32_t qf_loop_iterations = 0;
uint32_t qf_max_loop_gap_us = 0;
uint32_t qf_last_loop_us = 0;
bool qf_matrix_enabled = false;
uint32_t qf_matrix_profile_mode = QF_MATRIX_PROFILE_STATIC;
uint32_t qf_matrix_target_refresh_hz = 0;
uint32_t qf_matrix_refresh_interval_us = 0;
uint32_t qf_matrix_last_refresh_us = 0;
uint32_t qf_matrix_refresh_count = 0;
uint32_t qf_matrix_max_draw_us = 0;
uint32_t qf_matrix_seed = 0;

void qf_count_request() {
  atomic_inc(&qf_request_count);
}

String qf_stage1_echo(String payload) {
  qf_count_request();
  return payload;
}

void qf_matrix_enable() {
  if (!qf_matrix_enabled) {
    qf_matrix.begin();
    qf_matrix.setGrayscaleBits(3);
    qf_matrix_enabled = true;
  }
}

void qf_matrix_fill_frame(uint32_t seed) {
  for (size_t index = 0; index < QF_MATRIX_PIXELS; ++index) {
    qf_frame[index] = static_cast<uint8_t>((seed + index) & 0x07U);
  }
}

uint32_t qf_matrix_draw_frame(uint32_t seed) {
  qf_matrix_enable();
  qf_matrix_fill_frame(seed);
  const uint32_t started = micros();
  qf_matrix.draw(qf_frame);
  return micros() - started;
}

uint32_t qf_stage1_micros() {
  qf_count_request();
  return micros();
}

uint32_t qf_stage1_matrix_draw(uint32_t seed) {
  qf_count_request();
  return qf_matrix_draw_frame(seed);
}

bool qf_stage1_matrix_profile_configure(uint32_t mode, uint32_t refresh_hz) {
  qf_count_request();
  if (mode > QF_MATRIX_PROFILE_REFRESH) {
    return false;
  }
  if (mode != QF_MATRIX_PROFILE_REFRESH && refresh_hz != 0) {
    return false;
  }
  if (mode == QF_MATRIX_PROFILE_REFRESH &&
      (refresh_hz == 0 || refresh_hz > QF_MATRIX_PROFILE_MAX_REFRESH_HZ)) {
    return false;
  }

  qf_matrix_refresh_count = 0;
  qf_matrix_max_draw_us = 0;
  qf_matrix_seed = 0;
  qf_matrix_target_refresh_hz = refresh_hz;
  qf_matrix_refresh_interval_us =
      refresh_hz == 0 ? 0 : 1000000U / refresh_hz;
  qf_matrix_last_refresh_us = micros();
  qf_matrix_profile_mode = mode;

  if (mode == QF_MATRIX_PROFILE_DISABLED) {
    if (qf_matrix_enabled) {
      qf_matrix.clear();
      qf_matrix.end();
      qf_matrix_enabled = false;
    }
    return true;
  }

  qf_matrix_enable();
  qf_matrix_draw_frame(0);
  return true;
}

uint32_t qf_stage1_matrix_profile_diagnostic(uint32_t diagnostic) {
  qf_count_request();
  switch (diagnostic) {
    case QF_MATRIX_PROFILE_DIAGNOSTIC_MODE:
      return qf_matrix_profile_mode;
    case QF_MATRIX_PROFILE_DIAGNOSTIC_TARGET_HZ:
      return qf_matrix_target_refresh_hz;
    case QF_MATRIX_PROFILE_DIAGNOSTIC_UPDATE_COUNT:
      return qf_matrix_refresh_count;
    case QF_MATRIX_PROFILE_DIAGNOSTIC_MAX_DRAW_US:
      return qf_matrix_max_draw_us;
    default:
      return 0;
  }
}

bool qf_stage1_reverse_start(uint32_t token) {
  qf_count_request();
  if (qf_reverse_state != QfReverseState::idle) {
    return false;
  }

  qf_reverse_token = token;
  qf_reverse_duration_us = 0;
  qf_reverse_state = QfReverseState::pending;
  return true;
}

int32_t qf_stage1_reverse_result(uint32_t token) {
  qf_count_request();
  if (token != qf_reverse_token) {
    return -3;
  }
  if (qf_reverse_state == QfReverseState::pending ||
      qf_reverse_state == QfReverseState::running) {
    return -1;
  }
  if (qf_reverse_state == QfReverseState::error) {
    qf_reverse_state = QfReverseState::idle;
    return -2;
  }
  if (qf_reverse_state != QfReverseState::ready) {
    return -4;
  }

  const uint32_t duration_us = qf_reverse_duration_us;
  qf_reverse_state = QfReverseState::idle;
  return static_cast<int32_t>(duration_us);
}

uint32_t qf_stage1_resource_constant(uint32_t resource) {
  switch (resource) {
    case QF_RESOURCE_KERNEL_HEAP_BYTES:
      return CONFIG_HEAP_MEM_POOL_SIZE;
    case QF_RESOURCE_MAIN_STACK_BYTES:
      return CONFIG_MAIN_STACK_SIZE;
    case QF_RESOURCE_BRIDGE_STACK_BYTES:
      return UPDATE_THREAD_STACK_SIZE;
    case QF_RESOURCE_DECODER_BUFFER_BYTES:
      return DECODER_BUFFER_SIZE;
    case QF_RESOURCE_REQUEST_BUFFER_BYTES:
      return BRIDGE_RPC_BUFFER_SIZE;
    case QF_RESOURCE_CAPABILITIES: {
      uint32_t capabilities = 0;
#if defined(CONFIG_INIT_STACKS) && defined(CONFIG_THREAD_STACK_INFO)
      capabilities |= 1U << 0;
#endif
#if defined(CONFIG_SYS_HEAP_RUNTIME_STATS)
      capabilities |= 1U << 1;
#endif
#if defined(CONFIG_THREAD_RUNTIME_STATS)
      capabilities |= 1U << 2;
#endif
      return capabilities;
    }
    default:
      return 0;
  }
}

uint32_t qf_stage1_diagnostic(uint32_t diagnostic) {
  switch (diagnostic) {
    case QF_DIAGNOSTIC_REQUEST_COUNT:
      return static_cast<uint32_t>(atomic_get(&qf_request_count));
    case QF_DIAGNOSTIC_LOOP_ITERATIONS:
      return qf_loop_iterations;
    case QF_DIAGNOSTIC_MAX_LOOP_GAP_US:
      return qf_max_loop_gap_us;
    case QF_DIAGNOSTIC_UPTIME_US:
      return micros();
    default:
      return 0;
  }
}

bool qf_stage1_reset_diagnostics() {
  atomic_set(&qf_request_count, 0);
  qf_loop_iterations = 0;
  qf_max_loop_gap_us = 0;
  qf_last_loop_us = micros();
  return true;
}

void setup() {
  qf_matrix.begin();
  qf_matrix_enabled = true;
  qf_matrix.setGrayscaleBits(3);
  qf_matrix.clear();

  if (!Bridge.begin()) {
    while (true) {
      delay(1000);
    }
  }

  Bridge.provide("qf_stage1_echo", qf_stage1_echo);
  Bridge.provide("qf_stage1_micros", qf_stage1_micros);
  Bridge.provide_safe("qf_stage1_matrix_draw", qf_stage1_matrix_draw);
  Bridge.provide_safe("qf_stage1_matrix_profile_configure",
                      qf_stage1_matrix_profile_configure);
  Bridge.provide_safe("qf_stage1_matrix_profile_diagnostic",
                      qf_stage1_matrix_profile_diagnostic);
  Bridge.provide_safe("qf_stage1_reverse_start", qf_stage1_reverse_start);
  Bridge.provide_safe("qf_stage1_reverse_result", qf_stage1_reverse_result);
  Bridge.provide_safe("qf_stage1_resource_constant", qf_stage1_resource_constant);
  Bridge.provide_safe("qf_stage1_diagnostic", qf_stage1_diagnostic);
  Bridge.provide_safe("qf_stage1_reset_diagnostics", qf_stage1_reset_diagnostics);
}

void loop() {
  const uint32_t loop_started_us = micros();
  if (qf_last_loop_us != 0) {
    const uint32_t gap_us = loop_started_us - qf_last_loop_us;
    qf_max_loop_gap_us = max(qf_max_loop_gap_us, gap_us);
  }
  qf_last_loop_us = loop_started_us;
  ++qf_loop_iterations;

  if (qf_reverse_state == QfReverseState::pending) {
    qf_reverse_state = QfReverseState::running;
    uint32_t echoed_token = 0;
    const uint32_t started = micros();
    const bool succeeded =
        Bridge.call("qf_stage1_linux_echo", qf_reverse_token).result(echoed_token);
    qf_reverse_duration_us = micros() - started;
    qf_reverse_state = succeeded && echoed_token == qf_reverse_token
                           ? QfReverseState::ready
                           : QfReverseState::error;
  }

  if (qf_matrix_profile_mode == QF_MATRIX_PROFILE_REFRESH &&
      qf_matrix_refresh_interval_us > 0 &&
      loop_started_us - qf_matrix_last_refresh_us >= qf_matrix_refresh_interval_us) {
    qf_matrix_last_refresh_us = loop_started_us;
    const uint32_t draw_us = qf_matrix_draw_frame(++qf_matrix_seed);
    qf_matrix_max_draw_us = max(qf_matrix_max_draw_us, draw_us);
    ++qf_matrix_refresh_count;
  }

  delay(1);
}
