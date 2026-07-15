// Health check HTTP server — lightweight /health endpoint for k8s probes.
//
// Runs on a dedicated thread, listens on a configurable port, and responds
// to GET /health with JSON from SystemMonitor + HealthStatus.
// Uses raw POSIX sockets (no external HTTP library needed).
#pragma once

#include "../monitoring/system_monitor.h"
#include "../utils/low_latency.h"
#include <atomic>
#include <thread>
#include <string>
#include <string_view>
#include <cstring>

#ifdef _WIN32
    #include <winsock2.h>
    #include <ws2tcpip.h>
    #pragma comment(lib, "ws2_32.lib")
    using socket_t = SOCKET;
    #define INVALID_SOCKET_VALUE INVALID_SOCKET
#else
    #include <sys/socket.h>
    #include <netinet/in.h>
    #include <unistd.h>
    #include <arpa/inet.h>
    using socket_t = int;
    #define INVALID_SOCKET_VALUE (-1)
#endif

namespace hft {

class HealthServer {
public:
    HealthServer(uint16_t port = 9091) : port_(port) {}

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
        if (thread_.joinable()) thread_.join();
#ifdef _WIN32
        WSACleanup();
#endif
    }

    void update_health(const HealthStatus& status) {
        health_ = status;
    }

private:
    void run() {
        socket_t srv = ::socket(AF_INET, SOCK_STREAM, 0);
        if (srv == INVALID_SOCKET_VALUE) {
            spdlog::error("Health server: socket() failed");
            return;
        }

        int opt = 1;
#ifdef _WIN32
        setsockopt(srv, SOL_SOCKET, SO_REUSEADDR, (const char*)&opt, sizeof(opt));
#else
        setsockopt(srv, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
#endif

        struct sockaddr_in addr;
        std::memset(&addr, 0, sizeof(addr));
        addr.sin_family = AF_INET;
        addr.sin_addr.s_addr = INADDR_ANY;
        addr.sin_port = htons(port_);

        if (::bind(srv, (struct sockaddr*)&addr, sizeof(addr)) < 0) {
            spdlog::error("Health server: bind() failed on port {}", port_);
#ifdef _WIN32
            closesocket(srv);
#else
            ::close(srv);
#endif
            return;
        }

        ::listen(srv, 4);

        while (running_.load(std::memory_order_relaxed)) {
            socket_t client = ::accept(srv, nullptr, nullptr);
            if (client == INVALID_SOCKET_VALUE) continue;

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
                    body = build_health_json();
                    status_line = health_.is_healthy() ? "200 OK" : "503 Service Unavailable";
                } else if (is_metrics) {
                    body = monitor_ ? monitor_->format_json() : "{}";
                    status_line = "200 OK";
                } else {
                    status_line = "404 Not Found";
                    body = R"({"error":"not found"})";
                }

                std::string response =
                    "HTTP/1.1 " + status_line + "\r\n"
                    "Content-Type: application/json\r\n"
                    "Content-Length: " + std::to_string(body.size()) + "\r\n"
                    "Connection: close\r\n"
                    "\r\n" + body;

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
        closesocket(srv);
#else
        ::close(srv);
#endif
    }

    std::string build_health_json() {
        std::string health_json = health_.format_json();
        std::string monitor_json = monitor_ ? monitor_->format_json() : "{}";
        return std::string("{\"status\":") + health_json +
               ",\"metrics\":" + monitor_json + "}";
    }

    uint16_t port_;
    std::thread thread_;
    std::atomic<bool> running_{false};
    SystemMonitor* monitor_{nullptr};
    HealthStatus health_;
};

} // namespace hft
