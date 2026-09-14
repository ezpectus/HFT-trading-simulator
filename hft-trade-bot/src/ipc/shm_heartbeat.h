#pragma once

// Producer side of the /hft_heartbeat region read by scripts/monitor.py.
// 64-byte layout: [u64 timestamp_ms][i64 orders][i64 fills][i64 signals]
// [i64 errors] — must stay in sync with monitor.py's struct.unpack offsets.

#include <chrono>
#include <cstdint>
#include <cstring>
#include <stdexcept>
#include <string>

#ifdef _WIN32
#include <windows.h>
#else
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>
#endif

namespace hft::ipc {

class ShmHeartbeat {
  public:
    static constexpr uint64_t kSize = 64;

    explicit ShmHeartbeat(const std::string& shm_name = "/hft_heartbeat") : shm_name_(shm_name) {
#ifdef _WIN32
        std::wstring wname(shm_name_.begin(), shm_name_.end());
        handle_ = CreateFileMappingW(INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE, 0,
                                     static_cast<DWORD>(kSize), wname.c_str());
        if (!handle_) throw std::runtime_error("CreateFileMapping failed: " + shm_name_);
        view_ = MapViewOfFile(handle_, FILE_MAP_ALL_ACCESS, 0, 0, kSize);
        if (!view_) throw std::runtime_error("MapViewOfFile failed: " + shm_name_);
#else
        fd_ = shm_open(shm_name_.c_str(), O_CREAT | O_RDWR, 0600);
        if (fd_ < 0) throw std::runtime_error("shm_open failed: " + shm_name_);
        if (ftruncate(fd_, static_cast<off_t>(kSize)) != 0)
            throw std::runtime_error("ftruncate failed: " + shm_name_);
        view_ = mmap(nullptr, kSize, PROT_READ | PROT_WRITE, MAP_SHARED, fd_, 0);
        if (view_ == MAP_FAILED) throw std::runtime_error("mmap failed: " + shm_name_);
#endif
        std::memset(view_, 0, kSize);
    }

    ~ShmHeartbeat() {
#ifdef _WIN32
        if (view_) UnmapViewOfFile(view_);
        if (handle_) CloseHandle(handle_);
#else
        if (view_) munmap(view_, kSize);
        if (fd_ >= 0) close(fd_);
        shm_unlink(shm_name_.c_str());
#endif
    }

    ShmHeartbeat(const ShmHeartbeat&)            = delete;
    ShmHeartbeat& operator=(const ShmHeartbeat&) = delete;

    // Write counters first, timestamp last — a racing reader sees a stale
    // timestamp rather than a fresh timestamp over half-written counters.
    void beat(int64_t orders, int64_t fills, int64_t signals, int64_t errors) {
        if (!view_) return;
        const int64_t counters[4] = {orders, fills, signals, errors};
        auto*         base        = static_cast<uint8_t*>(view_);
        std::memcpy(base + 8, counters, sizeof(counters));
        const uint64_t now_ms =
            static_cast<uint64_t>(std::chrono::duration_cast<std::chrono::milliseconds>(
                                      std::chrono::system_clock::now().time_since_epoch())
                                      .count());
        std::memcpy(base, &now_ms, sizeof(now_ms));
    }

  private:
    std::string shm_name_;
    void*       view_ = nullptr;
#ifdef _WIN32
    HANDLE handle_ = nullptr;
#else
    int fd_ = -1;
#endif
};

} // namespace hft::ipc
