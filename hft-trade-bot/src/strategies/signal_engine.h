// HFT Signal Engine — fast C++ indicators for low-latency signal generation
//
// Computes EMA, RSI, Order Book Imbalance (OBI), VWAP, Price Pressure,
// and FFT-based cycle detection directly from market data.
#pragma once

#include "../data/types.h"
#include "../data/signal.h"
#include <vector>
#include <string>
#include <deque>
#include <cmath>
#include <algorithm>
#include <complex>
#include <valarray>

namespace hft {

// FFT implementation (Cooley-Tukey radix-2)
inline void fft(std::valarray<std::complex<double>>& a) {
    auto n = a.size();
    if (n <= 1) return;

    std::valarray<std::complex<double>> even = a[std::slice(0, n / 2, 2)];
    std::valarray<std::complex<double>> odd = a[std::slice(1, n / 2, 2)];

    fft(even);
    fft(odd);

    for (size_t k = 0; k < n / 2; ++k) {
        double angle = -2.0 * M_PI * k / n;
        std::complex<double> w(std::cos(angle), std::sin(angle));
        a[k] = even[k] + w * odd[k];
        a[k + n / 2] = even[k] - w * odd[k];
    }
}

// FFT-based spectral trend score: -1 (ranging) to +1 (trending)
inline double spectral_trend_score(const std::vector<double>& closes) {
    size_t n = closes.size();
    if (n < 16) return 0.0;

    // Pad to power of 2
    size_t n_fft = 1;
    while (n_fft < n) n_fft <<= 1;

    // Detrend
    double mean = 0.0;
    for (auto c : closes) mean += c;
    mean /= n;

    std::valarray<std::complex<double>> data(0.0, n_fft);
    for (size_t i = 0; i < n; ++i) {
        // Hann window
        double w = 0.5 - 0.5 * std::cos(2.0 * M_PI * i / (n - 1));
        data[i] = std::complex<double>((closes[i] - mean) * w, 0.0);
    }

    fft(data);

    // Power spectrum (first half only)
    size_t half = n_fft / 2;
    std::vector<double> power(half);
    double total_power = 0.0;
    for (size_t i = 0; i < half; ++i) {
        power[i] = std::norm(data[i]);
        total_power += power[i];
    }
    if (total_power == 0) return 0.0;

    // Split: low freq = trend, high freq = noise/cycle
    size_t mid = half / 4;
    double low_power = 0.0, high_power = 0.0;
    for (size_t i = 0; i < mid; ++i) low_power += power[i];
    for (size_t i = mid; i < half; ++i) high_power += power[i];

    return (low_power - high_power) / total_power;
}

// FFT low-pass filter — smoothed price
inline std::vector<double> fft_lowpass(const std::vector<double>& closes, double keep_ratio = 0.15) {
    size_t n = closes.size();
    if (n < 16) return closes;

    size_t n_fft = 1;
    while (n_fft < n) n_fft <<= 1;

    double mean = 0.0;
    for (auto c : closes) mean += c;
    mean /= n;

    std::valarray<std::complex<double>> data(0.0, n_fft);
    for (size_t i = 0; i < n; ++i) {
        data[i] = std::complex<double>(closes[i] - mean, 0.0);
    }

    fft(data);

    // Zero out high frequencies
    size_t cutoff = static_cast<size_t>(n_fft * keep_ratio / 2);
    for (size_t i = cutoff; i < n_fft - cutoff; ++i) {
        data[i] = std::complex<double>(0.0, 0.0);
    }

    // Inverse FFT
    std::valarray<std::complex<double>> conj(n_fft);
    for (size_t i = 0; i < n_fft; ++i) conj[i] = std::conj(data[i]);
    fft(conj);

    std::vector<double> result(n);
    for (size_t i = 0; i < n; ++i) {
        result[i] = std::real(std::conj(conj[i])) / static_cast<double>(n_fft) + mean;
    }
    return result;
}

namespace hft {

// EMA computation
inline std::vector<double> compute_ema(const std::vector<double>& values, int period) {
    std::vector<double> result(values.size(), std::nan(""));
    if (static_cast<int>(values.size()) < period) return result;

    double mult = 2.0 / (period + 1);
    double ema = 0.0;
    for (int i = 0; i < period; ++i) ema += values[i];
    ema /= period;
    result[period - 1] = ema;

    for (size_t i = period; i < values.size(); ++i) {
        ema = values[i] * mult + ema * (1.0 - mult);
        result[i] = ema;
    }
    return result;
}

// RSI computation
inline std::vector<double> compute_rsi(const std::vector<double>& closes, int period = 14) {
    std::vector<double> result(closes.size(), std::nan(""));
    if (static_cast<int>(closes.size()) < period + 1) return result;

    double avg_gain = 0.0, avg_loss = 0.0;
    for (int i = 1; i <= period; ++i) {
        double change = closes[i] - closes[i - 1];
        if (change > 0) avg_gain += change;
        else avg_loss -= change;
    }
    avg_gain /= period;
    avg_loss /= period;

    result[period] = avg_loss == 0 ? 100.0 : 100.0 - 100.0 / (1.0 + avg_gain / avg_loss);

    for (size_t i = period + 1; i < closes.size(); ++i) {
        double change = closes[i] - closes[i - 1];
        double gain = change > 0 ? change : 0.0;
        double loss = change < 0 ? -change : 0.0;
        avg_gain = (avg_gain * (period - 1) + gain) / period;
        avg_loss = (avg_loss * (period - 1) + loss) / period;
        result[i] = avg_loss == 0 ? 100.0 : 100.0 - 100.0 / (1.0 + avg_gain / avg_loss);
    }
    return result;
}

// Order Book Imbalance — ratio of bid volume to total volume
inline double compute_obi(const OrderBook& ob, int levels = 10) {
    double bid_vol = 0.0, ask_vol = 0.0;
    int n = std::min(levels, static_cast<int>(ob.bids.size()));
    for (int i = 0; i < n && i < static_cast<int>(ob.asks.size()); ++i) {
        bid_vol += ob.bids[i].quantity;
        ask_vol += ob.asks[i].quantity;
    }
    double total = bid_vol + ask_vol;
    return total > 0 ? (bid_vol - ask_vol) / total : 0.0;
}

// VWAP from candle history
inline double compute_vwap(const std::vector<Candle>& candles) {
    double cum_pv = 0.0, cum_v = 0.0;
    for (const auto& c : candles) {
        double tp = (c.high + c.low + c.close) / 3.0;
        cum_pv += tp * c.volume;
        cum_v += c.volume;
    }
    return cum_v > 0 ? cum_pv / cum_v : 0.0;
}

// Price Pressure Model — compares recent buy vs sell pressure
inline double compute_pressure(const std::vector<Candle>& candles, int lookback = 5) {
    if (candles.size() < 2) return 0.0;
    int n = std::min(lookback, static_cast<int>(candles.size()) - 1);
    double buy_pressure = 0.0, sell_pressure = 0.0;
    for (int i = static_cast<int>(candles.size()) - n; i < static_cast<int>(candles.size()); ++i) {
        double body = candles[i].close - candles[i].open;
        if (body > 0) buy_pressure += body * candles[i].volume;
        else sell_pressure += -body * candles[i].volume;
    }
    double total = buy_pressure + sell_pressure;
    return total > 0 ? (buy_pressure - sell_pressure) / total : 0.0;
}

// HFT Signal Engine — combines fast indicators into a signal
class SignalEngine {
public:
    struct Params {
        int fast_ema_period{9};
        int slow_ema_period{21};
        bool obi_enabled{true};
        bool vwap_enabled{true};
        bool pressure_enabled{true};
        double obi_threshold{0.3};       // |OBI| > 0.3 = significant
        double pressure_threshold{0.3};  // |pressure| > 0.3 = significant
    };

