// Shared memory SPSC lock-free ring buffer for C++ ↔ Python IPC.
//
// Layout: [Header][Element 0][Element 1]...[Element N-1]
// Header: magic, capacity, element_size, head (atomic), tail (atomic)
// head/tail are cache-line aligned to prevent false sharing.
//
// Single-producer single-consumer: C++ pushes, Python pops (or vice versa).
// Uses mmap + MAP_SHARED for cross-process sharing.
// No heap allocations in hot path. All operations are O(1).
#pragma once

#include <atomic>
#include <cstdint>
#include <cstring>
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>
#include <string>
#include <stdexcept>
#include <new>

namespace hft {

// ─────────────────────────────────────────────────────────────────────────────
// SHM header — 128 bytes (2 cache lines)
// head and tail are on separate cache lines to avoid false sharing
// ─────────────────────────────────────────────────────────────────────────────
struct ShmHeader {
    uint64_t magic;           // 0xHFT42SHM for validation
    uint64_t capacity;        // Number of elements (must be power of 2)
    uint64_t element_size;    // Size of each element in bytes
    uint64_t total_size;      // Total mapped size (header + data)

    // Producer writes head, consumer reads head — separate cache lines
    alignas(64) std::atomic<uint64_t> head;  // Next write slot
    alignas(64) std::atomic<uint64_t> tail;  // Next read slot

    uint8_t padding_[48];     // Fill to 192 bytes (3 cache lines)
};

static_assert(sizeof(ShmHeader) == 192, "ShmHeader must be 192 bytes (3 cache lines)");

constexpr uint64_t SHM_MAGIC = 0x484654343253484DULL; // "HFT42SHM"

// ─────────────────────────────────────────────────────────────────────────────
// SHM ring buffer — template on element type
// ─────────────────────────────────────────────────────────────────────────────
template <typename T>
class ShmRingBuffer {
public:
    // Create or open a shared memory ring buffer
    // name: e.g. "/hft_signals" (must start with / on POSIX)
    // capacity: must be power of 2
    // create: true to create (producer), false to open existing (consumer)
    ShmRingBuffer(const std::string& name, uint64_t capacity, bool create)
        : name_(name), capacity_(capacity), owns_fd_(create)
    {
        if (capacity == 0 || (capacity & (capacity - 1)) != 0) {
            throw std::runtime_error("SHM capacity must be power of 2");
        }

        const uint64_t data_size = capacity * sizeof(T);
        const uint64_t total_size = sizeof(ShmHeader) + data_size;

        if (create) {
            // Create new shared memory segment
            fd_ = shm_open(name_.c_str(), O_CREAT | O_RDWR, 0666);
            if (fd_ < 0) {
                throw std::runtime_error("shm_open create failed: " + name_);
            }
            if (ftruncate(fd_, static_cast<off_t>(total_size)) < 0) {
                close(fd_);
                throw std::runtime_error("ftruncate failed for: " + name_);
            }
        } else {
            // Open existing shared memory segment
            fd_ = shm_open(name_.c_str(), O_RDWR, 0666);
            if (fd_ < 0) {
                throw std::runtime_error("shm_open open failed: " + name_);
            }
        }

        // Map shared memory
        void* ptr = mmap(nullptr, total_size, PROT_READ | PROT_WRITE,
                         MAP_SHARED, fd_, 0);
        if (ptr == MAP_FAILED) {
            close(fd_);
            throw std::runtime_error("mmap failed for: " + name_);
        }

        header_ = static_cast<ShmHeader*>(ptr);
        data_ = reinterpret_cast<T*>(static_cast<char*>(ptr) + sizeof(ShmHeader));

        if (create) {
            // Initialize header
            header_->magic = SHM_MAGIC;
            header_->capacity = capacity;
            header_->element_size = sizeof(T);
            header_->total_size = total_size;
            header_->head.store(0, std::memory_order_relaxed);
            header_->tail.store(0, std::memory_order_relaxed);
        } else {
            // Validate existing header
            if (header_->magic != SHM_MAGIC) {
                munmap(header_, total_size);
                close(fd_);
                throw std::runtime_error("SHM magic mismatch: " + name_);
            }
            if (header_->capacity != capacity) {
                munmap(header_, total_size);
                close(fd_);
                throw std::runtime_error("SHM capacity mismatch: " + name_);
            }
            if (header_->element_size != sizeof(T)) {
                munmap(header_, total_size);
                close(fd_);
                throw std::runtime_error("SHM element size mismatch: " + name_);
            }
        }

        mask_ = capacity - 1;
    }

