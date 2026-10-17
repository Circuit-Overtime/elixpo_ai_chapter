#include <array>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstring>

#include "runtime/stage3/rt/qf_stage3_abi/qf_stage3_helpers.h"

namespace abi = qfabric::abi;

std::array<std::uint8_t, 128> qf_stage3_buffer{};

namespace {

int nibble(char value) {
  if (value >= '0' && value <= '9') return value - '0';
  if (value >= 'a' && value <= 'f') return value - 'a' + 10;
  return -1;
}

bool matches_hex(const std::uint8_t* data, std::size_t size, const char* expected) {
  if (std::strlen(expected) != size * 2) return false;
  for (std::size_t index = 0; index < size; ++index) {
    const int high = nibble(expected[index * 2]);
    const int low = nibble(expected[index * 2 + 1]);
    if (high < 0 || low < 0 || data[index] != static_cast<std::uint8_t>((high << 4) | low)) {
      return false;
    }
  }
  return true;
}

template <typename Value, typename Encoder>
bool encode_frame(const abi::Metadata& metadata, const Value& value, Encoder encoder,
                  std::array<std::uint8_t, abi::kMaxMessageBytes>& output, std::size_t& size) {
  std::size_t payload_size = 0;
  const auto payload_status =
      encoder(value, output.data() + abi::kHeaderSize, output.size() - abi::kHeaderSize,
              payload_size);
  if (payload_status != abi::Status::Ok) return false;
  std::size_t header_size = 0;
  const auto header_status = abi::encode_header(
      metadata, static_cast<std::uint16_t>(payload_size), output.data(), abi::kHeaderSize,
      header_size);
  size = header_size + payload_size;
  return header_status == abi::Status::Ok && header_size == abi::kHeaderSize;
}

}  // namespace

int main() {
  static_assert(abi::kHeaderSize == 36);
  static_assert(abi::kMaxPayloadBytes == 988);
  static_assert(abi::canary_eligible(abi::Q_PURE));
  static_assert(!abi::canary_eligible(abi::Q_STATEFUL));
  static_assert(!abi::kTaskAddPinned);
  static_assert(abi::transition_pinned(abi::Q_ACTUATING, false));
  static_assert(!abi::transition_pinned(abi::Q_ACTUATING, true));
  if (!qf_scalar_boundary_check()) return 8;

  abi::ReplayGuard<2> replay_guard;
  if (replay_guard.accept(7, 100) != abi::Status::Ok ||
      replay_guard.accept(7, 100) != abi::Status::Duplicate ||
      replay_guard.accept(6, 101) != abi::Status::Stale ||
      replay_guard.accept(8, 100) != abi::Status::Ok) {
    return 7;
  }

  std::array<std::uint8_t, abi::kMaxMessageBytes> encoded{};
  std::size_t encoded_size = 0;

  abi::AddRequest add{-2147483647 - 1, 2147483647};
  abi::Metadata add_metadata{abi::MessageType::Request, abi::Effect::Pure, abi::Status::Ok,
                             abi::kTaskAdd, 0x0102030405060708ULL, 7, 11, 50000};
  if (!encode_frame(add_metadata, add, abi::encode_AddRequest, encoded, encoded_size) ||
      !matches_hex(
          encoded.data(), encoded_size,
          "5146414201010100000000010102030405060708000000070000000b0000c35000080000"
          "800000007fffffff")) {
    return 1;
  }

  abi::Metadata decoded_metadata{};
  std::uint16_t decoded_payload_size = 0;
  if (abi::decode_header(encoded.data(), encoded_size, decoded_metadata, decoded_payload_size) !=
          abi::Status::Ok ||
      decoded_payload_size != 8) {
    return 2;
  }
  abi::AddRequest decoded_add{};
  if (abi::decode_AddRequest(encoded.data() + abi::kHeaderSize, decoded_payload_size,
                             decoded_add) != abi::Status::Ok ||
      decoded_add.a != add.a || decoded_add.b != add.b) {
    return 3;
  }

  abi::ProbeRequest probe{UINT64_MAX, 12.5F, -0.25, {-32768, 0, 32767}, true};
  abi::Metadata probe_metadata{abi::MessageType::Request, abi::Effect::Pure, abi::Status::Ok,
                               abi::kTaskAbiProbe, UINT64_MAX, UINT32_MAX, 0, 0};
  if (!encode_frame(probe_metadata, probe, abi::encode_ProbeRequest, encoded, encoded_size) ||
      !matches_hex(
          encoded.data(), encoded_size,
          "514641420101010000000002ffffffffffffffffffffffff0000000000000000001b0000"
          "ffffffffffffffff41480000bfd0000000000000800000007fff01")) {
    return 4;
  }

  abi::ProbeResponse response{true, 0x89abcdefU};
  abi::Metadata response_metadata{abi::MessageType::Response, abi::Effect::Pure, abi::Status::Ok,
                                  abi::kTaskAbiProbe, UINT64_MAX, UINT32_MAX, 0, 0};
  if (!encode_frame(response_metadata, response, abi::encode_ProbeResponse, encoded,
                    encoded_size) ||
      !matches_hex(encoded.data(), encoded_size,
                   "514641420102010000000002ffffffffffffffffffffffff000000000000000000050000"
                   "0189abcdef")) {
    return 5;
  }

  encoded[4] = 2;
  if (abi::decode_header(encoded.data(), encoded_size, decoded_metadata, decoded_payload_size) !=
      abi::Status::VersionMismatch) {
    return 6;
  }

  std::puts("QFabric C++ ABI golden vectors passed");
  return 0;
}
