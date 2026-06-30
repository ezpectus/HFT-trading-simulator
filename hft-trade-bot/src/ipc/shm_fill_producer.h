// SHM fill producer — pushes Fill structs back to Python via shared memory.
//
// C++ side: creates SHM segment, pushes fills as they occur from execution.
// Python reads fills for persistence and dashboard updates.
#pragma once

#include "shm_ring_buffer.h"
#include "shm_protocol.h"
#include <string>
#include <chrono>

namespace hft::ipc {

class ShmFillProducer {
public:
    ShmFillProducer(const std::string& shm_name = "/hft_fills",
                    uint64_t capacity = 4096)
        : shm_name_(shm_name), capacity_(capacity) {}

    ~ShmFillProducer() { close(); }

    // Create the SHM segment (C++ creates, Python opens)
    bool init() {
        try {
            buffer_ = std::make_unique<ShmRingBuffer<FillMsg>>(
                shm_name_, capacity_, true);
            return true;
        } catch (const std::exception& e) {
            return false;
        }
    }

    // Push a fill (non-blocking). Returns false if buffer is full.
    bool push_fill(const FillMsg& fill) {
        if (!buffer_) return false;
        return buffer_->try_push(fill);
    }

    // Push a fill with convenience parameters
    bool push_fill(uint64_t timestamp, uint8_t symbol_id, uint8_t side,
                   float qty, float price, float fee, uint8_t exchange_id) {
        if (!buffer_) return false;
        FillMsg msg{};
        msg.timestamp = timestamp;
        msg.symbol_id = symbol_id;
        msg.side = side;
        msg.qty = qty;
        msg.price = price;
        msg.fee = fee;
        msg.exchange_id = exchange_id;
        return buffer_->try_push(msg);
    }

    // Bulk push fills
    uint64_t push_fills(const FillMsg* fills, uint64_t count) {
        if (!buffer_) return 0;
        return buffer_->bulk_push(fills, count);
    }

    // Current pending fills (not yet consumed by Python)
    uint64_t pending() const {
        return buffer_ ? buffer_->size() : 0;
    }

    // Close and unlink SHM
    void close() {
        if (buffer_) {
            buffer_->unlink();
            buffer_.reset();
        }
    }

private:
    std::string shm_name_;
    uint64_t capacity_;
    std::unique_ptr<ShmRingBuffer<FillMsg>> buffer_;
};

} // namespace hft::ipc
