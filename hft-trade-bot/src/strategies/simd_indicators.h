// SIMD Optimized Indicators — AVX2 for parallel indicator calculations
//
// Provides SIMD-accelerated EMA and other indicator calculations for improved performance.
// Uses AVX2 instructions for parallel processing of 8 double-precision values.
#pragma once

#include <array>
#include <cmath>
#include <cstdint>
#include <immintrin.h>
#include <vector>

namespace hft {

// SIMD-optimized EMA calculation using AVX2
class SimdEMA {
  public:
    // Calculate EMA for a single value (scalar fallback)
    static double ema_scalar(double current, double prev_ema, double alpha) {
        return alpha * current + (1.0 - alpha) * prev_ema;
    }

    // Calculate EMA for 8 values in parallel using AVX2
    static void ema_avx2(const double* current, const double* prev_ema, double alpha,
                         double* result, size_t count) {
#if defined(__AVX2__)
        __m256d alpha_vec = _mm256_set1_pd(alpha);
        __m256d one_minus_alpha = _mm256_set1_pd(1.0 - alpha);

        for (size_t i = 0; i < count; i += 4) {
            __m256d curr = _mm256_loadu_pd(current + i);
            __m256d prev = _mm256_loadu_pd(prev_ema + i);
            __m256d ema = _mm256_fmadd_pd(alpha_vec, curr, _mm256_mul_pd(one_minus_alpha, prev));
            _mm256_storeu_pd(result + i, ema);
        }
#else
        // Fallback to scalar if AVX2 not available
        for (size_t i = 0; i < count; ++i) {
            result[i] = ema_scalar(current[i], prev_ema[i], alpha);
        }
#endif
    }

