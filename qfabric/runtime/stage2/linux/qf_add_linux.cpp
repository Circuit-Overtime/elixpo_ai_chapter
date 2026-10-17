#include <charconv>
#include <cstdint>
#include <iostream>
#include <limits>
#include <string_view>

#include "../../../qtasks/add.qtask.h"

namespace {

bool parse_i32(std::string_view text, std::int32_t &value) {
  std::int64_t parsed = 0;
  const auto result = std::from_chars(text.data(), text.data() + text.size(), parsed);
  if (result.ec != std::errc{} || result.ptr != text.data() + text.size() ||
      parsed < std::numeric_limits<std::int32_t>::min() ||
      parsed > std::numeric_limits<std::int32_t>::max()) {
    return false;
  }
  value = static_cast<std::int32_t>(parsed);
  return true;
}

}  // namespace

int main(int argc, char **argv) {
  if (argc != 3) {
    std::cerr << "add requires exactly two signed 32-bit integer arguments\n";
    return 2;
  }

  std::int32_t a = 0;
  std::int32_t b = 0;
  if (!parse_i32(argv[1], a) || !parse_i32(argv[2], b)) {
    std::cerr << "add arguments must be signed 32-bit integers\n";
    return 2;
  }

  std::cout << qf_task_add(a, b) << '\n';
  return 0;
}
