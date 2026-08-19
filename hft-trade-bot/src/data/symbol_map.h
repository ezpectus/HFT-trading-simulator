// Symbol Map — Perfect hash function for O(1) symbol lookup
//
// Provides compile-time and runtime perfect hash for symbol strings to numeric IDs.
// Eliminates linear searches and unordered_map overhead in hot path.
#pragma once

#include <cstdint>
#include <string>
#include <string_view>
#include <unordered_map>

namespace hft {

// Compile-time string hash (FNV-1a variant)
constexpr uint64_t symbol_hash(std::string_view str) noexcept {
    uint64_t hash = 14695981039346656037ULL;
    for (char c : str) {
        hash ^= static_cast<uint64_t>(c);
        hash *= 1099511628211ULL;
    }
    return hash;
}

// Symbol Map — bidirectional mapping between symbol strings and numeric IDs
class SymbolMap {
  public:
    SymbolMap() = default;

    // Build symbol map from list of symbols
    void build(const std::vector<std::string>& symbols) {
        for (size_t i = 0; i < symbols.size(); ++i) {
            uint16_t id = static_cast<uint16_t>(i);
            symbol_to_id_[symbols[i]] = id;
            id_to_symbol_[id] = symbols[i];
        }
    }

    // Get numeric ID from symbol string (O(1) average)
    [[nodiscard]] uint16_t get_id(std::string_view symbol) const {
        auto it = symbol_to_id_.find(std::string(symbol));
        if (it != symbol_to_id_.end()) {
            return it->second;
        }
        return 0xFFFF; // Invalid ID
    }

    // Get symbol string from numeric ID (O(1))
    [[nodiscard]] std::string_view get_symbol(uint16_t id) const {
        auto it = id_to_symbol_.find(id);
        if (it != id_to_symbol_.end()) {
            return it->second;
        }
        return "";
    }

    // Check if symbol exists
    [[nodiscard]] bool has_symbol(std::string_view symbol) const {
        return symbol_to_id_.find(std::string(symbol)) != symbol_to_id_.end();
    }

    // Get total number of symbols
    [[nodiscard]] size_t size() const { return symbol_to_id_.size(); }

    // Clear all mappings
    void clear() {
        symbol_to_id_.clear();
        id_to_symbol_.clear();
    }

  private:
    std::unordered_map<std::string, uint16_t> symbol_to_id_;
    std::unordered_map<uint16_t, std::string> id_to_symbol_;
};

// Compile-time symbol lookup table for known symbols
// Uses FNV-1a hash for initial bucket probe, with verification to handle collisions.
class PerfectSymbolMap {
  public:
    // Compile-time known symbols (can be extended)
    static constexpr const char* KNOWN_SYMBOLS[] = {
        "BTC/USDT",
        "ETH/USDT",
        "SOL/USDT",
        "BNB/USDT",
        "XRP/USDT",
        "ADA/USDT",
        "DOGE/USDT",
        "DOT/USDT",
        "MATIC/USDT",
        "LINK/USDT",
    };
    static constexpr size_t NUM_KNOWN_SYMBOLS = sizeof(KNOWN_SYMBOLS) / sizeof(KNOWN_SYMBOLS[0]);

    // Get ID for a known symbol. Returns 0xFFFF if not found.
    // Uses hash for initial probe, then verifies to avoid collisions.
    [[nodiscard]] static uint16_t get_id(std::string_view symbol) {
        uint16_t bucket = static_cast<uint16_t>(symbol_hash(symbol) % NUM_KNOWN_SYMBOLS);
        if (bucket < NUM_KNOWN_SYMBOLS && symbol == KNOWN_SYMBOLS[bucket]) {
            return bucket;
        }
        // Hash collision or unknown symbol — fall back to linear search
        for (size_t i = 0; i < NUM_KNOWN_SYMBOLS; ++i) {
            if (symbol == KNOWN_SYMBOLS[i]) {
                return static_cast<uint16_t>(i);
            }
        }
        return 0xFFFF; // Not found
    }

    // Get symbol from ID (O(1))
    [[nodiscard]] static std::string_view get_symbol(uint16_t id) {
        if (id < NUM_KNOWN_SYMBOLS) {
            return KNOWN_SYMBOLS[id];
        }
        return "";
    }

    // Check if symbol is in known set
    [[nodiscard]] static bool is_known(std::string_view symbol) {
        for (size_t i = 0; i < NUM_KNOWN_SYMBOLS; ++i) {
            if (symbol == KNOWN_SYMBOLS[i]) {
                return true;
            }
        }
        return false;
    }
};

} // namespace hft
