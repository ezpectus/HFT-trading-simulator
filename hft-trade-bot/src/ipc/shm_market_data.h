// SHM market data — shared market data (prices, order book snapshots).
//
// C++ side: creates SHM segment, writes market snapshots for Python to read.
// Also supports Python writing market data for C++ to consume (real exchange feeds).
// Uses a single-slot update model (latest snapshot wins) for lowest latency.
#pragma once

#include "shm_ring_buffer.h"
#include "shm_protocol.h"
#include <string>
#include <atomic>
#include <cstring>

namespace hft::ipc {

// Latest-snapshot holder: a single MarketSnapshotMsg in shared memory
// with an atomic sequence number for lock-free reads.
// Writer increments seq before/after write; reader checks seq consistency.
struct alignas(64) SnapshotSlot {
    std::atomic<uint64_t seq;   // Incremented on each write
    MarketSnapshotMsg data;
    uint8_t padding_[28];       // Fill to 64 bytes
};

static_assert(sizeof(SnapshotSlot) <= 64, "SnapshotSlot should fit in 1 cache line");

class ShmMarketData {
public:
    ShmMarketData(const std::string& shm_name = "/hft_market",
                  uint8_t max_symbols = 10, bool create = true)
        : shm_name_(shm_name), max_symbols_(max_symbols), owns_(create)
    {
        const uint64_t total_size = sizeof(uint64_t) + max_symbols * sizeof(SnapshotSlot);

        if (create) {
            fd_ = shm_open(shm_name_.c_str(), O_CREAT | O_RDWR, 0666);
            if (fd_ < 0) throw std::runtime_error("shm_open create failed: " + shm_name_);
            if (ftruncate(fd_, static_cast<off_t>(total_size)) < 0) {
                close(fd_);
                throw std::runtime_error("ftruncate failed: " + shm_name_);
            }
        } else {
            fd_ = shm_open(shm_name_.c_str(), O_RDWR, 0666);
            if (fd_ < 0) throw std::runtime_error("shm_open open failed: " + shm_name_);
        }

        void* ptr = mmap(nullptr, total_size, PROT_READ | PROT_WRITE,
                         MAP_SHARED, fd_, 0);
        if (ptr == MAP_FAILED) {
            close(fd_);
            throw std::runtime_error("mmap failed: " + shm_name_);
        }

        slots_ = static_cast<SnapshotSlot*>(ptr);
        mapped_size_ = total_size;

        if (create) {
            // Zero out all slots
            std::memset(slots_, 0, total_size);
        }
    }

    ~ShmMarketData() {
        if (slots_) {
            munmap(slots_, mapped_size_);
        }
        if (fd_ >= 0) close(fd_);
        if (owns_) shm_unlink(shm_name_.c_str());
    }

    ShmMarketData(const ShmMarketData&) = delete;
    ShmMarketData& operator=(const ShmMarketData&) = delete;

    // Write a market snapshot (lock-free, seq-guarded)
    void write_snapshot(uint8_t symbol_id, const MarketSnapshotMsg& snap) {
        if (symbol_id >= max_symbols_) return;
        SnapshotSlot& slot = slots_[symbol_id];

        // Increment seq before write (reader will detect in-progress write)
        uint64_t seq = slot.seq.load(std::memory_order_relaxed);
        slot.seq.store(seq + 1, std::memory_order_release);

        // Copy data
        std::memcpy(&slot.data, &snap, sizeof(MarketSnapshotMsg));

        // Increment seq after write (reader checks seq unchanged)
        slot.seq.store(seq + 2, std::memory_order_release);
    }

    // Read a market snapshot (lock-free, seq-guarded)
    // Returns false if no data yet or read was inconsistent (write in progress)
    bool read_snapshot(uint8_t symbol_id, MarketSnapshotMsg& out) {
        if (symbol_id >= max_symbols_) return false;
        SnapshotSlot& slot = slots_[symbol_id];

        uint64_t seq1 = slot.seq.load(std::memory_order_acquire);
        if (seq1 == 0) return false; // No data yet
        if (seq1 & 1) return false;  // Write in progress

        // Copy data
        std::memcpy(&out, &slot.data, sizeof(MarketSnapshotMsg));

        // Verify seq unchanged (no concurrent write)
        uint64_t seq2 = slot.seq.load(std::memory_order_acquire);
        return seq1 == seq2;
    }

    // Convenience: write latest price info
    void write_price(uint8_t symbol_id, uint64_t timestamp,
                     float bid, float ask, float last, float volume) {
        MarketSnapshotMsg snap{};
        snap.timestamp = timestamp;
        snap.symbol_id = symbol_id;
        snap.bid = bid;
        snap.ask = ask;
        snap.last = last;
        snap.volume = volume;
        write_snapshot(symbol_id, snap);
    }

    uint8_t max_symbols() const { return max_symbols_; }

private:
    std::string shm_name_;
    uint8_t max_symbols_;
    bool owns_;
    int fd_{-1};
    uint64_t mapped_size_{0};
    SnapshotSlot* slots_{nullptr};
};

} // namespace hft::ipc
