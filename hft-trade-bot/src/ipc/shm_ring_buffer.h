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
#include <string>
#include <stdexcept>
#include <new>

#ifdef _WIN32
  #ifndef NOMINMAX
  #define NOMINMAX
  #endif
  #include <windows.h>
  #include <fileapi.h>
#else
  #include <fcntl.h>
  #include <sys/mman.h>
  #include <sys/stat.h>
  #include <unistd.h>
#endif

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

#ifdef _WIN32
        // Windows: use page-file backed shared memory via CreateFileMapping
        // Convert name to wide string for CreateFileMappingW
        std::wstring wname(name_.begin(), name_.end());

        if (create) {
            handle_ = CreateFileMappingW(
                INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE,
                0, static_cast<DWORD>(total_size), wname.c_str());
            if (!handle_) {
                throw std::runtime_error("CreateFileMapping create failed: " + name_);
            }
        } else {
            handle_ = OpenFileMappingW(
                FILE_MAP_ALL_ACCESS, FALSE, wname.c_str());
            if (!handle_) {
                throw std::runtime_error("OpenFileMapping failed: " + name_);
            }
        }

        void* ptr = MapViewOfFile(handle_, FILE_MAP_ALL_ACCESS, 0, 0, total_size);
        if (!ptr) {
            CloseHandle(handle_);
            throw std::runtime_error("MapViewOfFile failed for: " + name_);
        }
#else
        if (create) {
            fd_ = shm_open(name_.c_str(), O_CREAT | O_RDWR, 0666);
            if (fd_ < 0) {
                throw std::runtime_error("shm_open create failed: " + name_);
            }
            if (ftruncate(fd_, static_cast<off_t>(total_size)) < 0) {
                close(fd_);
                throw std::runtime_error("ftruncate failed for: " + name_);
            }
        } else {
            fd_ = shm_open(name_.c_str(), O_RDWR, 0666);
            if (fd_ < 0) {
                throw std::runtime_error("shm_open open failed: " + name_);
            }
        }

        void* ptr = mmap(nullptr, total_size, PROT_READ | PROT_WRITE,
                         MAP_SHARED, fd_, 0);
        if (ptr == MAP_FAILED) {
            close(fd_);
            throw std::runtime_error("mmap failed for: " + name_);
        }
