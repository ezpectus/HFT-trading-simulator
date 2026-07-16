# HFT Trade Bot — CMake build configuration
# Requires: C++20, Boost.Beast, websocketpp, nlohmann/json, spdlog, fmt, yaml-cpp
#           simdjson (optional, for fast JSON parsing)
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

# ─── Compiler flags ───
# GCC/Clang: -O3 + LTO for maximum performance
# MSVC: /O2 + /GL (whole-program optimization) + /utf-8
if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU" OR CMAKE_CXX_COMPILER_ID STREQUAL "Clang")
    set(CMAKE_CXX_FLAGS_RELEASE "-O3 -DNDEBUG -flto")
    set(CMAKE_CXX_FLAGS_DEBUG "-g -O0 -fsanitize=address -fsanitize=undefined")
elseif(CMAKE_CXX_COMPILER_ID STREQUAL "MSVC")
    set(CMAKE_CXX_FLAGS_RELEASE "/O2 /DNDEBUG /GL /utf-8 /Zc:preprocessor")
    set(CMAKE_CXX_FLAGS_DEBUG "/Od /Zi /fsanitize=address /utf-8 /Zc:preprocessor")
    add_compile_options(/utf-8 /Zc:preprocessor)
endif()

# Enable LTO in linker as well (GCC/Clang only — MSVC uses per-target IPO)
if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU" OR CMAKE_CXX_COMPILER_ID STREQUAL "Clang")
    set(CMAKE_INTERPROCEDURAL_OPTIMIZATION_RELEASE ON)
endif()

# Architecture-specific optimizations (Nehalem+ for SSE4.2, Haswell+ for AVX2)
# -march=native with fallback for cross-compilation safety
if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU")
    add_compile_options(-msse4.2)

    # Try -march=native, fall back to x86-64 if unsupported
    include(CheckCXXCompilerFlag)
    check_cxx_compiler_flag("-march=native" COMPILER_SUPPORTS_MARCH_NATIVE)
    if(COMPILER_SUPPORTS_MARCH_NATIVE)
        add_compile_options(-march=native)
    else()
        message(STATUS "-march=native not supported — using default architecture")
    endif()

    add_compile_options(-ffast-math -fno-math-errno)
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
# Boost: on Linux use system install (apt), on Windows use vcpkg
if(UNIX AND NOT APPLE)
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
find_package(OpenSSL REQUIRED)
find_package(Threads REQUIRED)

# spdlog
find_package(spdlog REQUIRED)
# fmt
find_package(fmt REQUIRED)
# nlohmann_json
find_package(nlohmann_json REQUIRED)
# yaml-cpp — robust target resolution for Debian/Ubuntu packages
find_package(yaml-cpp REQUIRED)
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
        else()
            message(FATAL_ERROR "yaml-cpp library not found — install libyaml-cpp-dev")
        endif()
    endif()
endif()

# simdjson (optional — for fast JSON parsing in hot path)
find_package(simdjson QUIET)

# websocketpp (header-only) — check vcpkg first, then project root
find_path(WEBSOCKETPP_INCLUDE_DIR websocketpp/client.hpp
    PATHS "${CMAKE_SOURCE_DIR}/../websocketpp" "${_VCPKG_INCLUDE_DIR}"
)
if(NOT WEBSOCKETPP_INCLUDE_DIR)
    message(WARNING "websocketpp not found. Install with: vcpkg install websocketpp — targets using it will fail to compile")
    set(WEBSOCKETPP_INCLUDE_DIR "")
endif()