    explicit SignalEngine(const Params& params) : params_(params) {}

    struct FastSignal {
        std::string symbol;
        std::string direction;  // "LONG", "SHORT", "NEUTRAL"
        double confidence{};
        std::string reason;
        double entry_price{};
        double stop_loss{};
        double take_profit{};
    };

    FastSignal analyze(const std::string& symbol, const std::vector<Candle>& candles,
                       const OrderBook& ob) {
        FastSignal sig;
        sig.symbol = symbol;
        sig.direction = "NEUTRAL";
        sig.confidence = 0.0;

        if (candles.size() < static_cast<size_t>(params_.slow_ema_period + 2)) {
            sig.reason = "Insufficient data";
            return sig;
        }

        // Extract closes
        std::vector<double> closes;
        closes.reserve(candles.size());
        for (const auto& c : candles) closes.push_back(c.close);

        double current_price = closes.back();

        // EMA crossover
        auto ema_fast = compute_ema(closes, params_.fast_ema_period);
        auto ema_slow = compute_ema(closes, params_.slow_ema_period);

        bool bullish = ema_fast.back() > ema_slow.back();
        bool bearish = ema_fast.back() < ema_slow.back();

        // OBI
        double obi = params_.obi_enabled ? compute_obi(ob) : 0.0;

        // Pressure
        double pressure = params_.pressure_enabled ? compute_pressure(candles) : 0.0;

        // VWAP
        double vwap = params_.vwap_enabled ? compute_vwap(candles) : current_price;

        // Score: combine signals
        int long_votes = 0;
        int short_votes = 0;

        if (bullish) long_votes++;
        if (bearish) short_votes++;

        if (obi > params_.obi_threshold) long_votes++;
        if (obi < -params_.obi_threshold) short_votes++;

        if (pressure > params_.pressure_threshold) long_votes++;
        if (pressure < -params_.pressure_threshold) short_votes++;

        if (current_price > vwap) long_votes++;
        if (current_price < vwap) short_votes++;

        // FFT spectral trend score
        if (closes.size() >= 64) {
            double fft_trend = spectral_trend_score(closes);
            if (fft_trend > 0.2) long_votes++;
            else if (fft_trend < -0.2) short_votes++;

            // FFT smoothed price direction
            auto smoothed = fft_lowpass(closes, 0.15);
            if (smoothed.size() >= 3) {
                double slope = smoothed.back() - smoothed[smoothed.size() - 3];
                if (slope > 0) long_votes++;
                else if (slope < 0) short_votes++;
            }
        }

        // ATR for SL/TP
        double atr_val = 0.0;
        if (candles.size() > 14) {
            double tr_sum = 0.0;
            for (size_t i = candles.size() - 14; i < candles.size(); ++i) {
                if (i == 0) continue;
                double tr = std::max({
                    candles[i].high - candles[i].low,
                    std::abs(candles[i].high - candles[i - 1].close),
                    std::abs(candles[i].low - candles[i - 1].close),
                });
                tr_sum += tr;
            }
            atr_val = tr_sum / 14.0;
        }
        if (atr_val == 0) atr_val = current_price * 0.01;

        if (long_votes >= 3 && long_votes > short_votes) {
            sig.direction = "LONG";
            sig.confidence = std::min(95.0, 35.0 + long_votes * 12.0);
            sig.entry_price = current_price;
            sig.stop_loss = current_price - 2.0 * atr_val;
            sig.take_profit = current_price + 3.0 * atr_val;
            sig.reason = fmt::format("HFT: {}/6 long votes (EMA={}, OBI={:.2f}, P={:.2f})",
                long_votes, bullish ? "bull" : "bear", obi, pressure);
        } else if (short_votes >= 3 && short_votes > long_votes) {
            sig.direction = "SHORT";
            sig.confidence = std::min(95.0, 35.0 + short_votes * 12.0);
            sig.entry_price = current_price;
            sig.stop_loss = current_price + 2.0 * atr_val;
            sig.take_profit = current_price - 3.0 * atr_val;
            sig.reason = fmt::format("HFT: {}/6 short votes (EMA={}, OBI={:.2f}, P={:.2f})",
                short_votes, bullish ? "bull" : "bear", obi, pressure);
        } else {
            sig.reason = fmt::format("HFT: {}L/{}S votes, no consensus", long_votes, short_votes);
        }

        return sig;
    }

private:
    Params params_;
};

} // namespace hft
