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

# Patch websocketpp C++17/C++20 incompatibility (template-id not allowed in constructor/destructor)
RUN sed -i 's/endpoint<connection,config>/endpoint/g' /usr/include/websocketpp/endpoint.hpp \
    && sed -i 's/basic<concurrency,names>/basic/g' /usr/include/websocketpp/logger/basic.hpp \
    && sed -i 's/stub<concurrency,names>/stub/g' /usr/include/websocketpp/logger/stub.hpp || true

RUN mkdir -p build && cd build && cmake .. -DCMAKE_BUILD_TYPE=Release && make -j$(nproc)

# ── Runtime stage: slim image with only runtime libs ──
FROM debian:trixie-slim

WORKDIR /app

# Install runtime libraries only (no -dev packages)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libboost-system1.83.0 \
    libboost-random1.83.0 \
    libssl3 \
    libspdlog1.15 \
    libfmt10 \
    libyaml-cpp0.8 \
    && rm -rf /var/lib/apt/lists/*

# Copy built binary and config from builder
COPY --from=builder /app/build/hft_trade_bot /app/build/hft_trade_bot
COPY --from=builder /app/config /app/config

CMD ["./build/hft_trade_bot", "config/config.yaml"]
