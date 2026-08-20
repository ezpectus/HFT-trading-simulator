# ── Build stage: compile with full toolchain ──
# Builder and runtime use the SAME Debian release (bookworm) to avoid ABI
# mismatches between libfmt/spdlog/yaml-cpp/boost versions across stages.
FROM gcc:15-bookworm AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake \
    libboost-dev \
    libboost-system-dev \
    libboost-random-dev \
    libssl-dev \
    libwebsocketpp-dev \
    libspdlog-dev \
    libfmt-dev \
    nlohmann-json3-dev \
    libyaml-cpp-dev libasio-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy source and build
COPY . .

# Patch websocketpp C++17/C++20 incompatibility (template-id not allowed in constructor/destructor)
RUN sed -i 's/endpoint<connection,config>/endpoint/g' /usr/include/websocketpp/endpoint.hpp \
    && sed -i 's/basic<concurrency,names>/basic/g' /usr/include/websocketpp/logger/basic.hpp \
    && sed -i 's/stub<concurrency,names>/stub/g' /usr/include/websocketpp/logger/stub.hpp || true

RUN mkdir -p build && cd build && cmake .. -DCMAKE_BUILD_TYPE=Release && make -j$(nproc)

# ── Runtime stage: slim image with only runtime libs ──
# Same Debian release as builder (bookworm) to keep ABI stable.
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime libraries only — versions matched to bookworm's -dev packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    libboost-system1.74.0 \
    libboost-random1.74.0 \
    libssl3 \
    libspdlog1.10 \
    libfmt9 \
    libyaml-cpp0.7 \
    wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy built binary and config from builder
COPY --from=builder /app/build/hft_trade_bot /app/build/hft_trade_bot
COPY --from=builder /app/config /app/config

RUN groupadd -r appuser && useradd -r -g appuser appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 9091

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=10s \
    CMD wget -q --spider http://localhost:9091/health || exit 1

CMD ["./build/hft_trade_bot", "config/config.yaml"]
