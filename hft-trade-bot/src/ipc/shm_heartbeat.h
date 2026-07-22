// SHM heartbeat — health check via shared memory.
//
// C++ writes heartbeat timestamp periodically. Python reads and checks
// if the heartbeat is fresh (within timeout). If stale, Python can
// trigger recovery or alert.
//
// Also supports bidirectional: Python writes its heartbeat, C++ checks.
// Single-slot model with atomic seq for lock-free reads.
#pragma once

#include "../ipc/shm_protocol.h"
#include "../ipc/shm_ring_buffer.h"
#include <atomic>
#include <chrono>
#include <cstring>
#include <string>
#include <thread>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <process.h>
#include <windows.h>
#else
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>
#endif

namespace hft::ipc {

// ─────────────────────────────────────────────────────────────────────────────
// Heartbeat slot — single slot in shared memory with seq-guarded access
// ─────────────────────────────────────────────────────────────────────────────
struct alignas(64) HeartbeatSlot {
    std::atomic<uint64_t> seq;           // Incremented on each write
    uint64_t              timestamp_ns;  // Nanosecond timestamp
    uint64_t              pid;           // Process ID
    uint32_t              message_count; // Messages processed since last heartbeat
    uint32_t              error_count;   // Errors since last heartbeat
    char                  status[16];    // "OK", "DEGRADED", "ERROR"
    uint8_t               padding_[4];
};

static_assert(sizeof(HeartbeatSlot) <= 64, "HeartbeatSlot should fit in 1 cache line");

// ─────────────────────────────────────────────────────────────────────────────
// SHM heartbeat writer — C++ side writes heartbeat
// ─────────────────────────────────────────────────────────────────────────────
class ShmHeartbeatWriter {
  public:
    ShmHeartbeatWriter(const std::string& shm_name = "/hft_heartbeat", bool create = true)
        : shm_name_(shm_name), owns_(create) {
        const uint64_t total_size = sizeof(HeartbeatSlot);

#ifdef _WIN32
        std::wstring wname(shm_name_.begin(), shm_name_.end());
        if (create) {
            handle_ = CreateFileMappingW(INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE, 0,
                                         static_cast<DWORD>(total_size), wname.c_str());
            if (!handle_) throw std::runtime_error("CreateFileMapping create failed: " + shm_name_);
        } else {
            handle_ = OpenFileMappingW(FILE_MAP_ALL_ACCESS, FALSE, wname.c_str());
            if (!handle_) throw std::runtime_error("OpenFileMapping failed: " + shm_name_);
        }
        void* ptr = MapViewOfFile(handle_, FILE_MAP_ALL_ACCESS, 0, 0, total_size);
        if (!ptr) {
            CloseHandle(handle_);
            throw std::runtime_error("MapViewOfFile failed for: " + shm_name_);
        }
#else
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

        void* ptr = mmap(nullptr, total_size, PROT_READ | PROT_WRITE, MAP_SHARED, fd_, 0);
        if (ptr == MAP_FAILED) {
            close(fd_);
            throw std::runtime_error("mmap failed: " + shm_name_);
        }
#endif

        slot_        = static_cast<HeartbeatSlot*>(ptr);
        mapped_size_ = total_size;

        if (create) {
            std::memset(slot_, 0, total_size);
        }
    }

    ~ShmHeartbeatWriter() {
        if (slot_) {
#ifdef _WIN32
            UnmapViewOfFile(slot_);
            if (handle_) CloseHandle(handle_);
#else
            munmap(slot_, mapped_size_);
            if (fd_ >= 0) close(fd_);
            if (owns_) shm_unlink(shm_name_.c_str());
#endif
        }
    }

    ShmHeartbeatWriter(const ShmHeartbeatWriter&)            = delete;
    ShmHeartbeatWriter& operator=(const ShmHeartbeatWriter&) = delete;

    // Write a heartbeat
    void write(uint32_t msg_count = 0, uint32_t err_count = 0, const char* status = "OK") noexcept {
        uint64_t seq = slot_->seq.load(std::memory_order_relaxed);
        slot_->seq.store(seq + 1, std::memory_order_release); // Odd = writing

        slot_->timestamp_ns = now_ns();
        slot_->pid          = static_cast<uint64_t>(
#ifdef _WIN32
            _getpid()
#else
            getpid()
#endif
        );
        slot_->message_count = msg_count;
        slot_->error_count   = err_count;
        std::memset(slot_->status, 0, sizeof(slot_->status));
        std::strncpy(slot_->status, status, sizeof(slot_->status) - 1);

        slot_->seq.store(seq + 2, std::memory_order_release); // Even = done
    }

    // Start automatic heartbeat thread (writes every interval_ms)
    void start_auto(uint32_t interval_ms = 1000) {
        running_ = true;
        thread_  = std::thread(&ShmHeartbeatWriter::auto_loop, this, interval_ms);
    }

