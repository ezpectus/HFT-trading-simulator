# ── Build stage: compile with full toolchain ──
FROM gcc:14 AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake \
    libboost-dev \
    libboost-system-dev \
    libssl-dev \
    libwebsocketpp-dev \
    libspdlog-dev \
    libfmt-dev \
    nlohmann-json3-dev \
    libyaml-cpp-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy source and build
COPY . .
RUN mkdir -p build && cd build && cmake .. -DCMAKE_BUILD_TYPE=Release && make -j$(nproc)

# ── Runtime stage: slim image with only runtime libs ──
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime libraries only (no -dev packages)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libboost-system1.74.0 \
    libssl3 \
    libspdlog1 \
    libfmt9 \
    libyaml-cpp0.7 \
    && rm -rf /var/lib/apt/lists/*

# Copy built binary and config from builder
COPY --from=builder /app/build/hft_trade_bot /app/build/hft_trade_bot
COPY --from=builder /app/config /app/config

CMD ["./build/hft_trade_bot", "config/config.yaml"]
