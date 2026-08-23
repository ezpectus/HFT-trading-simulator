// Prometheus Metrics Collector for HFT Trade Bot
//
// Header file for metrics collection with Counter, Gauge, and Histogram
// for signal generation latency, order execution latency, and system resources.

#pragma once

#include <map>
#include <set>
#include <sstream>
#include <string>
#include <vector>
#include <mutex>
#include <thread>
#include <atomic>
#include <cstdint>
#include "../utils/low_latency.h"

namespace hft {
namespace metrics {

class HistogramBuckets {
public:
    explicit HistogramBuckets(const std::vector<double>& buckets);
    
    void observe(double value);
    
    std::vector<double> get_buckets() const;
    std::vector<uint64_t> get_counts() const;
    uint64_t get_total_count() const;
    double get_sum() const;

private:
    std::vector<double> buckets_;
    std::vector<uint64_t> counts_;
    uint64_t total_count_;
    double sum_;
};

class MetricsCollector {
public:
    explicit MetricsCollector(int port = 8002);
    ~MetricsCollector();
    
    // Counter operations
    void increment_counter(const std::string& name, 
                          const std::map<std::string, std::string>& labels = {});
    
    // Gauge operations
    void set_gauge(const std::string& name, 
                  double value,
                  const std::map<std::string, std::string>& labels = {});
    
    // Histogram operations
    void observe_histogram(const std::string& name,
                         double value,
                         const std::map<std::string, std::string>& labels = {});
    
    // Convenience methods
    void record_signal_generation_latency(double latency_us, const std::string& strategy);
    void record_order_execution_latency(double latency_us, const std::string& symbol);
    void record_fill(const std::string& symbol, const std::string& side);
    void record_error(const std::string& error_type, const std::string& component);
    
    void update_system_metrics(double cpu_usage, double memory_usage, int active_connections);
    void update_portfolio_value(double value, const std::string& currency);
    
    // HTTP server
    void start_http_server();
    void stop_http_server();
    
    // Metrics export
    std::string generate_prometheus_output();

private:
    std::string serialize_labels(const std::map<std::string, std::string>& labels) const;
    void http_server_loop();
    void export_counters(std::stringstream& output, std::set<std::string>& seen_types);
    void export_gauges(std::stringstream& output, std::set<std::string>& seen_types);
    void export_histograms(std::stringstream& output, std::set<std::string>& seen_types);
    
    int metrics_port_;
    std::atomic<bool> http_server_running_;
    std::thread http_server_thread_;
    
    Spinlock metrics_mutex_;
    std::map<std::string, uint64_t> counters_;
    std::map<std::string, double> gauges_;
    std::map<std::string, HistogramBuckets> histograms_;
};

} // namespace metrics
} // namespace hft
