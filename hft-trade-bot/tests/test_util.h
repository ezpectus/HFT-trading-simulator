#pragma once
// Minimal hand-rolled test harness shared by the split v2 test files.
// TEST(name) registers via static init; test_report() prints + exits.
#include <cmath>
#include <cstdio>
#include <stdexcept>
#include <string>

inline int tests_run    = 0;
inline int tests_passed = 0;

#define TEST(name)                                                                                 \
    static void name();                                                                            \
    struct name##_runner {                                                                         \
        name##_runner() {                                                                          \
            tests_run++;                                                                           \
            printf("  [RUN] %s ... ", #name);                                                      \
            try {                                                                                  \
                name();                                                                            \
                tests_passed++;                                                                    \
                printf("PASS\n");                                                                  \
            } catch (const std::exception& e) {                                                    \
                printf("FAIL: %s\n", e.what());                                                    \
            }                                                                                      \
        }                                                                                          \
    } name##_instance;                                                                             \
    static void name()

#define ASSERT_TRUE(cond)                                                                          \
    do {                                                                                           \
        if (!(cond)) throw std::runtime_error(#cond " failed");                                    \
    } while (0)

#define ASSERT_FALSE(cond)                                                                         \
    do {                                                                                           \
        if (cond) throw std::runtime_error(#cond " should be false");                              \
    } while (0)

#define ASSERT_EQ(a, b)                                                                            \
    do {                                                                                           \
        if ((a) != (b)) throw std::runtime_error(#a " != " #b);                                    \
    } while (0)

#define ASSERT_NEAR(a, b, eps)                                                                     \
    do {                                                                                           \
        if (std::abs((a) - (b)) > (eps)) throw std::runtime_error(#a " not near " #b);             \
    } while (0)
inline int test_report(const char* title) {
    printf("\n===============================================================\n");
    printf("  %s\n", title);
    printf("  Results: %d/%d passed\n", tests_passed, tests_run);
    printf("===============================================================\n\n");
    return tests_passed == tests_run ? 0 : 1;
}
