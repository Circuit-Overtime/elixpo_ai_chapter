#include <Arduino_RouterBridge.h>
#include <zephyr/kernel.h>

#include <cstdint>

#include "qtasks/add.qtask.h"

constexpr std::uint32_t QF_DIAGNOSTIC_EPOCH = 0;
constexpr std::uint32_t QF_DIAGNOSTIC_INVOCATION = 1;
constexpr std::uint32_t QF_DIAGNOSTIC_EXECUTION_NS_LOW = 2;
constexpr std::uint32_t QF_DIAGNOSTIC_EXECUTION_NS_HIGH = 3;
constexpr std::uint32_t QF_DIAGNOSTIC_MODE = 4;

std::uint32_t qf_last_epoch = 0;
std::uint32_t qf_last_invocation = 0;
std::uint64_t qf_last_execution_ns = 0;
std::uint32_t qf_last_mode = 0;

std::int32_t qf_stage4_add_disabled(std::int32_t a, std::int32_t b) {
  return qf_task_add(a, b);
}

std::int32_t qf_stage4_add_profiled(std::uint32_t epoch, std::uint32_t invocation,
                                    std::int32_t a, std::int32_t b, std::uint32_t mode) {
  qf_last_epoch = epoch;
  qf_last_invocation = invocation;
  qf_last_mode = mode;
  qf_last_execution_ns = 0;
  if (mode != 2) return qf_task_add(a, b);

  const std::uint32_t started = k_cycle_get_32();
  const std::int32_t result = qf_task_add(a, b);
  const std::uint32_t elapsed = k_cycle_get_32() - started;
  qf_last_execution_ns = k_cyc_to_ns_floor64(elapsed);
  return result;
}

std::uint32_t qf_stage4_diagnostic(std::uint32_t diagnostic) {
  switch (diagnostic) {
    case QF_DIAGNOSTIC_EPOCH:
      return qf_last_epoch;
    case QF_DIAGNOSTIC_INVOCATION:
      return qf_last_invocation;
    case QF_DIAGNOSTIC_EXECUTION_NS_LOW:
      return static_cast<std::uint32_t>(qf_last_execution_ns);
    case QF_DIAGNOSTIC_EXECUTION_NS_HIGH:
      return static_cast<std::uint32_t>(qf_last_execution_ns >> 32);
    case QF_DIAGNOSTIC_MODE:
      return qf_last_mode;
    default:
      return UINT32_MAX;
  }
}

void setup() {
  if (!Bridge.begin()) {
    while (true) delay(1000);
  }
  Bridge.provide_safe("qf_stage4_add_disabled", qf_stage4_add_disabled);
  Bridge.provide_safe("qf_stage4_add_profiled", qf_stage4_add_profiled);
  Bridge.provide_safe("qf_stage4_diagnostic", qf_stage4_diagnostic);
}

void loop() {
  delay(1);
}
