// Stage 11 effort baseline: representative handwritten dual-domain Bridge path.
// It is intentionally not linked into QFabric; the evaluator counts maintained
// source statements and cross-domain concerns against qtasks/add.qtask.h.
#include <cstdint>
#include <stdexcept>
#include <string>

enum class Domain { Linux, Rt };

struct AddRequest {
  std::int32_t lhs;
  std::int32_t rhs;
  std::uint64_t sequence;
};

struct AddResponse {
  std::int32_t value;
  std::uint64_t sequence;
  bool valid;
};

class ManualBridgeAdd {
 public:
  AddResponse execute(AddRequest request, Domain domain) {
    validate(request);
    if (domain == Domain::Linux) {
      return execute_linux(request);
    }
    return execute_rt(encode(request));
  }

  void change_domain(Domain destination) {
    if (in_flight_ != 0) {
      throw std::runtime_error("unsafe placement boundary");
    }
    domain_ = destination;
    ++epoch_;
  }

 private:
  static void validate(const AddRequest& request) {
    if (request.sequence == 0) {
      throw std::invalid_argument("sequence must be nonzero");
    }
  }

  static std::string encode(const AddRequest&) { return "manual-msgpack-payload"; }

  AddResponse execute_linux(const AddRequest& request) {
    return {request.lhs + request.rhs, request.sequence, true};
  }

  AddResponse execute_rt(const std::string&) {
    // A production version must also own RPC registration, timeout handling,
    // response decoding, replay protection, and error translation.
    return {0, 0, false};
  }

  Domain domain_{Domain::Linux};
  std::uint32_t epoch_{0};
  std::uint32_t in_flight_{0};
};
