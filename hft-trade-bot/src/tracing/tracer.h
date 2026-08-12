// OpenTelemetry Tracing for HFT Trade Bot
//
// Header file for distributed tracing with OpenTelemetry for key operations
// including signal generation, order execution, and trace context propagation.

#pragma once

#include <map>
#include <string>
#include <vector>
#include <mutex>
#include <chrono>

namespace hft {
namespace tracing {

enum class StatusCode {
    OK,
    ERROR,
    UNSET
};

class Span {
public:
    explicit Span(const std::string& name);
    
    void add_attribute(const std::string& key, const std::string& value);
    void add_event(const std::string& event_name, std::chrono::system_clock::time_point timestamp);
    void set_status(StatusCode status);
    
    std::string get_name() const;
    std::map<std::string, std::string> get_attributes() const;
    std::vector<std::pair<std::string, std::chrono::system_clock::time_point>> get_events() const;
    StatusCode get_status() const;

private:
    std::string name_;
    std::map<std::string, std::string> attributes_;
    std::vector<std::pair<std::string, std::chrono::system_clock::time_point>> events_;
    StatusCode status_;
    std::chrono::system_clock::time_point start_time_;
    std::chrono::system_clock::time_point end_time_;
};

class Tracer {
public:
    Tracer(const std::string& service_name = "hft-trade-bot",
           const std::string& jaeger_host = "localhost",
           int jaeger_port = 6831);
    ~Tracer();
    
    // Tracing methods
    void trace_signal_generation(const std::string& strategy, const std::string& symbol);
    void trace_order_execution(const std::string& symbol, const std::string& side, double quantity);
    void trace_signal_processing(const std::string& signal_type, double latency_us);
    void trace_orderbook_update(const std::string& symbol, double latency_us);
    
    // Context propagation
    void inject_context(std::map<std::string, std::string>& headers);
    void extract_context(const std::map<std::string, std::string>& headers, std::map<std::string, std::string>& context);

private:
    std::string generate_trace_id();
    std::string generate_span_id();
    
    std::string service_name_;
    std::string jaeger_host_;
    int jaeger_port_;
    
    std::mutex tracer_mutex_;
    std::vector<Span> spans_;
};

} // namespace tracing
} // namespace hft
