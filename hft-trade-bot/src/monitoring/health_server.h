// Health check HTTP server — lightweight /health endpoint for k8s probes.
//
// Runs on a dedicated thread, listens on a configurable port, and responds
// to GET /health with JSON from SystemMonitor + HealthStatus.
// Uses raw POSIX sockets (no external HTTP library needed).
#pragma once

#include "../monitoring/system_monitor.h"
#include "../utils/low_latency.h"
#include <atomic>
#include <cstring>
#include <string>
#include <string_view>
#include <thread>
#include <utility>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "ws2_32.lib")
using socket_t                    = SOCKET;
constexpr socket_t kInvalidSocket = INVALID_SOCKET;
#else
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
using socket_t                    = int;
constexpr socket_t kInvalidSocket = -1;
#endif

namespace hft {

class HealthServer {
  public:
    HealthServer(uint16_t port = 9091, std::string host = "0.0.0.0")
        : port_(port), host_(std::move(host)) {}

    ~HealthServer() { stop(); }

    void start(SystemMonitor* monitor) {
        monitor_ = monitor;
        running_.store(true, std::memory_order_relaxed);

#ifdef _WIN32
        WSADATA wsa;
        WSAStartup(MAKEWORD(2, 2), &wsa);
#endif

        thread_ = std::thread([this] { run(); });
        spdlog::info("Health server listening on port {}", port_);
    }

    void stop() {
        if (!running_.exchange(false, std::memory_order_relaxed)) return;
        // Close server socket to unblock accept() in run()
        if (server_sock_ != kInvalidSocket) {
#ifdef _WIN32
            ::closesocket(server_sock_);
#else
            ::close(server_sock_);
#endif
            server_sock_ = kInvalidSocket;
        }
        if (thread_.joinable()) thread_.join();
#ifdef _WIN32
        WSACleanup();
#endif
    }

    void update_health(const HealthStatus& status) { health_ = status; }

  private:
    void run() {
        server_sock_ = ::socket(AF_INET, SOCK_STREAM, 0);
        if (server_sock_ == kInvalidSocket) {
            spdlog::error("Health server: socket() failed");
            return;
        }

        int opt = 1;
#ifdef _WIN32
        setsockopt(server_sock_, SOL_SOCKET, SO_REUSEADDR, (const char*)&opt, sizeof(opt));
#else
        setsockopt(server_sock_, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
#endif

        struct sockaddr_in addr;
        std::memset(&addr, 0, sizeof(addr));
        addr.sin_family = AF_INET;
        // metrics.host selects the bind address — default stays INADDR_ANY so
        // compose/prometheus scraping keeps working; set 127.0.0.1 to keep
        // positions/PnL off the wire.
        if (::inet_pton(AF_INET, host_.c_str(), &addr.sin_addr) != 1) {
            spdlog::warn("Health server: invalid metrics.host '{}' — falling back to 0.0.0.0",
                         host_);
            addr.sin_addr.s_addr = INADDR_ANY;
        }
        addr.sin_port = htons(port_);

        if (::bind(server_sock_, (struct sockaddr*)&addr, sizeof(addr)) < 0) {
            spdlog::error("Health server: bind() failed on port {}", port_);
#ifdef _WIN32
            closesocket(server_sock_);
#else
            ::close(server_sock_);
#endif
            server_sock_ = kInvalidSocket;
            return;
        }

        ::listen(server_sock_, 4);

        while (running_.load(std::memory_order_relaxed)) {
            socket_t client = ::accept(server_sock_, nullptr, nullptr);
            if (client == kInvalidSocket) {
                if (!running_.load(std::memory_order_relaxed)) break;
                continue;
            }

            // One accept-loop thread serves every client — an idle client that
            // opens TCP and sends nothing must not freeze /health + /metrics
            // for every probe behind it. Bound the blocking read/write.
#ifdef _WIN32
            DWORD io_timeout = 5000;
            ::setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, (const char*)&io_timeout,
                         sizeof(io_timeout));
            ::setsockopt(client, SOL_SOCKET, SO_SNDTIMEO, (const char*)&io_timeout,
                         sizeof(io_timeout));
#else
            struct timeval io_timeout {
                5, 0
            };
            ::setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, &io_timeout, sizeof(io_timeout));
            ::setsockopt(client, SOL_SOCKET, SO_SNDTIMEO, &io_timeout, sizeof(io_timeout));
#endif

            // Read request (minimal — just need the first line)
            char buf[512];
#ifdef _WIN32
            int n = ::recv(client, buf, sizeof(buf) - 1, 0);
#else
            ssize_t n = ::read(client, buf, sizeof(buf) - 1);
#endif
            if (n > 0) {
                buf[n] = '\0';
                std::string_view req(buf, n);

                bool is_health = (req.find("GET /health") != std::string_view::npos) ||
                                 (req.find("GET / ") != std::string_view::npos);
                bool is_metrics = (req.find("GET /metrics") != std::string_view::npos);

                std::string body;
                std::string status_line;

                if (is_health) {
                    body        = build_health_json();
                    status_line = health_.is_healthy() ? "200 OK" : "503 Service Unavailable";
                } else if (is_metrics) {
                    body        = monitor_ ? monitor_->format_prometheus() : "";
                    status_line = "200 OK";
                } else {
                    status_line = "404 Not Found";
                    body        = R"({"error":"not found"})";
                }

                std::string response =
                    "HTTP/1.1 " + status_line +
                    "\r\n"
                    "Content-Type: " +
                    (is_metrics ? "text/plain; version=0.0.4" : "application/json") +
                    "\r\n"
                    "Content-Length: " +
                    std::to_string(body.size()) +
                    "\r\n"
                    "Connection: close\r\n"
                    "\r\n" +
                    body;

#ifdef _WIN32
                ::send(client, response.c_str(), (int)response.size(), 0);
                closesocket(client);
#else
                ::write(client, response.c_str(), response.size());
                ::close(client);
#endif
            } else {
#ifdef _WIN32
                closesocket(client);
#else
                ::close(client);
#endif
            }
        }

#ifdef _WIN32
        closesocket(server_sock_);
#else
        ::close(server_sock_);
#endif
        server_sock_ = kInvalidSocket;
    }

    std::string build_health_json() {
        std::string health_json  = health_.format_json();
        std::string monitor_json = monitor_ ? monitor_->format_json() : "{}";
        return std::string("{\"status\":") + health_json + ",\"metrics\":" + monitor_json + "}";
    }

    uint16_t          port_;
    std::string       host_;
    socket_t          server_sock_{kInvalidSocket};
    std::thread       thread_;
    std::atomic<bool> running_{false};
    SystemMonitor*    monitor_{nullptr};
    HealthStatus      health_;
};

} // namespace hft
