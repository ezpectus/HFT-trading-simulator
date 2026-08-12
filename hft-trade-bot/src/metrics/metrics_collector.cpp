// Prometheus Metrics Collector for HFT Trade Bot
//
// Implements metrics collection with Counter, Gauge, and Histogram
// for signal generation latency, order execution latency, and system resources.

#include "metrics_collector.h"
#include <chrono>
#include <thread>
#include <sstream>
#include <iomanip>

namespace hft {
namespace metrics {

MetricsCollector::MetricsCollector(int port)
    : metrics_port_(port),
      http_server_running_(false) {
    
    // Initialize metrics
    // Counters
    counters_["orders_total"] = 0;
    counters_["fills_total"] = 0;
    counters_["signals_generated_total"] = 0;
    counters_["errors_total"] = 0;
    
    // Gauges
    gauges_["cpu_usage_percent"] = 0.0;
    gauges_["memory_usage_bytes"] = 0.0;
    gauges_["active_connections"] = 0.0;
    gauges_["portfolio_value"] = 0.0;
    
    // Histograms will be stored as vectors of buckets
    histograms_["signal_latency"] = HistogramBuckets({1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000});
    histograms_["order_latency"] = HistogramBuckets({1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000});
    histograms_["execution_latency"] = HistogramBuckets({0.1, 0.5, 1, 5, 10, 25, 50, 100, 250, 500, 1000});
}

MetricsCollector::~MetricsCollector() {
    stop_http_server();
}

void MetricsCollector::increment_counter(const std::string& name, const std::map<std::string, std::string>& labels) {
    std::lock_guard<std::mutex> lock(metrics_mutex_);
    std::string key = name + serialize_labels(labels);
    counters_[key]++;
}

void MetricsCollector::set_gauge(const std::string& name, double value, const std::map<std::string, std::string>& labels) {
    std::lock_guard<std::mutex> lock(metrics_mutex_);
    std::string key = name + serialize_labels(labels);
    gauges_[key] = value;
}

void MetricsCollector::observe_histogram(const std::string& name, double value, const std::map<std::string, std::string>& labels) {
    std::lock_guard<std::mutex> lock(metrics_mutex_);
    std::string key = name + serialize_labels(labels);
    
    if (histograms_.find(key) == histograms_.end()) {
        histograms_[key] = HistogramBuckets({1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000});
    }
    
    histograms_[key].observe(value);
}

void MetricsCollector::record_signal_generation_latency(double latency_us, const std::string& strategy) {
    std::map<std::string, std::string> labels = {{"strategy", strategy}};
    increment_counter("signals_generated_total", labels);
    observe_histogram("signal_latency", latency_us, labels);
}

void MetricsCollector::record_order_execution_latency(double latency_us, const std::string& symbol) {
    std::map<std::string, std::string> labels = {{"symbol", symbol}};
    increment_counter("orders_total", labels);
    observe_histogram("order_latency", latency_us, labels);
}

void MetricsCollector::record_fill(const std::string& symbol, const std::string& side) {
    std::map<std::string, std::string> labels = {{"symbol", symbol}, {"side", side}};
    increment_counter("fills_total", labels);
}

void MetricsCollector::record_error(const std::string& error_type, const std::string& component) {
    std::map<std::string, std::string> labels = {{"error_type", error_type}, {"component", component}};
    increment_counter("errors_total", labels);
}

void MetricsCollector::update_system_metrics(double cpu_usage, double memory_usage, int active_connections) {
    set_gauge("cpu_usage_percent", cpu_usage);
    set_gauge("memory_usage_bytes", memory_usage);
    set_gauge("active_connections", static_cast<double>(active_connections));
}

void MetricsCollector::update_portfolio_value(double value, const std::string& currency) {
    std::map<std::string, std::string> labels = {{"currency", currency}};
    set_gauge("portfolio_value", value, labels);
}

void MetricsCollector::start_http_server() {
    if (http_server_running_) {
        return;
    }
    
    http_server_running_ = true;
    http_server_thread_ = std::thread(&MetricsCollector::http_server_loop, this);
}

void MetricsCollector::stop_http_server() {
    if (!http_server_running_) {
        return;
    }
    
    http_server_running_ = false;
    if (http_server_thread_.joinable()) {
        http_server_thread_.join();
    }
}

std::string MetricsCollector::serialize_labels(const std::map<std::string, std::string>& labels) const {
    if (labels.empty()) {
        return "";
    }
    
    std::stringstream ss;
    ss << "{";
    bool first = true;
    for (const auto& [key, value] : labels) {
        if (!first) {
            ss << ",";
        }
        ss << key << "=\"" << value << "\"";
        first = false;
    }
    ss << "}";
    return ss.str();
}

std::string MetricsCollector::generate_prometheus_output() {
    std::lock_guard<std::mutex> lock(metrics_mutex_);
    std::stringstream output;
    
    // Export counters
    for (const auto& [name, value] : counters_) {
        output << "# TYPE " << name << " counter\n";
        output << name << " " << value << "\n";
    }
    
    // Export gauges
    for (const auto& [name, value] : gauges_) {
        output << "# TYPE " << name << " gauge\n";
        output << name << " " << std::fixed << std::setprecision(2) << value << "\n";
    }
    
    // Export histograms
    for (const auto& [name, histogram] : histograms_) {
        output << "# TYPE " << name << " histogram\n";
        const auto& buckets = histogram.get_buckets();
        const auto& counts = histogram.get_counts();
        
        for (size_t i = 0; i < buckets.size(); ++i) {
            output << name << "_bucket{le=\"" << buckets[i] << "\"} " << counts[i] << "\n";
        }
        output << name << "_bucket{le=\"+Inf\"} " << histogram.get_total_count() << "\n";
        output << name << "_sum " << histogram.get_sum() << "\n";
        output << name << "_count " << histogram.get_total_count() << "\n";
    }
    
    return output.str();
}

void MetricsCollector::http_server_loop() {
    // Simplified HTTP server - in production, use a proper HTTP library
    // This is a placeholder for the metrics endpoint
    while (http_server_running_) {
        std::this_thread::sleep_for(std::chrono::seconds(1));
        // In production, this would listen on the metrics port and serve
        // the Prometheus metrics output
    }
}

// HistogramBuckets implementation
void HistogramBuckets::observe(double value) {
    total_count_++;
    sum_ += value;
    
    for (size_t i = 0; i < buckets_.size(); ++i) {
        if (value <= buckets_[i]) {
            counts_[i]++;
        }
    }
}

std::vector<double> HistogramBuckets::get_buckets() const {
    return buckets_;
}

std::vector<uint64_t> HistogramBuckets::get_counts() const {
    return counts_;
}

uint64_t HistogramBuckets::get_total_count() const {
    return total_count_;
}

double HistogramBuckets::get_sum() const {
    return sum_;
}

} // namespace metrics
} // namespace hft
