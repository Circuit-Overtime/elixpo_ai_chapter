#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

#include "generated/qfabric_abi.hpp"

namespace abi = qfabric::abi;

extern std::array<std::uint8_t, 128> qf_stage3_buffer;

template <typename Value, typename Encoder>
bool qf_encode_frame(const abi::Metadata& metadata, const Value& value, Encoder encoder,
                     std::size_t& size) {
  std::size_t payload_size = 0;
  const auto payload_status =
      encoder(value, qf_stage3_buffer.data() + abi::kHeaderSize,
              qf_stage3_buffer.size() - abi::kHeaderSize, payload_size);
  if (payload_status != abi::Status::Ok) return false;
  std::size_t header_size = 0;
  const auto header_status = abi::encode_header(
      metadata, static_cast<std::uint16_t>(payload_size), qf_stage3_buffer.data(),
      abi::kHeaderSize, header_size);
  size = header_size + payload_size;
  return header_status == abi::Status::Ok && header_size == abi::kHeaderSize;
}

inline bool qf_scalar_boundary_check() {
  abi::Writer writer(qf_stage3_buffer.data(), qf_stage3_buffer.size());
  if (!writer.write_i8(std::numeric_limits<std::int8_t>::min()) ||
      !writer.write_i8(std::numeric_limits<std::int8_t>::max()) ||
      !writer.write_u8(std::numeric_limits<std::uint8_t>::min()) ||
      !writer.write_u8(std::numeric_limits<std::uint8_t>::max()) ||
      !writer.write_i16(std::numeric_limits<std::int16_t>::min()) ||
      !writer.write_i16(std::numeric_limits<std::int16_t>::max()) ||
      !writer.write_u16(std::numeric_limits<std::uint16_t>::min()) ||
      !writer.write_u16(std::numeric_limits<std::uint16_t>::max()) ||
      !writer.write_i32(std::numeric_limits<std::int32_t>::min()) ||
      !writer.write_i32(std::numeric_limits<std::int32_t>::max()) ||
      !writer.write_u32(std::numeric_limits<std::uint32_t>::min()) ||
      !writer.write_u32(std::numeric_limits<std::uint32_t>::max()) ||
      !writer.write_i64(std::numeric_limits<std::int64_t>::min()) ||
      !writer.write_i64(std::numeric_limits<std::int64_t>::max()) ||
      !writer.write_u64(std::numeric_limits<std::uint64_t>::min()) ||
      !writer.write_u64(std::numeric_limits<std::uint64_t>::max()) ||
      !writer.write_f32(std::numeric_limits<float>::lowest()) ||
      !writer.write_f32(std::numeric_limits<float>::max()) ||
      !writer.write_f64(std::numeric_limits<double>::lowest()) ||
      !writer.write_f64(std::numeric_limits<double>::max()) ||
      !writer.write_f32(-0.0F) || !writer.write_f64(-0.0) ||
      !writer.write_bool(false) || !writer.write_bool(true)) {
    return false;
  }

  abi::Reader reader(qf_stage3_buffer.data(), writer.size());
  std::int8_t i8_min = 0, i8_max = 0;
  std::uint8_t u8_min = 0, u8_max = 0;
  std::int16_t i16_min = 0, i16_max = 0;
  std::uint16_t u16_min = 0, u16_max = 0;
  std::int32_t i32_min = 0, i32_max = 0;
  std::uint32_t u32_min = 0, u32_max = 0;
  std::int64_t i64_min = 0, i64_max = 0;
  std::uint64_t u64_min = 0, u64_max = 0;
  float f32_lowest = 0, f32_max = 0, f32_negative_zero = 0;
  double f64_lowest = 0, f64_max = 0, f64_negative_zero = 0;
  bool false_value = true, true_value = false;
  if (!reader.read_i8(i8_min) || !reader.read_i8(i8_max) ||
      !reader.read_u8(u8_min) || !reader.read_u8(u8_max) ||
      !reader.read_i16(i16_min) || !reader.read_i16(i16_max) ||
      !reader.read_u16(u16_min) || !reader.read_u16(u16_max) ||
      !reader.read_i32(i32_min) || !reader.read_i32(i32_max) ||
      !reader.read_u32(u32_min) || !reader.read_u32(u32_max) ||
      !reader.read_i64(i64_min) || !reader.read_i64(i64_max) ||
      !reader.read_u64(u64_min) || !reader.read_u64(u64_max) ||
      !reader.read_f32(f32_lowest) || !reader.read_f32(f32_max) ||
      !reader.read_f64(f64_lowest) || !reader.read_f64(f64_max) ||
      !reader.read_f32(f32_negative_zero) || !reader.read_f64(f64_negative_zero) ||
      !reader.read_bool(false_value) || !reader.read_bool(true_value)) {
    return false;
  }
  return i8_min == std::numeric_limits<std::int8_t>::min() &&
         i8_max == std::numeric_limits<std::int8_t>::max() && u8_min == 0 &&
         u8_max == std::numeric_limits<std::uint8_t>::max() &&
         i16_min == std::numeric_limits<std::int16_t>::min() &&
         i16_max == std::numeric_limits<std::int16_t>::max() && u16_min == 0 &&
         u16_max == std::numeric_limits<std::uint16_t>::max() &&
         i32_min == std::numeric_limits<std::int32_t>::min() &&
         i32_max == std::numeric_limits<std::int32_t>::max() && u32_min == 0 &&
         u32_max == std::numeric_limits<std::uint32_t>::max() &&
         i64_min == std::numeric_limits<std::int64_t>::min() &&
         i64_max == std::numeric_limits<std::int64_t>::max() && u64_min == 0 &&
         u64_max == std::numeric_limits<std::uint64_t>::max() &&
         f32_lowest == std::numeric_limits<float>::lowest() &&
         f32_max == std::numeric_limits<float>::max() &&
         f64_lowest == std::numeric_limits<double>::lowest() &&
         f64_max == std::numeric_limits<double>::max() && std::signbit(f32_negative_zero) &&
         std::signbit(f64_negative_zero) && !false_value && true_value;
}