# Sources
set(SOURCES
    src/core/main.cpp
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

# Link simdjson if found
if(simdjson_FOUND)
    target_link_libraries(hft_trade_bot PRIVATE simdjson::simdjson)
    target_compile_definitions(hft_trade_bot PRIVATE HFT_HAS_SIMDJSON)
    message(STATUS "simdjson found — enabling fast JSON parsing")
endif()

# Enable LTO for the target
set_target_properties(hft_trade_bot PROPERTIES
    INTERPROCEDURAL_OPTIMIZATION TRUE
)

# Install
install(TARGETS hft_trade_bot DESTINATION bin)
install(DIRECTORY config/ DESTINATION config)

# ─── Unit Tests ───
enable_testing()

add_executable(test_signal_engine tests/test_signal_engine.cpp)
target_include_directories(test_signal_engine PRIVATE
    ${CMAKE_SOURCE_DIR}/src
    ${WEBSOCKETPP_INCLUDE_DIR}
)
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

# ─── V2 Tests ───
add_executable(test_signal_engine_v2 tests/test_signal_engine_v2.cpp src/strategies/signal_engine_v2.cpp)
target_include_directories(test_signal_engine_v2 PRIVATE
    ${CMAKE_SOURCE_DIR}/src
    ${WEBSOCKETPP_INCLUDE_DIR}
)
target_link_libraries(test_signal_engine_v2 PRIVATE
    fmt::fmt
    Threads::Threads
)
set_target_properties(test_signal_engine_v2 PROPERTIES
    CXX_STANDARD 20
    CXX_STANDARD_REQUIRED ON
    INTERPROCEDURAL_OPTIMIZATION FALSE
)
add_test(NAME signal_engine_v2_tests COMMAND test_signal_engine_v2)

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

# Order book manager tests
add_hft_test(test_order_book tests/test_order_book.cpp)

# Mean reversion v2 tests
add_hft_test(test_mean_reversion tests/test_mean_reversion.cpp)

# Market making v2 tests
add_hft_test(test_market_making tests/test_market_making.cpp)

# Risk engine tests
add_hft_test(test_risk tests/test_risk.cpp)

# Order manager tests
add_hft_test(test_order_manager tests/test_order_manager.cpp)

# Position manager v2 tests
add_hft_test(test_position_manager tests/test_position_manager.cpp)

# SHM ring buffer tests (POSIX-only — shm_open, mmap)
if(NOT WIN32)
    add_hft_test(test_shm tests/test_shm.cpp)
    if(UNIX AND NOT APPLE)
        target_link_libraries(test_shm PRIVATE rt)
    endif()
endif()

# FIX 4.4 protocol tests
add_hft_test(test_fix tests/test_fix.cpp)

# Latency tracker tests
add_hft_test(test_latency_tracker tests/test_latency_tracker.cpp)

# ─── New unit tests (monitoring, network, exchange config) ───
add_hft_test(test_monitoring tests/unit/test_monitoring.cpp)
add_hft_test(test_network tests/unit/test_network.cpp)
add_hft_test(test_exchange_config tests/unit/test_exchange_config.cpp)

# ─── Integration tests ───
if(NOT WIN32)
    add_hft_test(test_integration_signal_flow tests/integration/test_signal_flow.cpp)
endif()

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

# Risk manager doctest tests (no fmt dependency — uses minimal stub)
add_doctest_test(test_doctest_risk_manager tests/test_doctest_risk_manager.cpp)

# Pressure model doctest tests
add_doctest_test(test_doctest_pressure_model tests/test_doctest_pressure_model.cpp)

# Signal engine doctest tests (indicators + params + analyze)
add_doctest_test(test_doctest_signal_engine tests/test_doctest_signal_engine.cpp)

# Position manager v2 doctest tests (open/close/reverse, PnL, margin, SL/TP)
add_doctest_test(test_doctest_position_manager tests/test_doctest_position_manager.cpp)

# Momentum breakout v2 doctest tests (EMA stack, volume confirm, ADX gate, SL/TP)
add_doctest_test(test_doctest_momentum_breakout tests/test_doctest_momentum_breakout.cpp)

# Market making v2 doctest tests (reservation price, inventory skew, toxicity, spread)
add_doctest_test(test_doctest_market_making tests/test_doctest_market_making.cpp)

# Statistical arbitrage v2 doctest tests (OLS, Kalman hedge ratio, z-score, correlation matrix)
add_doctest_test(test_doctest_statistical_arb tests/test_doctest_statistical_arb.cpp)

# Mean reversion v2 doctest tests (Kalman filter, OU params, z-score tracking, signals)
add_doctest_test(test_doctest_mean_reversion tests/test_doctest_mean_reversion.cpp)

# Smart order router v2 doctest tests (5 strategies, toxic backoff, depth-aware, ExchangeBase)
add_doctest_test(test_doctest_smart_order_router tests/test_doctest_smart_order_router.cpp)

# Order manager doctest tests (lifecycle, partial fill, timeout, modify, slot reuse)
add_doctest_test(test_doctest_order_manager tests/test_doctest_order_manager.cpp)

# Latency tracker doctest tests (per-stage recording, percentiles, budget alerts, scoped measurement)
add_doctest_test(test_doctest_latency_tracker tests/test_doctest_latency_tracker.cpp)

# Position manager V1 doctest tests (open, close, pnl, SL/TP, NEUTRAL guard)
add_doctest_test(test_doctest_position_manager_v1 tests/test_doctest_position_manager_v1.cpp)

# Portfolio risk doctest tests (drawdown, historical VaR, parametric VaR, CVaR, stress test, correlation exposure)
add_doctest_test(test_doctest_portfolio_risk tests/test_doctest_portfolio_risk.cpp)

# Pre-trade risk doctest tests (token bucket, blacklist/whitelist, position limits, exposure, daily loss, margin check regression)
add_doctest_test(test_doctest_pre_trade_risk tests/test_doctest_pre_trade_risk.cpp)

# Position manager V2 doctest tests (open/add/close/reverse, weighted avg, PnL, margin, fees, SL/TP, margin call, reset)
add_doctest_test(test_doctest_position_manager_v2 tests/test_doctest_position_manager_v2.cpp)

# Candle aggregator doctest tests (time/volume/tick modes, OHLC, flush, zero-price edge case regression)
add_doctest_test(test_doctest_candle_aggregator tests/test_doctest_candle_aggregator.cpp)

# Trade handler doctest tests (aggressor detection, VWAP, rolling stats O(1) incremental, large trade detection, reset)
add_doctest_test(test_doctest_trade_handler tests/test_doctest_trade_handler.cpp)

# Order book manager doctest tests (L2 book, bid/ask updates, removal, snapshot, spread regime, OBI, crossed/locked)
add_doctest_test(test_doctest_order_book_manager tests/test_doctest_order_book_manager.cpp)

# Kill switch doctest tests (activate/deactivate, reason+timestamp recording regression, callbacks, idempotency)
add_doctest_test(test_doctest_kill_switch tests/test_doctest_kill_switch.cpp)

# SHM heartbeat doctest tests (writer/reader round-trip, seq consistency, is_alive, age_ms, auto heartbeat)
add_doctest_test(test_doctest_shm_heartbeat tests/test_doctest_shm_heartbeat.cpp)

# SHM market data doctest tests (write/read round-trip, num_slots header, multiple symbols, bounds, writer/reader)
add_doctest_test(test_doctest_shm_market_data tests/test_doctest_shm_market_data.cpp)

# SHM ring buffer bulk push/pop optimization tests (contiguous, wrap-around, partial fill, full cycle)
add_doctest_test(test_doctest_shm_bulk tests/test_doctest_shm_bulk.cpp)

# Adaptive order selector V2 doctest tests (emergency FOK, toxic IOC, confidence/spread/OBI paths, GTD, PostOnly, exchange mappings)
add_doctest_test(test_doctest_adaptive_order_selector tests/test_doctest_adaptive_order_selector.cpp)

# System monitor doctest tests (counters, fill/rejection rate, snapshot, reset, format_json regression, MemoryTracker, HealthStatus)
add_doctest_test(test_doctest_system_monitor tests/test_doctest_system_monitor.cpp)

# Order type selector + core types doctest tests (select branches, limit_price, OrderBook methods, Position PnL, side conversion)
add_doctest_test(test_doctest_order_type_selector tests/test_doctest_order_type_selector.cpp)

# FIX message doctest tests (build, finalize, parse, checksum validation round-trip, field access, edge cases)
add_doctest_test(test_doctest_fix_message tests/test_doctest_fix_message.cpp)

# Property-based tests (random market data + invariant checking: SL/TP always closes, PnL consistency, weighted avg entry)
add_doctest_test(test_doctest_property_based tests/test_doctest_property_based.cpp)

# Signal Engine V3 doctest tests (HMM regime detection, state transitions, regime gating, multi-symbol)
add_doctest_test(test_doctest_signal_engine_v3 tests/test_doctest_signal_engine_v3.cpp)

# ─── Integration tests (doctest-based) ───
add_doctest_test(test_integration_config tests/test_integration_config.cpp)
target_link_libraries(test_integration_config PRIVATE yaml-cpp::yaml-cpp)

add_doctest_test(test_integration_signal_engine tests/test_integration_signal_engine.cpp)

add_doctest_test(test_integration_kill_switch_monitor tests/test_integration_kill_switch_monitor.cpp)

if(NOT WIN32)
    add_doctest_test(test_integration_shm tests/test_integration_shm.cpp)
    if(UNIX AND NOT APPLE)
        target_link_libraries(test_integration_shm PRIVATE rt)
    endif()
endif()