#endif

        header_ = static_cast<ShmHeader*>(ptr);
        data_ = reinterpret_cast<T*>(static_cast<char*>(ptr) + sizeof(ShmHeader));

        if (create) {
            header_->magic = SHM_MAGIC;
            header_->capacity = capacity;
            header_->element_size = sizeof(T);
            header_->total_size = total_size;
            header_->head.store(0, std::memory_order_relaxed);
            header_->tail.store(0, std::memory_order_relaxed);
        } else {
            if (header_->magic != SHM_MAGIC) {
                cleanup_mapped(total_size);
                throw std::runtime_error("SHM magic mismatch: " + name_);
            }
            if (header_->capacity != capacity) {
                cleanup_mapped(total_size);
                throw std::runtime_error("SHM capacity mismatch: " + name_);
            }
            if (header_->element_size != sizeof(T)) {
                cleanup_mapped(total_size);
                throw std::runtime_error("SHM element size mismatch: " + name_);
            }
        }

        mask_ = capacity - 1;
    }

    ~ShmRingBuffer() {
        if (header_) {
#ifdef _WIN32
            UnmapViewOfFile(header_);
#else
            munmap(header_, header_->total_size);
#endif
        }
#ifdef _WIN32
        if (handle_) {
            CloseHandle(handle_);
        }
#else
        if (fd_ >= 0) {
            close(fd_);
        }
#endif
        if (owns_fd_) {
#ifndef _WIN32
            shm_unlink(name_.c_str());
#endif
        }
    }

    ShmRingBuffer(const ShmRingBuffer&) = delete;
    ShmRingBuffer& operator=(const ShmRingBuffer&) = delete;
    ShmRingBuffer(ShmRingBuffer&&) = delete;
    ShmRingBuffer& operator=(ShmRingBuffer&&) = delete;

    // ─────────────────────────────────────────────────────────────────────────
    // Lock-free SPSC (Single-Producer Single-Consumer) ring buffer.
    //
    // Why lock-free? Mutex lock/unlock costs ~25ns per call. In HFT, we process
    // ticks every ~100μs — a mutex would consume 0.05% of the budget per push.
    // This ring buffer uses atomic head/tail counters instead:
    //
    //   - Producer writes data_[head], then publishes head+1 (release fence)
    //   - Consumer reads head (acquire fence), then reads data_[tail], publishes tail+1
    //   - The acquire/release pair guarantees: if consumer sees head=N, it also
    //     sees all writes that happened before head was stored
    //
    // Power-of-2 capacity: slot = head & mask_ (bitwise AND) instead of
    // head % capacity (integer modulo). AND is 1 cycle; modulo is 10-20 cycles.
    // ─────────────────────────────────────────────────────────────────────────

    // Non-blocking push. Returns false if buffer is full.
    bool try_push(const T& item) noexcept {
        // Relaxed load of our own head — no other thread writes it (SPSC)
        const uint64_t head = header_->head.load(std::memory_order_relaxed);
        // Acquire load of tail — see consumer's progress
        const uint64_t tail = header_->tail.load(std::memory_order_acquire);

        // Check if full: head - tail == capacity
        // Works with uint64 wraparound: subtraction is correct even on overflow
        if (head - tail >= capacity_) {
            return false; // Buffer full
        }

        // Bitwise AND instead of modulo — requires power-of-2 capacity
        const uint64_t slot = head & mask_;
        std::memcpy(&data_[slot], &item, sizeof(T));

        // Release store: ensures memcpy completes before head is published.
        // Consumer's acquire load of head will see the written data.
        header_->head.store(head + 1, std::memory_order_release);
        return true;
    }

    // Non-blocking pop. Returns false if buffer is empty.
    bool try_pop(T& out) noexcept {
        // Relaxed load of our own tail — no other thread writes it (SPSC)
        const uint64_t tail = header_->tail.load(std::memory_order_relaxed);
        // Acquire load of head — see producer's progress
        const uint64_t head = header_->head.load(std::memory_order_acquire);

        // Check if empty: head == tail
        if (head == tail) {
            return false; // Buffer empty
        }

        const uint64_t slot = tail & mask_;
        std::memcpy(&out, &data_[slot], sizeof(T));

        // Release store: ensures memcpy read completes before tail advances.
        // Producer's acquire load of tail will see the slot is free.
        header_->tail.store(tail + 1, std::memory_order_release);
        return true;
    }

    // Bulk push — pushes up to count items. Returns number actually pushed.
    // Optimized: uses at most 2 memcpy calls instead of per-element copies.
    uint64_t bulk_push(const T* items, uint64_t count) noexcept {
        const uint64_t head = header_->head.load(std::memory_order_relaxed);
        const uint64_t tail = header_->tail.load(std::memory_order_acquire);

        const uint64_t available = capacity_ - (head - tail);
        const uint64_t to_push = count < available ? count : available;

        const uint64_t start_slot = head & mask_;
        const uint64_t first_chunk = (start_slot + to_push <= capacity_)
            ? to_push
            : capacity_ - start_slot;

        // First contiguous chunk
        std::memcpy(&data_[start_slot], items, first_chunk * sizeof(T));

        // Wrapped chunk (if any)
        if (to_push > first_chunk) {
            std::memcpy(&data_[0], items + first_chunk,
                        (to_push - first_chunk) * sizeof(T));
        }

        header_->head.store(head + to_push, std::memory_order_release);
        return to_push;
    }

    // Bulk pop — pops up to count items. Returns number actually popped.
    // Optimized: uses at most 2 memcpy calls instead of per-element copies.
    uint64_t bulk_pop(T* out, uint64_t count) noexcept {
        const uint64_t tail = header_->tail.load(std::memory_order_relaxed);
        const uint64_t head = header_->head.load(std::memory_order_acquire);

        const uint64_t available = head - tail;
        const uint64_t to_pop = count < available ? count : available;

        const uint64_t start_slot = tail & mask_;
        const uint64_t first_chunk = (start_slot + to_pop <= capacity_)
            ? to_pop
            : capacity_ - start_slot;

        // First contiguous chunk
        std::memcpy(out, &data_[start_slot], first_chunk * sizeof(T));

        // Wrapped chunk (if any)
        if (to_pop > first_chunk) {
            std::memcpy(out + first_chunk, &data_[0],
                        (to_pop - first_chunk) * sizeof(T));
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
#ifndef _WIN32
            shm_unlink(name_.c_str());
#endif
            owns_fd_ = false;
        }
    }

private:
    void cleanup_mapped(uint64_t total_size) {
#ifdef _WIN32
        if (header_) { UnmapViewOfFile(header_); header_ = nullptr; }
        if (handle_) { CloseHandle(handle_); handle_ = nullptr; }
#else
        if (header_) { munmap(header_, total_size); header_ = nullptr; }
        if (fd_ >= 0) { close(fd_); fd_ = -1; }
#endif
    }

    std::string name_;
    uint64_t capacity_;
    uint64_t mask_{0};
#ifdef _WIN32
    HANDLE handle_{nullptr};
#else
    int fd_{-1};
#endif
    bool owns_fd_{false};
    ShmHeader* header_{nullptr};
    T* data_{nullptr};
};

} // namespace hft
