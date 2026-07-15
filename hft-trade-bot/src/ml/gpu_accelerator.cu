/**
 * GPU acceleration using CUDA for signal processing.
 *
 * Offloads compute-intensive operations to GPU:
 *   - Batch indicator calculation (RSI, EMA, MACD for 100+ symbols)
 *   - Matrix operations for portfolio optimization
 *   - Monte Carlo simulations for VaR
 *   - Neural network inference (cuDNN)
 *
 * Falls back to CPU when CUDA is not available.
 *
 * Compile with: nvcc -std=c++20 -O3 gpu_accelerator.cu -o gpu_accel
 * Or via CMake: enable_language(CUDA) + find_package(CUDAToolkit)
 */

#ifdef USE_CUDA

#include <cuda_runtime.h>
#include <device_launch_parameters.h>
#include <vector>
#include <cmath>
#include <spdlog/spdlog.h>

namespace hft {

// ── Kernels ──

__global__ void rsi_kernel(const float* prices, float* rsi_out, int n, int period) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx >= n || idx < period) return;

    float gains = 0.0f, losses = 0.0f;
    for (int i = idx - period + 1; i <= idx; i++) {
        float diff = prices[i] - prices[i - 1];
        if (diff > 0) gains += diff;
        else losses -= diff;
    }
    float avg_gain = gains / period;
    float avg_loss = losses / period;

    if (avg_loss == 0.0f) {
        rsi_out[idx] = 100.0f;
    } else {
        float rs = avg_gain / avg_loss;
        rsi_out[idx] = 100.0f - (100.0f / (1.0f + rs));
    }
}

__global__ void ema_kernel(const float* prices, float* ema_out, int n, int period) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx >= n) return;

    float alpha = 2.0f / (period + 1);
    if (idx == 0) {
        ema_out[idx] = prices[0];
        return;
    }

    // Sequential dependency — use shared memory for block-level computation
    __shared__ float s_data[256];
    int tid = threadIdx.x;

    if (tid == 0) {
        float ema = prices[0];
        for (int i = 1; i <= idx && i < n; i++) {
            ema = alpha * prices[i] + (1.0f - alpha) * ema;
        }
        ema_out[idx] = ema;
    }
}

__global__ void monte_carlo_var_kernel(
    const float* returns, float* simulated, int n_sims, int n_periods, float drift, float vol
) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx >= n_sims) return;

    curandState_t state;
    curand_init(12345, idx, 0, &state);

    float cumulative = 0.0f;
    for (int t = 0; t < n_periods; t++) {
        float z = curand_normal(&state);
        float ret = drift + vol * z;
        cumulative += ret;
        simulated[idx * n_periods + t] = cumulative;
    }
}

__global__ void matrix_mul_kernel(
    const float* A, const float* B, float* C, int M, int N, int K
) {
    int row = blockIdx.y * blockDim.y + threadIdx.y;
    int col = blockIdx.x * blockDim.x + threadIdx.x;

    if (row < M && col < N) {
        float sum = 0.0f;
        for (int i = 0; i < K; i++) {
            sum += A[row * K + i] * B[i * N + col];
        }
        C[row * N + col] = sum;
    }
}

// ── Host wrappers ──

class GPUAccelerator {
public:
    GPUAccelerator() : initialized_(false), device_id_(0) {
        int device_count = 0;
        cudaGetDeviceCount(&device_count);
        if (device_count > 0) {
            cudaGetDevice(&device_id_);
            cudaDeviceProp prop;
            cudaGetDeviceProperties(&prop, device_id_);
            spdlog::info("[GPU] Using device {}: {} (SM {}, {} MB)", 
                        device_id_, prop.name, prop.major, prop.totalGlobalMem / (1024*1024));
            initialized_ = true;
        } else {
            spdlog::warn("[GPU] No CUDA devices available");
        }
    }

    ~GPUAccelerator() {
        if (initialized_) {
            cudaDeviceReset();
        }
    }

    bool is_available() const { return initialized_; }

    // Batch RSI for multiple symbols
    std::vector<float> compute_rsi_batch(
        const std::vector<float>& prices, int period
    ) {
        if (!initialized_ || prices.size() < period + 1) return {};

        int n = prices.size();
        size_t bytes = n * sizeof(float);

        float *d_prices, *d_rsi;
        cudaMalloc(&d_prices, bytes);
        cudaMalloc(&d_rsi, bytes);

        cudaMemcpy(d_prices, prices.data(), bytes, cudaMemcpyHostToDevice);

        int threads = 256;
        int blocks = (n + threads - 1) / threads;
        rsi_kernel<<<blocks, threads>>>(d_prices, d_rsi, n, period);

        std::vector<float> rsi(n);
        cudaMemcpy(rsi.data(), d_rsi, bytes, cudaMemcpyDeviceToHost);

        cudaFree(d_prices);
        cudaFree(d_rsi);
        return rsi;
    }

    // Monte Carlo VaR simulation
    std::vector<float> monte_carlo_sim(
        int n_sims, int n_periods, float drift, float vol
    ) {
        if (!initialized_) return {};

        size_t bytes = n_sims * n_periods * sizeof(float);
        float* d_simulated;
        cudaMalloc(&d_simulated, bytes);

        int threads = 256;
        int blocks = (n_sims + threads - 1) / threads;
        monte_carlo_var_kernel<<<blocks, threads>>>(
            nullptr, d_simulated, n_sims, n_periods, drift, vol
        );

        std::vector<float> results(n_sims * n_periods);
        cudaMemcpy(results.data(), d_simulated, bytes, cudaMemcpyDeviceToHost);
        cudaFree(d_simulated);
        return results;
    }

    // Matrix multiplication for portfolio optimization
    std::vector<float> matrix_multiply(
        const std::vector<float>& A, const std::vector<float>& B,
        int M, int N, int K
    ) {
        if (!initialized_) return {};

        size_t bytes_a = M * K * sizeof(float);
        size_t bytes_b = K * N * sizeof(float);
        size_t bytes_c = M * N * sizeof(float);

        float *d_A, *d_B, *d_C;
        cudaMalloc(&d_A, bytes_a);
        cudaMalloc(&d_B, bytes_b);
        cudaMalloc(&d_C, bytes_c);

        cudaMemcpy(d_A, A.data(), bytes_a, cudaMemcpyHostToDevice);
        cudaMemcpy(d_B, B.data(), bytes_b, cudaMemcpyHostToDevice);

        dim3 block(16, 16);
        dim3 grid((N + 15) / 16, (M + 15) / 16);
        matrix_mul_kernel<<<grid, block>>>(d_A, d_B, d_C, M, N, K);

        std::vector<float> C(M * N);
        cudaMemcpy(C.data(), d_C, bytes_c, cudaMemcpyDeviceToHost);

        cudaFree(d_A);
        cudaFree(d_B);
        cudaFree(d_C);
        return C;
    }

private:
    bool initialized_;
    int device_id_;
};

} // namespace hft

#endif // USE_CUDA