    // Stop automatic heartbeat
    void stop_auto() {
        running_ = false;
        if (thread_.joinable()) thread_.join();
    }

  private:
    void auto_loop(uint32_t interval_ms) {
        while (running_) {
            write();
            std::this_thread::sleep_for(std::chrono::milliseconds(interval_ms));
        }
    }

    static uint64_t now_ns() noexcept {
        auto tp = std::chrono::system_clock::now();
        return std::chrono::duration_cast<std::chrono::nanoseconds>(tp.time_since_epoch()).count();
    }

    std::string shm_name_;
    bool        owns_;
#ifdef _WIN32
    HANDLE handle_{nullptr};
#else
    int fd_{-1};
#endif
    uint64_t          mapped_size_{0};
    HeartbeatSlot*    slot_{nullptr};
    std::atomic<bool> running_{false};
    std::thread       thread_;
};

// ─────────────────────────────────────────────────────────────────────────────
// SHM heartbeat reader — Python side reads heartbeat (or C++ reads Python's)
// ─────────────────────────────────────────────────────────────────────────────
class ShmHeartbeatReader {
  public:
    explicit ShmHeartbeatReader(const std::string& shm_name = "/hft_heartbeat")
        : shm_name_(shm_name) {
        const uint64_t total_size = sizeof(HeartbeatSlot);
#ifdef _WIN32
        std::wstring wname(shm_name_.begin(), shm_name_.end());
        handle_ = OpenFileMappingW(FILE_MAP_ALL_ACCESS, FALSE, wname.c_str());
        if (!handle_) throw std::runtime_error("OpenFileMapping failed: " + shm_name_);
        void* ptr = MapViewOfFile(handle_, FILE_MAP_ALL_ACCESS, 0, 0, total_size);
        if (!ptr) {
            CloseHandle(handle_);
            throw std::runtime_error("MapViewOfFile failed for: " + shm_name_);
        }
#else
        fd_ = shm_open(shm_name_.c_str(), O_RDWR, 0666);
        if (fd_ < 0) throw std::runtime_error("shm_open failed: " + shm_name_);

        void* ptr = mmap(nullptr, total_size, PROT_READ | PROT_WRITE, MAP_SHARED, fd_, 0);
        if (ptr == MAP_FAILED) {
            close(fd_);
            throw std::runtime_error("mmap failed: " + shm_name_);
        }
#endif

        slot_        = static_cast<HeartbeatSlot*>(ptr);
        mapped_size_ = total_size;
    }

    ~ShmHeartbeatReader() {
#ifdef _WIN32
        if (slot_) UnmapViewOfFile(slot_);
        if (handle_) CloseHandle(handle_);
#else
        if (slot_) munmap(slot_, mapped_size_);
        if (fd_ >= 0) close(fd_);
#endif
    }

    ShmHeartbeatReader(const ShmHeartbeatReader&)            = delete;
    ShmHeartbeatReader& operator=(const ShmHeartbeatReader&) = delete;

    // Read heartbeat (lock-free, seq-guarded). Returns false if inconsistent.
    bool read(HeartbeatSlot& out) const noexcept {
        uint64_t seq1 = slot_->seq.load(std::memory_order_acquire);
        if (seq1 == 0) return false; // No heartbeat yet
        if (seq1 & 1) return false;  // Write in progress

        // Copy data
        std::memcpy(&out, slot_, sizeof(HeartbeatSlot));

        // Verify seq unchanged
        uint64_t seq2 = slot_->seq.load(std::memory_order_acquire);
        return seq1 == seq2;
    }

    // Check if heartbeat is fresh (within timeout_ms)
    bool is_alive(uint64_t timeout_ms = 5000) const noexcept {
        HeartbeatSlot hb;
        if (!read(hb)) return false;

        uint64_t now        = now_ns();
        uint64_t elapsed_ms = (now - hb.timestamp_ns) / 1'000'000;
        return elapsed_ms <= timeout_ms;
    }

    // Get age of last heartbeat in milliseconds
    uint64_t age_ms() const noexcept {
        HeartbeatSlot hb;
        if (!read(hb)) return UINT64_MAX;
        return (now_ns() - hb.timestamp_ns) / 1'000'000;
    }

  private:
    static uint64_t now_ns() noexcept {
        auto tp = std::chrono::system_clock::now();
        return std::chrono::duration_cast<std::chrono::nanoseconds>(tp.time_since_epoch()).count();
    }

    std::string shm_name_;
#ifdef _WIN32
    HANDLE handle_{nullptr};
#else
    int fd_{-1};
#endif
    uint64_t       mapped_size_{0};
    HeartbeatSlot* slot_{nullptr};
};

} // namespace hft::ipc
