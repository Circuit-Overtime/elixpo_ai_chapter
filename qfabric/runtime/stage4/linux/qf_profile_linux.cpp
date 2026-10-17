#include <charconv>
#include <chrono>
#include <cstdint>
#include <iostream>
#include <limits>
#include <string_view>

#include "../../../qtasks/add.qtask.h"

namespace {

template <typename Value>
bool parse_integer(std::string_view text, Value &value) {
  const auto result = std::from_chars(text.data(), text.data() + text.size(), value);
  return result.ec == std::errc{} && result.ptr == text.data() + text.size();
}

}  // namespace

int main(int argc, char **argv) {
  if (argc != 5) {
    std::cerr << "usage: qf-profile-linux INVOCATION_ID MODE A B\n";
    return 2;
  }

  std::uint64_t invocation_id = 0;
  std::uint32_t mode = 0;
  std::int32_t a = 0;
  std::int32_t b = 0;
  if (!parse_integer(std::string_view(argv[1]), invocation_id) ||
      !parse_integer(std::string_view(argv[2]), mode) || mode > 2 ||
      !parse_integer(std::string_view(argv[3]), a) ||
      !parse_integer(std::string_view(argv[4]), b)) {
    std::cerr << "invalid profiling invocation\n";
    return 2;
  }
  const auto sum = static_cast<std::int64_t>(a) + static_cast<std::int64_t>(b);
  if (sum < std::numeric_limits<std::int32_t>::min() ||
      sum > std::numeric_limits<std::int32_t>::max()) {
    std::cerr << "add result exceeds the signed 32-bit integer range\n";
    return 2;
  }

  std::uint64_t local_execution_ns = 0;
  std::int32_t value = 0;
  if (mode == 2) {
    const auto started = std::chrono::steady_clock::now();
    value = qf_task_add(a, b);
    const auto finished = std::chrono::steady_clock::now();
    local_execution_ns = static_cast<std::uint64_t>(
        std::chrono::duration_cast<std::chrono::nanoseconds>(finished - started).count());
  } else {
    value = qf_task_add(a, b);
  }

  std::cout << invocation_id << ' ' << value << ' ' << local_execution_ns << '\n';
  return 0;
}