    ~ShmRingBuffer() {
        if (header_) {
            munmap(header_, header_->total_size);
        }
        if (fd_ >= 0) {
            close(fd_);
        }
        if (owns_fd_) {
            shm_unlink(name_.c_str());
        }
    }

    ShmRingBuffer(const ShmRingBuffer&) = delete;
    ShmRingBuffer& operator=(const ShmRingBuffer&) = delete;
    ShmRingBuffer(ShmRingBuffer&&) = delete;
    ShmRingBuffer& operator=(ShmRingBuffer&&) = delete;

    // Non-blocking push. Returns false if buffer is full.
    bool try_push(const T& item) noexcept {
        const uint64_t head = header_->head.load(std::memory_order_relaxed);
        const uint64_t tail = header_->tail.load(std::memory_order_acquire);

        // Check if full: head - tail == capacity
        if (head - tail >= capacity_) {
            return false; // Buffer full
        }

        const uint64_t slot = head & mask_;
        std::memcpy(&data_[slot], &item, sizeof(T));

        // Release: make data visible before publishing head
        header_->head.store(head + 1, std::memory_order_release);
        return true;
    }

    // Non-blocking pop. Returns false if buffer is empty.
    bool try_pop(T& out) noexcept {
        const uint64_t tail = header_->tail.load(std::memory_order_relaxed);
        const uint64_t head = header_->head.load(std::memory_order_acquire);

        // Check if empty: head == tail
        if (head == tail) {
            return false; // Buffer empty
        }

        const uint64_t slot = tail & mask_;
        std::memcpy(&out, &data_[slot], sizeof(T));

        // Release: make read visible before publishing tail
        header_->tail.store(tail + 1, std::memory_order_release);
        return true;
    }

    // Bulk push — pushes up to count items. Returns number actually pushed.
    uint64_t bulk_push(const T* items, uint64_t count) noexcept {
        const uint64_t head = header_->head.load(std::memory_order_relaxed);
        const uint64_t tail = header_->tail.load(std::memory_order_acquire);

        const uint64_t available = capacity_ - (head - tail);
        const uint64_t to_push = count < available ? count : available;

        for (uint64_t i = 0; i < to_push; ++i) {
            const uint64_t slot = (head + i) & mask_;
            std::memcpy(&data_[slot], &items[i], sizeof(T));
        }

        header_->head.store(head + to_push, std::memory_order_release);
        return to_push;
    }

    // Bulk pop — pops up to count items. Returns number actually popped.
    uint64_t bulk_pop(T* out, uint64_t count) noexcept {
        const uint64_t tail = header_->tail.load(std::memory_order_relaxed);
        const uint64_t head = header_->head.load(std::memory_order_acquire);

        const uint64_t available = head - tail;
        const uint64_t to_pop = count < available ? count : available;

        for (uint64_t i = 0; i < to_pop; ++i) {
            const uint64_t slot = (tail + i) & mask_;
            std::memcpy(&out[i], &data_[slot], sizeof(T));
        }

        header_->tail.store(tail + to_pop, std::memory_order_release);
        return to_pop;
    }

    // Current number of elements in the buffer
    uint64_t size() const noexcept {
        const uint64_t head = header_->head.load(std::memory_order_acquire);
        const uint64_t tail = header_->tail.load(std::memory_order_acquire);
        return head - tail;
    }

    bool empty() const noexcept { return size() == 0; }
    bool full() const noexcept { return size() >= capacity_; }
    uint64_t capacity() const noexcept { return capacity_; }

    // Unlink the shared memory segment (call after all processes are done)
    void unlink() {
        if (owns_fd_) {
            shm_unlink(name_.c_str());
            owns_fd_ = false;
        }
    }

private:
    std::string name_;
    uint64_t capacity_;
    uint64_t mask_{0};
    int fd_{-1};
    bool owns_fd_{false};
    ShmHeader* header_{nullptr};
    T* data_{nullptr};
};

} // namespace hft
