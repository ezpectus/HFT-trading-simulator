# ── Build stage: compile with full toolchain ──
FROM gcc:14 AS builder

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

# Patch websocketpp C++17/C++20 incompatibility (template-id in destructor)
RUN sed -i 's/~endpoint<connection,config>()/{}/g' /usr/include/websocketpp/endpoint.hpp \
    && sed -i 's/~basic<concurrency,names>()/{}/g' /usr/include/websocketpp/logger/basic.hpp

RUN mkdir -p build && cd build && cmake .. -DCMAKE_BUILD_TYPE=Release && make -j$(nproc)

# ── Runtime stage: slim image with only runtime libs ──
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime libraries only (no -dev packages)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libboost-system1.74.0 \
    libboost-random1.74.0 \
    libssl3 \
    libspdlog1.10 \
    libfmt9 \
    libyaml-cpp0.7 \
    && rm -rf /var/lib/apt/lists/*

# Copy built binary and config from builder
COPY --from=builder /app/build/hft_trade_bot /app/build/hft_trade_bot
COPY --from=builder /app/config /app/config

CMD ["./build/hft_trade_bot", "config/config.yaml"]
