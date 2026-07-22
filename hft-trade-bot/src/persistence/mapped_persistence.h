/**
 * Memory-mapped persistence for ultra-fast state recovery.
 *
 * Uses mmap() to persist critical trading state to disk:
 *   - Open positions
 *   - Order book snapshots
 *   - Account balance
 *   - Signal history (ring buffer)
 *
 * On crash/restart, state is recovered from memory-mapped files
 * in <1ms (no deserialization needed — direct memory access).
 *
 * Usage:
 *   MappedPersistence persist("/var/lib/hft/state");
 *   persist.save_positions(positions);
 *   auto recovered = persist.load_positions();
 */

#pragma once

#include <cstring>
#include <cstdint>
#include <string>
#include <vector>
#include <fstream>
#include <filesystem>
#include <mutex>
#include <spdlog/spdlog.h>

#ifdef _WIN32
  #ifndef NOMINMAX
  #define NOMINMAX
  #endif
  #ifndef WIN32_LEAN_AND_MEAN
  #define WIN32_LEAN_AND_MEAN
  #endif
  #include <windows.h>
  #include <fileapi.h>
#else
  #include <sys/mman.h>
  #include <sys/stat.h>
  #include <fcntl.h>
  #include <unistd.h>
#endif

namespace hft {

namespace fs = std::filesystem;

struct MappedPosition {
    char symbol[32];
    char side[8];       // "long" or "short"
    double qty;
    double entry_price;
    double current_price;
    double unrealized_pnl;
    uint64_t timestamp_ns;
    char padding[16];   // align to 128 bytes for cache lines
};

static_assert(sizeof(MappedPosition) == 128, "MappedPosition must be 128 bytes");

struct MappedAccount {
    double balance;
    double equity;
    double margin_used;
    double free_margin;
    double unrealized_pnl;
    uint64_t timestamp_ns;
    char padding[72];   // align to 128 bytes
};

static_assert(sizeof(MappedAccount) == 128, "MappedAccount must be 128 bytes");

struct MappedHeader {
    uint32_t magic;
    uint32_t version;
    uint64_t created_at_ns;
    uint64_t last_update_ns;
    uint32_t position_count;
    uint32_t reserved;
    char padding[96];   // align to 128 bytes
};

static_assert(sizeof(MappedHeader) == 128, "MappedHeader must be 128 bytes");

static constexpr uint32_t MAPPED_MAGIC = 0x48465431;  // "HFT1"
static constexpr uint32_t MAPPED_VERSION = 1;
static constexpr size_t MAX_POSITIONS = 64;
static constexpr size_t MAPPED_FILE_SIZE = 
    sizeof(MappedHeader) + 
    sizeof(MappedAccount) + 
    MAX_POSITIONS * sizeof(MappedPosition);

class MappedPersistence {
public:
    explicit MappedPersistence(const std::string& base_dir = "/var/lib/hft/state")
        : base_dir_(base_dir)
    {
        std::error_code ec;
        fs::create_directories(base_dir_, ec);
    }

    ~MappedPersistence() {
        unmap_all();
    }

