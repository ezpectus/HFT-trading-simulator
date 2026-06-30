// SHM IPC protocol structures — shared between C++ and Python.
//
// Binary layout must match Python struct definitions exactly.
// All structs use explicit padding for cross-language alignment.
#pragma once

#include <cstdint>

namespace hft::ipc {

// ─────────────────────────────────────────────────────────────────────────────
// Signal struct — 32 bytes
// Python: struct.Struct('<Q B B f f f f B 3x')
// ─────────────────────────────────────────────────────────────────────────────
struct SignalMsg {
    uint64_t timestamp;    // ns since epoch
    uint8_t  symbol_id;    // 0=BTC, 1=ETH, 2=SOL, ...
    uint8_t  action;       // 0=NEUTRAL, 1=LONG, 2=SHORT
    float    confidence;   // 0.0 - 1.0
    float    price;        // Entry price
    float    sl;           // Stop loss
    float    tp;           // Take profit
    uint8_t  leverage;     // 1-125
    uint8_t  pad_[3];      // Align to 32 bytes
};

static_assert(sizeof(SignalMsg) == 32, "SignalMsg must be 32 bytes");

// ─────────────────────────────────────────────────────────────────────────────
// Fill struct — 28 bytes
// Python: struct.Struct('<Q B B f f f B 5x')
// ─────────────────────────────────────────────────────────────────────────────
struct FillMsg {
    uint64_t timestamp;    // ns since epoch
    uint8_t  symbol_id;    // 0=BTC, 1=ETH, ...
    uint8_t  side;         // 0=BUY, 1=SELL
    float    qty;          // Filled quantity
    float    price;        // Fill price
    float    fee;          // Fee paid
    uint8_t  exchange_id;  // 0=Binance, 1=OKX, 2=Bybit, 3=Simulator
    uint8_t  pad_[5];      // Align to 28 bytes
};

static_assert(sizeof(FillMsg) == 28, "FillMsg must be 28 bytes");

// ─────────────────────────────────────────────────────────────────────────────
// MarketSnapshot struct — 28 bytes
// Python: struct.Struct('<Q B 3x f f f f')
// ─────────────────────────────────────────────────────────────────────────────
struct MarketSnapshotMsg {
    uint64_t timestamp;    // ns since epoch
    uint8_t  symbol_id;    // 0=BTC, 1=ETH, ...
    uint8_t  pad_[3];      // Align float fields
    float    bid;          // Best bid
    float    ask;          // Best ask
    float    last;         // Last trade price
    float    volume;       // 24h volume
};

static_assert(sizeof(MarketSnapshotMsg) == 28, "MarketSnapshotMsg must be 28 bytes");

// ─────────────────────────────────────────────────────────────────────────────
// KillSwitch struct — 16 bytes
// ─────────────────────────────────────────────────────────────────────────────
struct KillSwitchMsg {
    uint64_t timestamp;
    uint8_t  active;       // 1=kill switch activated, 0=normal
    uint8_t  reason;       // 0=manual, 1=daily_loss, 2=max_drawdown, 3=margin
    uint8_t  pad_[6];      // Align to 16 bytes
};

static_assert(sizeof(KillSwitchMsg) == 16, "KillSwitchMsg must be 16 bytes");

// Symbol ID mapping
enum class SymbolId : uint8_t {
    BTC = 0,
    ETH = 1,
    SOL = 2,
    BNB = 3,
    XRP = 4,
    ADA = 5,
    DOGE = 6,
    AVAX = 7,
    DOT = 8,
    LINK = 9,
};

// Exchange ID mapping
enum class ExchangeId : uint8_t {
    SIMULATOR = 0,
    BINANCE = 1,
    OKX = 2,
    BYBIT = 3,
};

// Action mapping
enum class Action : uint8_t {
    NEUTRAL = 0,
    LONG = 1,
    SHORT = 2,
};

// Side mapping
enum class Side : uint8_t {
    BUY = 0,
    SELL = 1,
};

} // namespace hft::ipc
