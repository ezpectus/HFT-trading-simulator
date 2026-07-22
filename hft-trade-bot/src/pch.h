// Precompiled header — includes heavy standard library and third-party headers
// used across all translation units to reduce compilation time.

// Standard library
#include <array>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <functional>
#include <iomanip>
#include <iostream>
#include <limits>
#include <memory>
#include <mutex>
#include <numeric>
#include <optional>
#include <queue>
#include <span>
#include <string>
#include <string_view>
#include <thread>
#include <vector>

// Third-party
#include <boost/system/error_code.hpp>
#include <fmt/format.h>
#include <nlohmann/json.hpp>
#include <spdlog/spdlog.h>
#include <yaml-cpp/yaml.h>

#ifdef HFT_HAS_SIMDJSON
#include <simdjson.h>
#endif