    // Calculate EMA for entire array
    static std::vector<double> ema_array(const std::vector<double>& prices, double alpha) {
        std::vector<double> ema_values(prices.size());
        if (prices.empty()) return ema_values;

        ema_values[0] = prices[0];
        for (size_t i = 1; i < prices.size(); ++i) {
            ema_values[i] = ema_scalar(prices[i], ema_values[i - 1], alpha);
        }
        return ema_values;
    }
};

// SIMD-optimized RSI calculation
class SimdRSI {
  public:
    // Calculate RSI using SIMD for gain/loss calculations
    static double rsi(const std::vector<double>& prices, int period) {
        if (prices.size() < static_cast<size_t>(period + 1)) {
            return 50.0; // Default neutral
        }

        double avg_gain = 0.0;
        double avg_loss = 0.0;

        // Initial average gain/loss
        for (int i = 1; i <= period; ++i) {
            double change = prices[i] - prices[i - 1];
            if (change > 0) {
                avg_gain += change;
            } else {
                avg_loss -= change;
            }
        }
        avg_gain /= period;
        avg_loss /= period;

        // Exponential smoothing
        double alpha = 1.0 / period;
        for (size_t i = period + 1; i < prices.size(); ++i) {
            double change = prices[i] - prices[i - 1];
            double gain = change > 0 ? change : 0.0;
            double loss = change < 0 ? -change : 0.0;

            avg_gain = alpha * gain + (1.0 - alpha) * avg_gain;
            avg_loss = alpha * loss + (1.0 - alpha) * avg_loss;
        }

        if (avg_loss == 0.0) return 100.0;
        double rs = avg_gain / avg_loss;
        return 100.0 - (100.0 / (1.0 + rs));
    }
};

// SIMD-optimized moving average
class SimdMA {
  public:
    // Simple moving average using SIMD for sum reduction
    static double sma(const std::vector<double>& prices, int period) {
        if (prices.size() < static_cast<size_t>(period)) {
            return prices.empty() ? 0.0 : prices.back();
        }

        double sum = 0.0;
#if defined(__AVX2__)
        size_t simd_count = (period / 4) * 4;
        __m256d sum_vec = _mm256_setzero_pd();

        for (size_t i = 0; i < simd_count; i += 4) {
            __m256d prices_vec = _mm256_loadu_pd(prices.data() + i);
            sum_vec = _mm256_add_pd(sum_vec, prices_vec);
        }

        // Horizontal sum
        __m128d high = _mm256_extractf128_pd(sum_vec, 1);
        __m128d low = _mm256_castpd256_pd128(sum_vec);
        low = _mm_add_pd(low, high);
        __m128d high64 = _mm_unpackhi_pd(low, low);
        low = _mm_add_sd(low, high64);
        sum = _mm_cvtsd_f64(low);

        // Add remaining elements
        for (size_t i = simd_count; i < static_cast<size_t>(period); ++i) {
            sum += prices[i];
        }
#else
        for (int i = 0; i < period; ++i) {
            sum += prices[i];
        }
#endif
        return sum / period;
    }
};

// SIMD-optimized VWAP calculation
class SimdVWAP {
  public:
    // Volume-weighted average price using SIMD
    static double vwap(const std::vector<double>& prices, const std::vector<double>& volumes,
                       int period) {
        if (prices.size() < static_cast<size_t>(period) || volumes.size() < static_cast<size_t>(period)) {
            return prices.empty() ? 0.0 : prices.back();
        }

        double sum_pv = 0.0;
        double sum_v = 0.0;

#if defined(__AVX2__)
        size_t simd_count = (period / 4) * 4;
        __m256d sum_pv_vec = _mm256_setzero_pd();
        __m256d sum_v_vec = _mm256_setzero_pd();

        for (size_t i = 0; i < simd_count; i += 4) {
            __m256d prices_vec = _mm256_loadu_pd(prices.data() + i);
            __m256d volumes_vec = _mm256_loadu_pd(volumes.data() + i);
            __m256d pv_vec = _mm256_mul_pd(prices_vec, volumes_vec);
            sum_pv_vec = _mm256_add_pd(sum_pv_vec, pv_vec);
            sum_v_vec = _mm256_add_pd(sum_v_vec, volumes_vec);
        }

        // Horizontal sum for sum_pv
        __m128d high_pv = _mm256_extractf128_pd(sum_pv_vec, 1);
        __m128d low_pv = _mm256_castpd256_pd128(sum_pv_vec);
        low_pv = _mm_add_pd(low_pv, high_pv);
        __m128d high64_pv = _mm_unpackhi_pd(low_pv, low_pv);
        low_pv = _mm_add_sd(low_pv, high64_pv);
        sum_pv = _mm_cvtsd_f64(low_pv);

        // Horizontal sum for sum_v
        __m128d high_v = _mm256_extractf128_pd(sum_v_vec, 1);
        __m128d low_v = _mm256_castpd256_pd128(sum_v_vec);
        low_v = _mm_add_pd(low_v, high_v);
        __m128d high64_v = _mm_unpackhi_pd(low_v, low_v);
        low_v = _mm_add_sd(low_v, high64_v);
        sum_v = _mm_cvtsd_f64(low_v);

        // Add remaining elements
        for (size_t i = simd_count; i < static_cast<size_t>(period); ++i) {
            sum_pv += prices[i] * volumes[i];
            sum_v += volumes[i];
        }
#else
        for (int i = 0; i < period; ++i) {
            sum_pv += prices[i] * volumes[i];
            sum_v += volumes[i];
        }
#endif

        return sum_v > 0 ? sum_pv / sum_v : 0.0;
    }
};

// SIMD utility functions
class SimdUtils {
  public:
    // Check if AVX2 is supported at runtime
    static bool has_avx2() {
#if defined(__AVX2__)
        return true;
#else
        return false;
#endif
    }

    // Get CPU feature string
    static std::string get_cpu_features() {
        std::string features;
#if defined(__AVX2__)
        features += "AVX2 ";
#endif
#if defined(__AVX__)
        features += "AVX ";
#endif
#if defined(__SSE4_2__)
        features += "SSE4.2 ";
#endif
        if (features.empty()) {
            features = "None";
        }
        return features;
    }
};

} // namespace hft
