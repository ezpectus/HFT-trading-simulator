// doctest header-only framework — v2.4.11
// Retrieved from https://github.com/doctest/doctest
// This is a minimal stub for projects that need doctest as a single header.
// For full functionality, download the complete doctest.h from the official repo.
//
// Usage:
//   #define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
//   #include "doctest.h"
//
#pragma once

#ifdef DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#define DOCTEST_CONFIG_IMPLEMENT
#endif

#define DOCTEST_VERSION_MAJOR 2
#define DOCTEST_VERSION_MINOR 4
#define DOCTEST_VERSION_PATCH 11

// ─── Forward declaration of main when IMPLEMENT_WITH_MAIN ─────────────────
#ifdef DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
int main(int argc, char** argv) {
    extern int doctest_main(int, char**);
    return doctest_main(argc, argv);
}
#endif

// ─── Minimal test registration and execution ──────────────────────────────
// This stub provides basic TEST_CASE / CHECK / CHECK_FALSE / SUBCASE macros
// that work without the full doctest library. It's sufficient for simple
// unit tests. For advanced features (reporters, logging, fixtures, etc.),
// replace this file with the full doctest.h.

#include <cmath>
#include <cstdlib>
#include <functional>
#include <iostream>
#include <string>
#include <vector>

namespace doctest_detail {

struct TestCase {
    std::string           name;
    std::string           file;
    int                   line;
    std::function<void()> func;
};

inline std::vector<TestCase>& registry() {
    static std::vector<TestCase> tests;
    return tests;
}

struct Registrator {
    Registrator(const char* name, const char* file, int line, std::function<void()> func) {
        registry().push_back({name, file, line, func});
    }
};

inline int run_all() {
    int failed = 0;
    int passed = 0;
    for (auto& tc : registry()) {
        try {
            tc.func();
            ++passed;
        } catch (const std::exception& e) {
            std::cerr << "FAIL: " << tc.name << " — " << e.what() << std::endl;
            ++failed;
        }
    }
    std::cout << "\n=== Results: " << passed << " passed, " << failed << " failed ===" << std::endl;
    return failed > 0 ? 1 : 0;
}

} // namespace doctest_detail

// ─── doctest_main entry point ─────────────────────────────────────────────
#ifdef DOCTEST_CONFIG_IMPLEMENT
int doctest_main(int argc, char** argv) {
    (void)argc;
    (void)argv;
    return doctest_detail::run_all();
}
#endif

// ─── Assertion exception ──────────────────────────────────────────────────
namespace doctest {
struct assertion_error : std::runtime_error {
    using std::runtime_error::runtime_error;
};

class Approx {
    double m_value, m_epsilon;

  public:
    explicit Approx(double v) : m_value(v), m_epsilon(0.01) {}
    Approx epsilon(double e) {
        m_epsilon = e;
        return *this;
    }
    bool operator==(double other) const {
        return std::abs(m_value - other) <= std::abs(m_value) * m_epsilon;
    }
    friend bool operator==(double other, const Approx& a) { return a == other; }
};
} // namespace doctest

// ─── Macros ───────────────────────────────────────────────────────────────
#define DOCTEST_STRINGIFY(x) #x
#define DOCTEST_TOSTRING(x) DOCTEST_STRINGIFY(x)

#define DOCTEST_CAT_I(a, b) a##b
#define DOCTEST_CAT(a, b) DOCTEST_CAT_I(a, b)

#define TEST_CASE(name)                                                                            \
    static void                        DOCTEST_ANON_FUNC();                                        \
    static doctest_detail::Registrator DOCTEST_ANON_REG(name, __FILE__, __LINE__,                  \
                                                        DOCTEST_ANON_FUNC);                        \
    static void                        DOCTEST_ANON_FUNC()

#define DOCTEST_ANON_FUNC DOCTEST_CAT(doctest_anon_func_, __LINE__)
#define DOCTEST_ANON_REG DOCTEST_CAT(doctest_anon_reg_, __LINE__)

#define TEST_SUITE(name) namespace

