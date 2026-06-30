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
if(USE_UNITY_BUILD)
    set(CMAKE_UNITY_BUILD ON)
    message(STATUS "Unity build enabled")
endif()

# ─── Precompiled headers ───
option(USE_PCH "Enable precompiled headers" ON)

# ─── Compiler flags ───
# Release: -O3 + LTO for maximum performance
set(CMAKE_CXX_FLAGS_RELEASE "-O3 -DNDEBUG -flto")
set(CMAKE_CXX_FLAGS_DEBUG "-g -O0 -fsanitize=address -fsanitize=undefined")

# Enable LTO in linker as well
set(CMAKE_INTERPROCEDURAL_OPTIMIZATION_RELEASE ON)
set(CMAKE_INTERPROCEDURAL_OPTIMIZATION ON)

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

# Find dependencies
find_package(Boost REQUIRED COMPONENTS system)
find_package(OpenSSL REQUIRED)
find_package(Threads REQUIRED)

# spdlog
find_package(spdlog REQUIRED)
# fmt
find_package(fmt REQUIRED)
# nlohmann_json
find_package(nlohmann_json REQUIRED)
# yaml-cpp
find_package(yaml-cpp REQUIRED)

# simdjson (optional — for fast JSON parsing in hot path)
find_package(simdjson QUIET)

# websocketpp (header-only)
find_path(WEBSOCKETPP_INCLUDE_DIR websocketpp/client.hpp)
if(NOT WEBSOCKETPP_INCLUDE_DIR)
    message(FATAL_ERROR "websocketpp not found. Install with: vcpkg install websocketpp")
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
    Boost::system
    OpenSSL::SSL
    OpenSSL::Crypto
    Threads::Threads
    spdlog::spdlog
    fmt::fmt
    nlohmann_json::nlohmann_json
    yaml-cpp
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
)
add_test(NAME signal_engine_v2_tests COMMAND test_signal_engine_v2)
