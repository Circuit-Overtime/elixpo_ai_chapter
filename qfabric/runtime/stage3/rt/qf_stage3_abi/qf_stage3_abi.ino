#include <Arduino_RouterBridge.h>

#include <array>
#include <cstdint>

#include "qf_stage3_helpers.h"

std::array<std::uint8_t, 128> qf_stage3_buffer{};
abi::ReplayGuard<64> qf_stage3_replay_guard;

String qf_hex(const std::uint8_t* data, std::size_t size) {
  static constexpr char digits[] = "0123456789abcdef";
  String result;
  result.reserve(size * 2);
  for (std::size_t index = 0; index < size; ++index) {
    result += digits[data[index] >> 4];
    result += digits[data[index] & 0x0f];
  }
  return result;
}

String qf_stage3_golden_vector(std::uint32_t vector) {
  std::size_t size = 0;
  if (vector == 0) {
    const abi::AddRequest value{-2147483647 - 1, 2147483647};
    const abi::Metadata metadata{abi::MessageType::Request, abi::Effect::Pure,
                                 abi::Status::Ok, abi::kTaskAdd,
                                 0x0102030405060708ULL, 7, 11, 50000};
    if (!qf_encode_frame(metadata, value, abi::encode_AddRequest, size)) return "";
  } else if (vector == 1) {
    const abi::ProbeRequest value{UINT64_MAX, 12.5F, -0.25, {-32768, 0, 32767}, true};
    const abi::Metadata metadata{abi::MessageType::Request, abi::Effect::Pure,
                                 abi::Status::Ok, abi::kTaskAbiProbe,
                                 UINT64_MAX, UINT32_MAX, 0, 0};
    if (!qf_encode_frame(metadata, value, abi::encode_ProbeRequest, size)) return "";
  } else if (vector == 2) {
    const abi::ProbeResponse value{true, 0x89abcdefU};
    const abi::Metadata metadata{abi::MessageType::Response, abi::Effect::Pure,
                                 abi::Status::Ok, abi::kTaskAbiProbe,
                                 UINT64_MAX, UINT32_MAX, 0, 0};
    if (!qf_encode_frame(metadata, value, abi::encode_ProbeResponse, size)) return "";
  } else {
    return "";
  }
  return qf_hex(qf_stage3_buffer.data(), size);
}

std::uint32_t qf_stage3_decode_status(std::uint32_t scenario) {
  const abi::ProbeResponse value{true, 0x89abcdefU};
  const abi::Metadata source{abi::MessageType::Response, abi::Effect::Pure,
                             abi::Status::Ok, abi::kTaskAbiProbe,
                             UINT64_MAX, UINT32_MAX, 0, 0};
  std::size_t size = 0;
  if (!qf_encode_frame(source, value, abi::encode_ProbeResponse, size)) {
    return static_cast<std::uint32_t>(abi::Status::ExecutionError);
  }

  if (scenario == 1) qf_stage3_buffer[4] = 2;
  if (scenario == 2) qf_stage3_buffer[abi::kHeaderSize] = 2;
  if (scenario == 4) size = abi::kMaxMessageBytes + 1;
  if (scenario == 5) qf_stage3_buffer[35] = 1;

  abi::Metadata decoded{};
  std::uint16_t payload_size = 0;
  const auto header_status = abi::decode_header(
      qf_stage3_buffer.data(), scenario == 3 ? abi::kHeaderSize - 1 : size,
      decoded, payload_size);
  if (header_status != abi::Status::Ok) {
    return static_cast<std::uint32_t>(header_status);
  }
  abi::ProbeResponse decoded_value{};
  return static_cast<std::uint32_t>(abi::decode_ProbeResponse(
      qf_stage3_buffer.data() + abi::kHeaderSize, payload_size, decoded_value));
}

bool qf_stage3_replay_reset() {
  qf_stage3_replay_guard.reset();
  return true;
}

std::uint32_t qf_stage3_replay_status(std::uint32_t epoch, std::uint32_t invocation_id) {
  return static_cast<std::uint32_t>(qf_stage3_replay_guard.accept(epoch, invocation_id));
}

bool qf_stage3_scalar_boundaries() {
  return qf_scalar_boundary_check();
}

void setup() {
  if (!Bridge.begin()) {
    while (true) delay(1000);
  }
  Bridge.provide_safe("qf_stage3_golden_vector", qf_stage3_golden_vector);
  Bridge.provide_safe("qf_stage3_decode_status", qf_stage3_decode_status);
  Bridge.provide_safe("qf_stage3_replay_reset", qf_stage3_replay_reset);
  Bridge.provide_safe("qf_stage3_replay_status", qf_stage3_replay_status);
  Bridge.provide_safe("qf_stage3_scalar_boundaries", qf_stage3_scalar_boundaries);
}

void loop() {
  delay(1);
}
