# HFT Trade Bot — CMake build configuration
# Requires: C++20, Boost.Beast, websocketpp, nlohmann/json, spdlog, fmt, yaml-cpp
cmake_minimum_required(VERSION 3.16)
project(hft_trade_bot VERSION 2.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Build type
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# ─── ccache support ───
option(USE_CCACHE "Enable ccache for faster rebuilds" ON)
if(USE_CCACHE)
    find_program(CCACHE_PROGRAM ccache)
    if(CCACHE_PROGRAM)
        message(STATUS "ccache found: ${CCACHE_PROGRAM}")
        set(CMAKE_CXX_COMPILER_LAUNCHER ${CCACHE_PROGRAM})
        set(CMAKE_C_COMPILER_LAUNCHER ${CCACHE_PROGRAM})
    else()
        message(STATUS "ccache not found — building without ccache")
    endif()
endif()

# ─── Unity build option ───
option(USE_UNITY_BUILD "Enable unity build for faster compilation" OFF)

# ─── HFT-O24: Custom allocator (mimalloc/jemalloc) ───
option(USE_MIMALLOC "Link mimalloc allocator" OFF)
option(USE_JEMALLOC "Link jemalloc allocator" OFF)

# ─── HFT-O23: Profile-Guided Optimization (PGO) ───
option(USE_PGO "Enable profile-guided optimization (requires two-pass build)" OFF)
set(PGO_PROFILE_DIR "${CMAKE_BINARY_DIR}/pgo-profile" CACHE PATH "PGO profile data directory")
if(USE_UNITY_BUILD)
    set(CMAKE_UNITY_BUILD ON)
    message(STATUS "Unity build enabled")
endif()

# ─── Precompiled headers ───
# Disable PCH on MSVC — non-ASCII characters in project path cause UTF-8 encoding errors
if(CMAKE_CXX_COMPILER_ID STREQUAL "MSVC")
    option(USE_PCH "Enable precompiled headers" OFF)
else()
    option(USE_PCH "Enable precompiled headers" ON)
endif()

# ─── Tests-only mode ───
# Build just the dependency-free unit tests (host without vcpkg/apt deps).
# Dependencies become QUIET; each dep-requiring target is gated on its
# imported target existing, so partial toolchains build whatever they can.
option(HFT_TESTS_ONLY "Skip main bot + dep-requiring targets; build dep-free tests" OFF)

# ─── Compiler flags ───
# GCC/Clang: -O3 + LTO for maximum performance
# MSVC: /O2 + /GL (whole-program optimization) + /utf-8
if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU" OR CMAKE_CXX_COMPILER_ID STREQUAL "Clang")
    set(CMAKE_CXX_FLAGS_RELEASE "-O3 -DNDEBUG -flto -Wall -Wextra")
    set(CMAKE_CXX_FLAGS_DEBUG "-g -O0 -fsanitize=address -fsanitize=undefined -Wall -Wextra")
elseif(CMAKE_CXX_COMPILER_ID STREQUAL "MSVC")
    set(CMAKE_CXX_FLAGS_RELEASE "/O2 /DNDEBUG /GL /utf-8 /Zc:preprocessor /W4")
    set(CMAKE_CXX_FLAGS_DEBUG "/Od /Zi /fsanitize=address /utf-8 /Zc:preprocessor /W4")
    add_compile_options(/utf-8 /Zc:preprocessor)
endif()

# Enable LTO in linker as well (GCC/Clang only — MSVC uses per-target IPO)
if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU" OR CMAKE_CXX_COMPILER_ID STREQUAL "Clang")
    set(CMAKE_INTERPROCEDURAL_OPTIMIZATION_RELEASE ON)
endif()

# Architecture-specific optimizations (Nehalem+ for SSE4.2, Haswell+ for AVX2)
# -march=native with fallback for cross-compilation safety
if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU")
    add_compile_options(-msse4.2 -mavx2)

    # Try -march=native, fall back to x86-64 if unsupported
    include(CheckCXXCompilerFlag)
    check_cxx_compiler_flag("-march=native" COMPILER_SUPPORTS_MARCH_NATIVE)
    if(COMPILER_SUPPORTS_MARCH_NATIVE)
        add_compile_options(-march=native)
    else()
        message(STATUS "-march=native not supported — using default architecture")
    endif()

    # -ffast-math implies -ffinite-math-only: GCC then constant-folds
    # std::isnan() to false, silently breaking the NaN sentinels used by
    # compute_ema/compute_rsi (found by first Linux test run — clang happens
    # to still evaluate it). Keep fast-math opts but restore NaN semantics.
    add_compile_options(-ffast-math -fno-math-errno -fno-finite-math-only)
    add_compile_options(-finline-functions -finline-limit=1000)
endif()

# ─── HFT-O24: Link custom allocator ───
if(USE_MIMALLOC)
    find_package(mimalloc CONFIG QUIET)
    if(TARGET mimalloc)
        link_libraries(mimalloc)
        message(STATUS "mimalloc linked — custom allocator enabled")
    else()
        message(WARNING "mimalloc not found — build with -DUSE_MIMALLOC=ON after installing mimalloc")
    endif()
elseif(USE_JEMALLOC)
    find_package(PkgConfig QUIET)
    if(PkgConfig_FOUND)
        pkg_check_modules(JEMALLOC IMPORTED_TARGET jemalloc)
    endif()
    if(JEMALLOC_FOUND)
        link_libraries(PkgConfig::JEMALLOC)
        message(STATUS "jemalloc linked — custom allocator enabled")
    else()
        find_library(JEMALLOC_LIB NAMES jemalloc)
        if(JEMALLOC_LIB)
            link_libraries(${JEMALLOC_LIB})
            message(STATUS "jemalloc linked (fallback) — custom allocator enabled")
        else()
            message(WARNING "jemalloc not found — build with -DUSE_JEMALLOC=ON after installing jemalloc-dev")
        endif()
    endif()
endif()

# ─── HFT-O23: Profile-Guided Optimization (PGO) ───
# Two-pass build:
#   Pass 1: cmake -DUSE_PGO=ON -DCMAKE_BUILD_TYPE=Profile .. && cmake --build . --config Profile
#           Run the binary with representative workload to generate profile data
#   Pass 2: cmake -DCMAKE_BUILD_TYPE=Release .. && cmake --build . --config Release
#           The profile data is automatically used by the Release build
if(USE_PGO AND (CMAKE_CXX_COMPILER_ID STREQUAL "GNU" OR CMAKE_CXX_COMPILER_ID STREQUAL "Clang"))
    # Profile generation build type
    set(CMAKE_CXX_FLAGS_PROFILE "-O3 -DNDEBUG -fprofile-generate=${PGO_PROFILE_DIR}")
    set(CMAKE_C_FLAGS_PROFILE "-O3 -DNDEBUG -fprofile-generate=${PGO_PROFILE_DIR}")
    # Release build uses the generated profile
    set(CMAKE_CXX_FLAGS_RELEASE "${CMAKE_CXX_FLAGS_RELEASE} -fprofile-use=${PGO_PROFILE_DIR} -fprofile-correction")
    message(STATUS "PGO enabled: build Profile first, run workload, then build Release")
endif()

# Find dependencies
if(HFT_TESTS_ONLY)
    find_package(Threads REQUIRED)
    find_package(Boost QUIET COMPONENTS system random)
    find_package(OpenSSL QUIET)
    find_package(spdlog QUIET)
    find_package(fmt QUIET)
    find_package(nlohmann_json QUIET)
    find_package(yaml-cpp QUIET)

else()
# Boost: on Linux use system install (apt), on Windows use vcpkg.
# Only needed for websocketpp's boost-asio path — vendored standalone asio
# (deps/asio) replaces it entirely; nothing in src/ uses boost:: directly.
if(EXISTS ${CMAKE_SOURCE_DIR}/deps/asio/asio.hpp)
    find_package(Boost QUIET COMPONENTS system random)
elseif(UNIX AND NOT APPLE)
    # Linux: Boost installed via apt (libboost-system-dev, libboost-random-dev)
    find_package(Boost REQUIRED COMPONENTS system random)
    if(NOT TARGET Boost::headers)
        find_path(BOOST_INCLUDE_DIR boost/version.hpp)
        add_library(Boost::headers INTERFACE IMPORTED)
        set_target_properties(Boost::headers PROPERTIES
            INTERFACE_INCLUDE_DIRECTORIES "${BOOST_INCLUDE_DIR}"
        )
    endif()
    message(STATUS "Boost found via system packages (Linux)")
else()
    # Windows / macOS: vcpkg
    cmake_policy(SET CMP0167 NEW)
    if(DEFINED ENV{VCPKG_ROOT})
        list(APPEND CMAKE_PREFIX_PATH "$ENV{VCPKG_ROOT}/installed/x64-windows")
        set(_VCPKG_INCLUDE_DIR "$ENV{VCPKG_ROOT}/installed/x64-windows/include")
    else()
        list(APPEND CMAKE_PREFIX_PATH "C:/vcpkg/installed/x64-windows")
        set(_VCPKG_INCLUDE_DIR "C:/vcpkg/installed/x64-windows/include")
    endif()
    if(NOT TARGET Boost::headers)
        set(BOOST_INCLUDE_DIR "${_VCPKG_INCLUDE_DIR}" CACHE PATH "Boost include directory")
        if(NOT EXISTS "${BOOST_INCLUDE_DIR}/boost/version.hpp")
            message(FATAL_ERROR "Boost headers not found at ${BOOST_INCLUDE_DIR} — install via: vcpkg install boost")
        endif()
        add_library(Boost::headers INTERFACE IMPORTED)
        set_target_properties(Boost::headers PROPERTIES
            INTERFACE_INCLUDE_DIRECTORIES "${BOOST_INCLUDE_DIR}"
        )
        message(STATUS "Boost headers found at ${BOOST_INCLUDE_DIR}")
    endif()
endif()
find_package(OpenSSL QUIET)
find_package(Threads REQUIRED)

# spdlog
find_package(spdlog QUIET)
# fmt
find_package(fmt QUIET)
# nlohmann_json
find_package(nlohmann_json QUIET)
# yaml-cpp — robust target resolution for Debian/Ubuntu packages
find_package(yaml-cpp QUIET)
if(NOT TARGET yaml-cpp::yaml-cpp)
    if(TARGET yaml-cpp)
        add_library(yaml-cpp::yaml-cpp ALIAS yaml-cpp)
    else()
        find_library(YAML_CPP_LIB_RELEASE NAMES yaml-cpp)
        find_path(YAML_CPP_INCLUDE_DIR NAMES yaml-cpp/yaml.h)
        if(YAML_CPP_LIB_RELEASE AND YAML_CPP_INCLUDE_DIR)
            add_library(yaml-cpp::yaml-cpp UNKNOWN IMPORTED)
            set_target_properties(yaml-cpp::yaml-cpp PROPERTIES
                IMPORTED_LOCATION "${YAML_CPP_LIB_RELEASE}"
                INTERFACE_INCLUDE_DIRECTORIES "${YAML_CPP_INCLUDE_DIR}"
            )
        endif()
    endif()
endif()

endif() # HFT_TESTS_ONLY

# ─── Vendored deps fallback (hft-trade-bot/deps/, gitignored — fetched by
#     fetch-test-deps.sh; used only when real packages are absent). Creates the
#     same canonical target names both build modes check for. ───
set(_HFT_DEPS ${CMAKE_SOURCE_DIR}/deps)
if(NOT TARGET nlohmann_json::nlohmann_json AND EXISTS ${_HFT_DEPS}/nlohmann/json.hpp)
    add_library(nlohmann_json_vendored INTERFACE)
    target_include_directories(nlohmann_json_vendored INTERFACE ${_HFT_DEPS})
    add_library(nlohmann_json::nlohmann_json ALIAS nlohmann_json_vendored)
    message(STATUS "deps: vendored nlohmann_json")
endif()
if(NOT TARGET fmt::fmt AND EXISTS ${_HFT_DEPS}/fmt/fmt/format.h)
    add_library(fmt_vendored INTERFACE)
    target_include_directories(fmt_vendored INTERFACE ${_HFT_DEPS}/fmt)
    target_compile_definitions(fmt_vendored INTERFACE FMT_HEADER_ONLY=1)
    add_library(fmt::fmt ALIAS fmt_vendored)
    message(STATUS "deps: vendored fmt (header-only)")
endif()
if(NOT TARGET spdlog::spdlog AND EXISTS ${_HFT_DEPS}/spdlog/spdlog/spdlog.h)
    add_library(spdlog_vendored INTERFACE)
    target_include_directories(spdlog_vendored INTERFACE ${_HFT_DEPS}/spdlog)
    add_library(spdlog::spdlog ALIAS spdlog_vendored)
    message(STATUS "deps: vendored spdlog (header-only, bundled fmt)")
endif()
if(NOT TARGET yaml-cpp::yaml-cpp AND EXISTS ${_HFT_DEPS}/_yaml_build/libyaml-cpp.a)
    add_library(yaml-cpp STATIC IMPORTED GLOBAL)
    set_target_properties(yaml-cpp PROPERTIES
        IMPORTED_LOCATION ${_HFT_DEPS}/_yaml_build/libyaml-cpp.a
        INTERFACE_INCLUDE_DIRECTORIES ${_HFT_DEPS}/_yaml_src/include
        INTERFACE_COMPILE_DEFINITIONS YAML_CPP_STATIC_DEFINE
    )
    add_library(yaml-cpp::yaml-cpp ALIAS yaml-cpp)
    message(STATUS "deps: vendored yaml-cpp (prebuilt static)")
endif()
# Vendored OpenSSL (msys2 ucrt64 layout: deps/openssl/openssl/*.h + static .a)
if(NOT TARGET OpenSSL::SSL AND EXISTS ${_HFT_DEPS}/openssl/openssl/ssl.h)
    add_library(hft_vendored_crypto STATIC IMPORTED GLOBAL)
    set_target_properties(hft_vendored_crypto PROPERTIES
        IMPORTED_LOCATION ${_HFT_DEPS}/openssl/libcrypto.a
        INTERFACE_INCLUDE_DIRECTORIES ${_HFT_DEPS}/openssl
    )
    if(WIN32)
        set_target_properties(hft_vendored_crypto PROPERTIES
            INTERFACE_LINK_LIBRARIES "ws2_32;gdi32;crypt32")
    endif()
    add_library(hft_vendored_ssl STATIC IMPORTED GLOBAL)
    set_target_properties(hft_vendored_ssl PROPERTIES
        IMPORTED_LOCATION ${_HFT_DEPS}/openssl/libssl.a
        INTERFACE_INCLUDE_DIRECTORIES ${_HFT_DEPS}/openssl
        INTERFACE_LINK_LIBRARIES hft_vendored_crypto
    )
    add_library(OpenSSL::SSL ALIAS hft_vendored_ssl)
    add_library(OpenSSL::Crypto ALIAS hft_vendored_crypto)
    message(STATUS "deps: vendored OpenSSL (msys2 ucrt64 static)")
endif()

# Full build: enforce what used to be find_package(REQUIRED) — real packages
# OR the vendored equivalents above must exist.
if(NOT HFT_TESTS_ONLY)
    foreach(_req OpenSSL::SSL OpenSSL::Crypto spdlog::spdlog fmt::fmt
                 nlohmann_json::nlohmann_json yaml-cpp::yaml-cpp)
        if(NOT TARGET ${_req})
            message(FATAL_ERROR "${_req} not found — install system packages (vcpkg/apt) or run fetch-test-deps.sh")
        endif()
    endforeach()
    if(NOT TARGET Boost::headers)
        # Reachable only on the vendored standalone-asio path (otherwise the
        # Boost lookup above is fatal): no src/ file includes boost there.
        add_library(Boost::headers INTERFACE IMPORTED)
    endif()
endif()

# websocketpp (header-only) — check vcpkg first, then project root
find_path(WEBSOCKETPP_INCLUDE_DIR websocketpp/client.hpp
    PATHS "${CMAKE_SOURCE_DIR}/../websocketpp" "${_VCPKG_INCLUDE_DIR}"
)
if(NOT WEBSOCKETPP_INCLUDE_DIR)
    if(HFT_TESTS_ONLY)
        set(WEBSOCKETPP_INCLUDE_DIR "")
    else()
        message(WARNING "websocketpp not found. Install with: vcpkg install websocketpp — targets using it will fail to compile")
        set(WEBSOCKETPP_INCLUDE_DIR "")
    endif()
endif()

if(NOT HFT_TESTS_ONLY)

# Sources
set(SOURCES
    src/core/main.cpp
    src/core/bot_setup.cpp
    src/core/bot_loop.cpp
    src/core/config.cpp
    src/strategies/signal_engine_v2.cpp
)

# Executable
add_executable(hft_trade_bot ${SOURCES})

target_include_directories(hft_trade_bot PRIVATE
    ${CMAKE_SOURCE_DIR}/src
    ${WEBSOCKETPP_INCLUDE_DIR}
)

# websocketpp random: use C++11 std::random_device instead of boost/random
# (boost-random is not always installed via vcpkg; websocketpp doesn't auto-detect on MSVC)
target_compile_definitions(hft_trade_bot PRIVATE _WEBSOCKETPP_CPP11_RANDOM_DEVICE_)

# Vendored standalone asio — replaces the boost-asio websocketpp path when
# present (no Boost needed at all on this path).
if(EXISTS ${CMAKE_SOURCE_DIR}/deps/asio/asio.hpp)
    target_include_directories(hft_trade_bot PRIVATE ${CMAKE_SOURCE_DIR}/deps/asio)
    target_compile_definitions(hft_trade_bot PRIVATE ASIO_STANDALONE _WEBSOCKETPP_CPP11_THREAD_)
    if(WIN32)
        target_link_libraries(hft_trade_bot PRIVATE ws2_32 mswsock)
    endif()
endif()

# ─── Precompiled headers ───
if(USE_PCH)
    set(PCH_HEADER ${CMAKE_SOURCE_DIR}/src/pch.h)
    if(EXISTS ${PCH_HEADER})
        target_precompile_headers(hft_trade_bot PRIVATE ${PCH_HEADER})
        message(STATUS "Precompiled headers enabled: ${PCH_HEADER}")
    else()
        message(STATUS "PCH header not found at ${PCH_HEADER} — skipping PCH")
    endif()
endif()

target_link_libraries(hft_trade_bot PRIVATE
    Boost::headers
    OpenSSL::SSL
    OpenSSL::Crypto
    Threads::Threads
    spdlog::spdlog
    fmt::fmt
    nlohmann_json::nlohmann_json
    yaml-cpp::yaml-cpp
)


# Enable LTO for the target
set_target_properties(hft_trade_bot PROPERTIES
    INTERPROCEDURAL_OPTIMIZATION TRUE
)

# Install
install(TARGETS hft_trade_bot DESTINATION bin)
install(DIRECTORY config/ DESTINATION config)

endif() # NOT HFT_TESTS_ONLY — main bot

# ─── Unit Tests ───
enable_testing()

if(TARGET fmt::fmt)
add_executable(test_signal_engine tests/test_signal_engine.cpp)
target_include_directories(test_signal_engine PRIVATE
    ${CMAKE_SOURCE_DIR}/src
    ${WEBSOCKETPP_INCLUDE_DIR}
)
# pulls signal_receiver.h → websocketpp+asio — standalone asio from deps/
if(EXISTS ${CMAKE_SOURCE_DIR}/deps/asio/asio.hpp)
    target_include_directories(test_signal_engine PRIVATE ${CMAKE_SOURCE_DIR}/deps/asio)
    target_compile_definitions(test_signal_engine PRIVATE ASIO_STANDALONE _WEBSOCKETPP_CPP11_THREAD_)
endif()
if(WIN32)
    target_link_libraries(test_signal_engine PRIVATE ws2_32 mswsock)
endif()
target_link_libraries(test_signal_engine PRIVATE
    fmt::fmt
    Threads::Threads
)
set_target_properties(test_signal_engine PROPERTIES
    CXX_STANDARD 20
    CXX_STANDARD_REQUIRED ON
    INTERPROCEDURAL_OPTIMIZATION FALSE
)
add_test(NAME signal_engine_tests COMMAND test_signal_engine)

# ─── V2 Tests (split by domain — was one 43KB god-test) ───
foreach(v2test v2_infra v2_indicators v2_engine v2_pressure_adaptive)
    add_executable(test_${v2test} tests/test_${v2test}.cpp src/strategies/signal_engine_v2.cpp)
    target_include_directories(test_${v2test} PRIVATE
        ${CMAKE_SOURCE_DIR}/src
        ${CMAKE_SOURCE_DIR}/tests
        ${WEBSOCKETPP_INCLUDE_DIR}
    )
    target_link_libraries(test_${v2test} PRIVATE
        fmt::fmt
        Threads::Threads
    )
    set_target_properties(test_${v2test} PROPERTIES
        CXX_STANDARD 20
        CXX_STANDARD_REQUIRED ON
        INTERPROCEDURAL_OPTIMIZATION FALSE
    )
    add_test(NAME ${v2test}_tests COMMAND test_${v2test})
endforeach()

# ─── Hot-path microbenchmark (dev tool — intentionally NOT a ctest target:
#     timings are meaningless under CI load; run ./hft_bench manually) ───
add_executable(hft_bench tests/bench_hot_path.cpp src/strategies/signal_engine_v2.cpp)
target_include_directories(hft_bench PRIVATE
    ${CMAKE_SOURCE_DIR}/src
    ${CMAKE_SOURCE_DIR}/tests
)
target_link_libraries(hft_bench PRIVATE
    fmt::fmt
    Threads::Threads
)
set_target_properties(hft_bench PROPERTIES
    CXX_STANDARD 20
    CXX_STANDARD_REQUIRED ON
    INTERPROCEDURAL_OPTIMIZATION FALSE
)
endif() # fmt::fmt

# ─── V3 Production Tests ───

# Helper function for test targets
function(add_hft_test name source)
    add_executable(${name} ${source})
    target_include_directories(${name} PRIVATE
        ${CMAKE_SOURCE_DIR}/src
        ${WEBSOCKETPP_INCLUDE_DIR}
    )
    target_compile_definitions(${name} PRIVATE _WEBSOCKETPP_CPP11_RANDOM_DEVICE_)
    target_link_libraries(${name} PRIVATE
        Threads::Threads
    )
    set_target_properties(${name} PROPERTIES
        CXX_STANDARD 20
        CXX_STANDARD_REQUIRED ON
        INTERPROCEDURAL_OPTIMIZATION FALSE
    )
    add_test(NAME ${name}_tests COMMAND ${name})
endfunction()

# ─── doctest-based unit tests (header-only, no external deps) ───
function(add_doctest_test name source)
    add_executable(${name} ${source})
    target_include_directories(${name} PRIVATE
        ${CMAKE_SOURCE_DIR}/src
        ${CMAKE_SOURCE_DIR}/tests
        ${WEBSOCKETPP_INCLUDE_DIR}
    )
    target_compile_definitions(${name} PRIVATE _WEBSOCKETPP_CPP11_RANDOM_DEVICE_)
    target_link_libraries(${name} PRIVATE
        Threads::Threads
    )
    set_target_properties(${name} PROPERTIES
        CXX_STANDARD 20
        CXX_STANDARD_REQUIRED ON
        INTERPROCEDURAL_OPTIMIZATION FALSE
    )
    if(MSVC)
        target_compile_options(${name} PRIVATE /Zc:preprocessor)
    endif()
    add_test(NAME ${name}_tests COMMAND ${name})
endfunction()

# SHM ring buffer tests (POSIX-only — shm_open, mmap)
if(NOT WIN32)
    add_doctest_test(test_shm tests/test_shm.cpp)
    if(UNIX AND NOT APPLE)
        target_link_libraries(test_shm PRIVATE rt)
    endif()
endif()

# ─── New unit tests (monitoring, network) ───
add_doctest_test(test_monitoring tests/unit/test_monitoring.cpp)
add_doctest_test(test_network tests/unit/test_network.cpp)

# ─── Integration tests ───
if(NOT WIN32)
    add_doctest_test(test_integration_signal_flow tests/integration/test_signal_flow.cpp)
endif()

# Fallback: on some distros (Ubuntu 24.04) the fmt::fmt CMake target may be
# header-only, causing undefined references to fmt::v9 symbols at link time.
# Link the actual shared library directly to resolve this.
find_library(FMT_LIBRARY NAMES fmt)
find_library(SPDLOG_LIBRARY NAMES spdlog)

# Risk manager doctest tests (no fmt dependency — uses minimal stub)
add_doctest_test(test_doctest_risk_manager tests/test_doctest_risk_manager.cpp)

# Pressure model doctest tests
add_doctest_test(test_doctest_pressure_model tests/test_doctest_pressure_model.cpp)

# Signal engine doctest tests (indicators + params + analyze)
add_doctest_test(test_doctest_signal_engine tests/test_doctest_signal_engine.cpp)

# Position manager V1 doctest tests (open, close, pnl, SL/TP, NEUTRAL guard)
add_doctest_test(test_doctest_position_manager_v1 tests/test_doctest_position_manager_v1.cpp)

# Kill switch doctest tests (activate/deactivate, reason+timestamp recording regression, callbacks, idempotency)
if(TARGET fmt::fmt AND TARGET spdlog::spdlog)
add_doctest_test(test_doctest_kill_switch tests/test_doctest_kill_switch.cpp)
target_link_libraries(test_doctest_kill_switch PRIVATE fmt::fmt spdlog::spdlog)
if(FMT_LIBRARY)
    target_link_libraries(test_doctest_kill_switch PRIVATE ${FMT_LIBRARY})
endif()
if(SPDLOG_LIBRARY)
    target_link_libraries(test_doctest_kill_switch PRIVATE ${SPDLOG_LIBRARY})
endif()
endif() # fmt+spdlog

# SHM market data doctest tests (write/read round-trip, num_slots header, multiple symbols, bounds, writer/reader)
add_doctest_test(test_doctest_shm_market_data tests/test_doctest_shm_market_data.cpp)

# SHM ring buffer bulk push/pop optimization tests (contiguous, wrap-around, partial fill, full cycle)
add_doctest_test(test_doctest_shm_bulk tests/test_doctest_shm_bulk.cpp)

add_doctest_test(test_doctest_adaptive_order_selector tests/test_doctest_adaptive_order_selector.cpp)

# System monitor doctest tests (counters, fill/rejection rate, snapshot, reset, format_json regression, MemoryTracker, HealthStatus)
add_doctest_test(test_doctest_system_monitor tests/test_doctest_system_monitor.cpp)

# Order type selector + core types doctest tests (select branches, limit_price, OrderBook methods, Position PnL, side conversion)
add_doctest_test(test_doctest_order_type_selector tests/test_doctest_order_type_selector.cpp)

# Signal Engine V3 doctest tests (HMM regime detection, state transitions, regime gating, multi-symbol)
add_doctest_test(test_doctest_signal_engine_v3 tests/test_doctest_signal_engine_v3.cpp)

# Low-latency infra doctest tests (LatencyHistogram, ScopedLatency, SPSCQueue, Spinlock, ThreadAffinity)
add_doctest_test(test_doctest_cpp_optimizations tests/test_doctest_cpp_optimizations.cpp)

# HFT config doctest tests (signal_interval_ms, v2_cooldown_ms YAML parsing)
if(TARGET yaml-cpp::yaml-cpp AND TARGET fmt::fmt AND TARGET spdlog::spdlog)
add_doctest_test(test_doctest_hft_config tests/test_doctest_hft_config.cpp)
target_compile_definitions(test_doctest_hft_config PRIVATE DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN)
target_sources(test_doctest_hft_config PRIVATE src/core/config.cpp)
target_link_libraries(test_doctest_hft_config PRIVATE yaml-cpp::yaml-cpp fmt::fmt spdlog::spdlog)

endif() # yaml+fmt+spdlog (hft_config)

# SignalReceiver data-store doctest tests (multi-exchange keying, S252)
# Also needs standalone asio + OpenSSL headers (TLS client path parses them even
# when unused) — stays dark unless deps/{asio,openssl} are vendored.
if(TARGET nlohmann_json::nlohmann_json AND TARGET spdlog::spdlog
   AND EXISTS ${CMAKE_SOURCE_DIR}/deps/asio/asio.hpp
   AND TARGET OpenSSL::SSL)
add_doctest_test(test_doctest_signal_receiver tests/test_doctest_signal_receiver.cpp)
target_compile_definitions(test_doctest_signal_receiver PRIVATE DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN)
# signal_receiver.h pulls websocketpp/config/asio_client.hpp — standalone asio
# is vendored under deps/asio (header-only) when present.
if(EXISTS ${CMAKE_SOURCE_DIR}/deps/asio/asio.hpp)
    target_include_directories(test_doctest_signal_receiver PRIVATE ${CMAKE_SOURCE_DIR}/deps/asio)
    target_compile_definitions(test_doctest_signal_receiver PRIVATE ASIO_STANDALONE _WEBSOCKETPP_CPP11_THREAD_)
endif()
if(WIN32)
    target_link_libraries(test_doctest_signal_receiver PRIVATE ws2_32 mswsock)
endif()
# Vendored OpenSSL headers are needed on Windows where the deps/ layout
# isn't in the default include path. Always link via the OpenSSL:: targets —
# the vendored-minted block above already wraps deps/openssl/*.a into them
# when no system package exists; raw-linking the MinGW .a breaks on Linux.
if(EXISTS ${CMAKE_SOURCE_DIR}/deps/openssl/openssl/ssl.h)
    target_include_directories(test_doctest_signal_receiver PRIVATE ${CMAKE_SOURCE_DIR}/deps/openssl)
endif()
target_link_libraries(test_doctest_signal_receiver PRIVATE OpenSSL::SSL OpenSSL::Crypto)
if(WIN32)
    target_link_libraries(test_doctest_signal_receiver PRIVATE gdi32 crypt32)
endif()
target_link_libraries(test_doctest_signal_receiver PRIVATE nlohmann_json::nlohmann_json spdlog::spdlog)
if(FMT_LIBRARY)
    target_link_libraries(test_doctest_signal_receiver PRIVATE ${FMT_LIBRARY})
endif()
if(SPDLOG_LIBRARY)
    target_link_libraries(test_doctest_signal_receiver PRIVATE ${SPDLOG_LIBRARY})
endif()
endif() # json+spdlog (signal_receiver)

# ─── Integration tests (doctest-based) ───
if(TARGET yaml-cpp::yaml-cpp AND TARGET fmt::fmt AND TARGET spdlog::spdlog)
add_doctest_test(test_integration_config tests/test_integration_config.cpp)
target_compile_definitions(test_integration_config PRIVATE DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN)
target_sources(test_integration_config PRIVATE src/core/config.cpp)
target_link_libraries(test_integration_config PRIVATE yaml-cpp::yaml-cpp fmt::fmt spdlog::spdlog)
if(FMT_LIBRARY)
    target_link_libraries(test_integration_config PRIVATE ${FMT_LIBRARY})
endif()
if(SPDLOG_LIBRARY)
    target_link_libraries(test_integration_config PRIVATE ${SPDLOG_LIBRARY})
endif()
endif() # yaml+fmt+spdlog (integration_config)

if(TARGET fmt::fmt AND TARGET spdlog::spdlog)
add_doctest_test(test_integration_kill_switch_monitor tests/test_integration_kill_switch_monitor.cpp)
target_compile_definitions(test_integration_kill_switch_monitor PRIVATE DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN)
target_link_libraries(test_integration_kill_switch_monitor PRIVATE fmt::fmt spdlog::spdlog)
if(FMT_LIBRARY)
    target_link_libraries(test_integration_kill_switch_monitor PRIVATE ${FMT_LIBRARY})
endif()
if(SPDLOG_LIBRARY)
    target_link_libraries(test_integration_kill_switch_monitor PRIVATE ${SPDLOG_LIBRARY})
endif()
endif() # fmt+spdlog (kill_switch_monitor)

if(NOT WIN32)
    add_doctest_test(test_integration_shm tests/test_integration_shm.cpp)
    if(UNIX AND NOT APPLE)
        target_link_libraries(test_integration_shm PRIVATE rt)
    endif()
    # shm_fill_producer.h includes spdlog — needs the include path (vendored
    # or system). Never compiled on Windows (WIN32-gated), first Linux build.
    if(TARGET spdlog::spdlog)
        target_link_libraries(test_integration_shm PRIVATE spdlog::spdlog)
    endif()
    if(TARGET fmt::fmt)
        target_link_libraries(test_integration_shm PRIVATE fmt::fmt)
    endif()
    if(FMT_LIBRARY)
        target_link_libraries(test_integration_shm PRIVATE ${FMT_LIBRARY})
    endif()
    if(SPDLOG_LIBRARY)
        target_link_libraries(test_integration_shm PRIVATE ${SPDLOG_LIBRARY})
    endif()
endif()