#define CHECK(cond)                                                                                \
    do {                                                                                           \
        if (!(cond))                                                                               \
            throw doctest::assertion_error("CHECK failed: " DOCTEST_TOSTRING(                      \
                cond) " at " __FILE__ ":" DOCTEST_TOSTRING(__LINE__));                             \
    } while (0)

#define CHECK_FALSE(cond) CHECK(!(cond))

#define CHECK_EQ(a, b) CHECK((a) == (b))
#define CHECK_NE(a, b) CHECK((a) != (b))
#define CHECK_LT(a, b) CHECK((a) < (b))
#define CHECK_GT(a, b) CHECK((a) > (b))
#define CHECK_LE(a, b) CHECK((a) <= (b))
#define CHECK_GE(a, b) CHECK((a) >= (b))

#define REQUIRE(cond) CHECK(cond)
#define REQUIRE_FALSE(cond) CHECK_FALSE(cond)
#define REQUIRE_EQ(a, b) CHECK_EQ(a, b)

// ─── Exception assertions ─────────────────────────────────────────────────
// CHECK_THROWS_AS evaluates the expression inside a lambda so the comma-
// separated type argument never collides with macro parameter parsing.
#define CHECK_THROWS_AS(expr, ex_type)                                                             \
    do {                                                                                           \
        bool dt_threw_ = false;                                                                    \
        bool dt_right_ = false;                                                                    \
        try {                                                                                      \
            (void)(expr);                                                                          \
        } catch (const ex_type&) {                                                                 \
            dt_threw_ = true;                                                                      \
            dt_right_ = true;                                                                      \
        } catch (...) {                                                                            \
            dt_threw_ = true;                                                                      \
        }                                                                                          \
        if (!dt_threw_)                                                                            \
            throw doctest::assertion_error("CHECK_THROWS_AS failed: no exception from " #expr      \
                                           " at " __FILE__ ":" DOCTEST_TOSTRING(__LINE__));        \
        if (!dt_right_)                                                                            \
            throw doctest::assertion_error(                                                        \
                "CHECK_THROWS_AS failed: wrong exception type in " #expr " at " __FILE__           \
                ":" DOCTEST_TOSTRING(__LINE__));                                                   \
    } while (0)

#define CHECK_THROWS(expr)                                                                         \
    do {                                                                                           \
        bool dt_threw_ = false;                                                                    \
        try {                                                                                      \
            (void)(expr);                                                                          \
        } catch (...) {                                                                            \
            dt_threw_ = true;                                                                      \
        }                                                                                          \
        if (!dt_threw_)                                                                            \
            throw doctest::assertion_error("CHECK_THROWS failed: no exception from " #expr         \
                                           " at " __FILE__ ":" DOCTEST_TOSTRING(__LINE__));        \
    } while (0)

#define CHECK_NOTHROW(expr)                                                                        \
    do {                                                                                           \
        try {                                                                                      \
            (void)(expr);                                                                          \
        } catch (const std::exception& dt_e_) {                                                    \
            throw doctest::assertion_error(std::string("CHECK_NOTHROW failed: threw '") +          \
                                           dt_e_.what() +                                          \
                                           "' at " __FILE__ ":" DOCTEST_TOSTRING(__LINE__));       \
        } catch (...) {                                                                            \
            throw doctest::assertion_error("CHECK_NOTHROW failed: threw at " __FILE__              \
                                           ":" DOCTEST_TOSTRING(__LINE__));                        \
        }                                                                                          \
    } while (0)

#define REQUIRE_THROWS_AS(expr, ex_type) CHECK_THROWS_AS(expr, ex_type)
#define REQUIRE_THROWS(expr) CHECK_THROWS(expr)
#define REQUIRE_NOTHROW(expr) CHECK_NOTHROW(expr)

#define SUBCASE(name)                                                                              \
    static void DOCTEST_SUBCASE_FUNC();                                                            \
    DOCTEST_SUBCASE_FUNC();                                                                        \
    static void DOCTEST_SUBCASE_FUNC()

#define DOCTEST_SUBCASE_FUNC DOCTEST_CAT(doctest_subcase_func_, __LINE__)

// Approx helper
using doctest::Approx;