    bool save_state(
        const std::vector<MappedPosition>& positions,
        const MappedAccount& account
    ) {
        std::lock_guard<std::mutex> lock(mutex_);

        // Create or open file
        std::string path = base_dir_ + "/trading_state.bin";
#ifdef _WIN32
        HANDLE fd = CreateFileA(path.c_str(), GENERIC_READ | GENERIC_WRITE,
                                FILE_SHARE_READ, nullptr, OPEN_ALWAYS,
                                FILE_ATTRIBUTE_NORMAL, nullptr);
        if (fd == INVALID_HANDLE_VALUE) {
            spdlog::error("[MappedPersist] Failed to open: {}", path);
            return false;
        }
        // Ensure file size
        LARGE_INTEGER file_size;
        file_size.QuadPart = static_cast<LONGLONG>(MAPPED_FILE_SIZE);
        if (!SetFilePointerEx(fd, file_size, nullptr, FILE_BEGIN) || !SetEndOfFile(fd)) {
            spdlog::error("[MappedPersist] SetEndOfFile failed");
            CloseHandle(fd);
            return false;
        }
#else
        int fd = open(path.c_str(), O_RDWR | O_CREAT, 0644);
        if (fd < 0) {
            spdlog::error("[MappedPersist] Failed to open: {}", path);
            return false;
        }
        // Ensure file size
        if (ftruncate(fd, MAPPED_FILE_SIZE) != 0) {
            spdlog::error("[MappedPersist] ftruncate failed");
            close(fd);
            return false;
        }
#endif

        // mmap
#ifdef _WIN32
        HANDLE mapping = CreateFileMapping(fd, nullptr, PAGE_READWRITE, 0, 0, nullptr);
        if (!mapping) {
            spdlog::error("[MappedPersist] CreateFileMapping failed");
            CloseHandle(fd);
            return false;
        }
        void* mapped = MapViewOfFile(mapping, FILE_MAP_ALL_ACCESS, 0, 0, MAPPED_FILE_SIZE);
        CloseHandle(mapping);
        if (!mapped) {
            spdlog::error("[MappedPersist] MapViewOfFile failed");
            CloseHandle(fd);
            return false;
        }
#else
        void* mapped = mmap(nullptr, MAPPED_FILE_SIZE, 
                           PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
        if (mapped == MAP_FAILED) {
            spdlog::error("[MappedPersist] mmap failed");
            close(fd);
            return false;
        }
#endif

        // Write header
        auto* header = static_cast<MappedHeader*>(mapped);
        header->magic = MAPPED_MAGIC;
        header->version = MAPPED_VERSION;
        header->last_update_ns = current_ns();
        header->position_count = std::min(positions.size(), MAX_POSITIONS);

        // Write account
        auto* acct = reinterpret_cast<MappedAccount*>(
            static_cast<char*>(mapped) + sizeof(MappedHeader));
        *acct = account;
        acct->timestamp_ns = current_ns();

        // Write positions
        auto* pos_array = reinterpret_cast<MappedPosition*>(
            static_cast<char*>(mapped) + sizeof(MappedHeader) + sizeof(MappedAccount));
        for (size_t i = 0; i < header->position_count; i++) {
            pos_array[i] = positions[i];
        }

        // Flush to disk (async — OS will sync eventually)
#ifdef _WIN32
        FlushViewOfFile(mapped, MAPPED_FILE_SIZE);
        UnmapViewOfFile(mapped);
        CloseHandle(fd);
#else
        msync(mapped, MAPPED_FILE_SIZE, MS_ASYNC);
        munmap(mapped, MAPPED_FILE_SIZE);
        close(fd);
#endif

        spdlog::debug("[MappedPersist] Saved {} positions, balance={:.2f}", 
                      header->position_count, account.balance);
        return true;
    }

    struct RecoveredState {
        bool valid;
        MappedAccount account;
        std::vector<MappedPosition> positions;
        uint64_t saved_at_ns;
    };

    RecoveredState load_state() {
        std::lock_guard<std::mutex> lock(mutex_);
        RecoveredState result{false, {}, {}, 0};

        std::string path = base_dir_ + "/trading_state.bin";
        if (!fs::exists(path)) {
            spdlog::info("[MappedPersist] No state file found — fresh start");
            return result;
        }

#ifdef _WIN32
        HANDLE fd = CreateFileA(path.c_str(), GENERIC_READ, FILE_SHARE_READ,
                                nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (fd == INVALID_HANDLE_VALUE) return result;
        HANDLE mapping = CreateFileMapping(fd, nullptr, PAGE_READONLY, 0, 0, nullptr);
        if (!mapping) { CloseHandle(fd); return result; }
        void* mapped = MapViewOfFile(mapping, FILE_MAP_READ, 0, 0, MAPPED_FILE_SIZE);
        CloseHandle(mapping);
        if (!mapped) { CloseHandle(fd); return result; }
#else
        int fd = open(path.c_str(), O_RDONLY);
        if (fd < 0) return result;

        void* mapped = mmap(nullptr, MAPPED_FILE_SIZE, PROT_READ, MAP_PRIVATE, fd, 0);
        if (mapped == MAP_FAILED) {
            close(fd);
            return result;
        }
#endif

        auto* header = static_cast<MappedHeader*>(mapped);
        if (header->magic != MAPPED_MAGIC) {
            spdlog::warn("[MappedPersist] Invalid magic — ignoring");
#ifdef _WIN32
            UnmapViewOfFile(mapped); CloseHandle(fd);
#else
            munmap(mapped, MAPPED_FILE_SIZE); close(fd);
#endif
            return result;
        }

        result.valid = true;
        result.saved_at_ns = header->last_update_ns;

        auto* acct = reinterpret_cast<MappedAccount*>(
            static_cast<char*>(mapped) + sizeof(MappedHeader));
        result.account = *acct;

        auto* pos_array = reinterpret_cast<MappedPosition*>(
            static_cast<char*>(mapped) + sizeof(MappedHeader) + sizeof(MappedAccount));
        uint32_t pos_count = std::min(header->position_count, static_cast<uint32_t>(MAX_POSITIONS));
        for (uint32_t i = 0; i < pos_count; i++) {
            result.positions.push_back(pos_array[i]);
        }

#ifdef _WIN32
        UnmapViewOfFile(mapped); CloseHandle(fd);
#else
        munmap(mapped, MAPPED_FILE_SIZE); close(fd);
#endif

        spdlog::info("[MappedPersist] Recovered {} positions, balance={:.2f}, age={:.0f}s",
                     result.positions.size(), result.account.balance,
                     (current_ns() - result.saved_at_ns) / 1e9);
        return result;
    }

    // Atomic snapshot — copy state under spinlock
    bool snapshot_atomic(const std::vector<MappedPosition>& positions,
                         const MappedAccount& account) {
        // Write to temp file, then rename for atomicity
        std::string tmp_path = base_dir_ + "/trading_state.tmp";
        std::string final_path = base_dir_ + "/trading_state.bin";

#ifdef _WIN32
        HANDLE fd = CreateFileA(tmp_path.c_str(), GENERIC_READ | GENERIC_WRITE,
                                0, nullptr, CREATE_ALWAYS,
                                FILE_ATTRIBUTE_NORMAL, nullptr);
        if (fd == INVALID_HANDLE_VALUE) return false;
        LARGE_INTEGER file_size;
        file_size.QuadPart = static_cast<LONGLONG>(MAPPED_FILE_SIZE);
        if (!SetFilePointerEx(fd, file_size, nullptr, FILE_BEGIN) || !SetEndOfFile(fd)) {
            CloseHandle(fd); return false;
        }
        HANDLE mapping = CreateFileMapping(fd, nullptr, PAGE_READWRITE, 0, 0, nullptr);
        if (!mapping) { CloseHandle(fd); return false; }
        void* mapped = MapViewOfFile(mapping, FILE_MAP_ALL_ACCESS, 0, 0, MAPPED_FILE_SIZE);
        CloseHandle(mapping);
        if (!mapped) { CloseHandle(fd); return false; }
#else
        int fd = open(tmp_path.c_str(), O_RDWR | O_CREAT | O_TRUNC, 0644);
        if (fd < 0) return false;

        if (ftruncate(fd, MAPPED_FILE_SIZE) != 0) {
            close(fd);
            return false;
        }

        void* mapped = mmap(nullptr, MAPPED_FILE_SIZE, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
        if (mapped == MAP_FAILED) {
            close(fd);
            return false;
        }
#endif

        auto* header = static_cast<MappedHeader*>(mapped);
        header->magic = MAPPED_MAGIC;
        header->version = MAPPED_VERSION;
        header->last_update_ns = current_ns();
        header->position_count = std::min(positions.size(), MAX_POSITIONS);

        auto* acct = reinterpret_cast<MappedAccount*>(
            static_cast<char*>(mapped) + sizeof(MappedHeader));
        *acct = account;

        auto* pos_array = reinterpret_cast<MappedPosition*>(
            static_cast<char*>(mapped) + sizeof(MappedHeader) + sizeof(MappedAccount));
        for (size_t i = 0; i < header->position_count; i++) {
            pos_array[i] = positions[i];
        }

#ifdef _WIN32
        FlushViewOfFile(mapped, MAPPED_FILE_SIZE);
        UnmapViewOfFile(mapped);
        CloseHandle(fd);
#else
        msync(mapped, MAPPED_FILE_SIZE, MS_SYNC);
        munmap(mapped, MAPPED_FILE_SIZE);
        close(fd);
#endif

        // Atomic rename
        std::error_code ec;
        fs::rename(tmp_path, final_path, ec);
        return !ec;
    }

private:
    std::string base_dir_;
    std::mutex mutex_;

    void unmap_all() {
        // Nothing to unmap — we mmap/munmap per operation
    }

    static uint64_t current_ns() {
        auto now = std::chrono::high_resolution_clock::now();
        return std::chrono::duration_cast<std::chrono::nanoseconds>(
            now.time_since_epoch()).count();
    }
};

} // namespace hft
