#pragma once

/**
 * ONNX Runtime inference engine for C++ HFT Trade Bot.
 *
 * Loads ONNX models exported from Python (PyTorch, scikit-learn, etc.)
 * and runs inference directly in C++ — eliminates Python round-trip latency.
 *
 * Supported model types:
 *   - LSTM/Transformer price prediction
 *   - Classification (buy/sell/hold)
 *   - Regression (price/return prediction)
 *   - Ensemble models
 *
 * Usage:
 *   ONNXEngine engine("models/price_predictor.onnx");
 *   engine.initialize();
 *
 *   std::vector<float> features = {rsi, ema_fast, ema_slow, volume_ratio, ...};
 *   auto output = engine.infer(features);
 *   float predicted_return = output[0];
 *
 * Dependencies:
 *   - libonnxruntime (apt install libonnxruntime-dev or vcpkg install onnxruntime)
 *   - CMake: find_package(ONNXRuntime REQUIRED)
 */

#ifdef USE_ONNXRUNTIME

#include <chrono>
#include <memory>
#include <onnxruntime_cxx_api.h>
#include <spdlog/spdlog.h>
#include <string>
#include <unordered_map>
#include <vector>

namespace hft {

class ONNXEngine {
  public:
    explicit ONNXEngine(const std::string& model_path, int intra_op_threads = 2,
                        int inter_op_threads = 1)
        : model_path_(model_path), intra_threads_(intra_op_threads),
          inter_threads_(inter_op_threads), env_(ORT_LOGGING_LEVEL_WARNING, "hft_onnx"),
          initialized_(false) {
        session_options_ = Ort::SessionOptions();
        session_options_.SetIntraOpNumThreads(intra_threads_);
        session_options_.SetInterOpNumThreads(inter_threads_);
        session_options_.SetGraphOptimizationLevel(GraphOptimizationLevel::ORT_ENABLE_EXTENDED);
        session_options_.SetOptimizedModelFilePath((model_path_ + ".optimized.onnx").c_str());
    }

    ~ONNXEngine() = default;

    bool initialize() {
        try {
            session_ = std::make_unique<Ort::Session>(env_, model_path_.c_str(), session_options_);

            // Get input/output metadata
            Ort::AllocatorWithDefaultOptions allocator;

            size_t num_inputs = session_->GetInputCount();
            for (size_t i = 0; i < num_inputs; i++) {
                auto name = session_->GetInputNameAllocated(i, allocator);
                input_names_.push_back(name.get());
                input_names_ptr_.push_back(name.release());

                auto type_info   = session_->GetInputTypeInfo(i);
                auto tensor_info = type_info.GetTensorTypeAndShapeInfo();
                auto shape       = tensor_info.GetShape();
                input_shapes_.push_back(shape);

                spdlog::info("[ONNX] Input[{}]: '{}' shape=[{}]", i, input_names_[i],
                             format_shape(shape));
            }

            size_t num_outputs = session_->GetOutputCount();
            for (size_t i = 0; i < num_outputs; i++) {
                auto name = session_->GetOutputNameAllocated(i, allocator);
                output_names_.push_back(name.get());
                output_names_ptr_.push_back(name.release());

                spdlog::info("[ONNX] Output[{}]: '{}'", i, output_names_[i]);
            }

            initialized_ = true;
            spdlog::info("[ONNX] Model loaded: {} (inputs={}, outputs={})", model_path_, num_inputs,
                         num_outputs);
            return true;

        } catch (const Ort::Exception& e) {
            spdlog::error("[ONNX] Failed to load model {}: {}", model_path_, e.what());
            return false;
        }
    }

    /**
     * Run inference on a single feature vector.
     * Assumes model has one input tensor (float32) and one output tensor.
     *
     * @param features Input feature vector
     * @return Output values (predictions)
     */
    std::vector<float> infer(const std::vector<float>& features) {
        if (!initialized_ || !session_) {
            spdlog::warn("[ONNX] Engine not initialized");
            return {};
        }

        auto start = std::chrono::high_resolution_clock::now();

        try {
            // Create input tensor
            auto memory_info = Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);

            // Determine input shape — use dynamic batch=1
            std::vector<int64_t> input_shape;
            if (!input_shapes_.empty()) {
                input_shape = input_shapes_[0];
                // Replace -1 (dynamic) with 1
                for (auto& dim : input_shape) {
                    if (dim == -1) dim = 1;
                }
            } else {
                input_shape = {1, static_cast<int64_t>(features.size())};
            }

            // Calculate total elements from shape
            size_t total_elements = 1;
            for (auto d : input_shape)
                total_elements *= d;

            if (total_elements != features.size()) {
                // Reshape: assume {1, features.size()}
                input_shape    = {1, static_cast<int64_t>(features.size())};
                total_elements = features.size();
            }

            auto input_tensor = Ort::Value::CreateTensor<float>(
                memory_info, const_cast<float*>(features.data()), features.size(),
                input_shape.data(), input_shape.size());

            // Run inference
            const char* input_names[]  = {input_names_[0].c_str()};
            const char* output_names[] = {output_names_[0].c_str()};

            auto output_tensors = session_->Run(Ort::RunOptions{nullptr}, input_names,
                                                &input_tensor, 1, output_names, 1);

            // Extract output
            auto&  output_tensor = output_tensors.front();
            auto   type_info     = output_tensor.GetTensorTypeAndShapeInfo();
            auto   output_shape  = type_info.GetShape();
            size_t output_size   = 1;
            for (auto d : output_shape) {
                if (d > 0) output_size *= d;
            }

            float*             output_data = output_tensor.GetTensorMutableData<float>();
            std::vector<float> result(output_data, output_data + output_size);

            auto end = std::chrono::high_resolution_clock::now();
            auto us  = std::chrono::duration_cast<std::chrono::microseconds>(end - start).count();
            last_inference_us_ = us;
            inference_count_++;

            return result;

        } catch (const Ort::Exception& e) {
            spdlog::error("[ONNX] Inference error: {}", e.what());
            error_count_++;
            return {};
        }
    }

    /**
     * Run inference with named inputs (multi-input models).
     */
    std::vector<float>
    infer_named(const std::unordered_map<std::string, std::vector<float>>& inputs) {

        if (!initialized_ || !session_) return {};

        try {
            auto memory_info = Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);

            std::vector<Ort::Value>  input_tensors;
            std::vector<const char*> input_name_ptrs;

            for (size_t i = 0; i < input_names_.size(); i++) {
                const auto& name = input_names_[i];
                auto        it   = inputs.find(name);
                if (it == inputs.end()) {
                    spdlog::warn("[ONNX] Missing input: {}", name);
                    return {};
                }

                std::vector<int64_t> shape  = {1, static_cast<int64_t>(it->second.size())};
                auto                 tensor = Ort::Value::CreateTensor<float>(
                    memory_info, const_cast<float*>(it->second.data()), it->second.size(),
                    shape.data(), shape.size());
                input_tensors.push_back(std::move(tensor));
                input_name_ptrs.push_back(name.c_str());
            }

            std::vector<const char*> output_name_ptrs;
            for (const auto& name : output_names_) {
                output_name_ptrs.push_back(name.c_str());
            }

            auto output_tensors = session_->Run(Ort::RunOptions{nullptr}, input_name_ptrs.data(),
                                                input_tensors.data(), input_tensors.size(),
                                                output_name_ptrs.data(), output_name_ptrs.size());

            auto&  output_tensor = output_tensors.front();
            auto   type_info     = output_tensor.GetTensorTypeAndShapeInfo();
            size_t output_size   = 1;
            for (auto d : type_info.GetShape()) {
                if (d > 0) output_size *= d;
            }

            float* output_data = output_tensor.GetTensorMutableData<float>();
            return std::vector<float>(output_data, output_data + output_size);

        } catch (const Ort::Exception& e) {
            spdlog::error("[ONNX] Named inference error: {}", e.what());
            return {};
        }
    }

    // Stats
    uint64_t inference_count() const { return inference_count_; }
    uint64_t error_count() const { return error_count_; }
    uint64_t last_inference_us() const { return last_inference_us_; }
    bool     is_initialized() const { return initialized_; }

  private:
    std::string model_path_;
    int         intra_threads_;
    int         inter_threads_;

    Ort::Env                      env_;
    Ort::SessionOptions           session_options_;
    std::unique_ptr<Ort::Session> session_;

    std::vector<std::string>             input_names_;
    std::vector<Ort::AllocatedStringPtr> input_names_ptr_;
    std::vector<std::vector<int64_t>>    input_shapes_;
    std::vector<std::string>             output_names_;
    std::vector<Ort::AllocatedStringPtr> output_names_ptr_;

    bool     initialized_;
    uint64_t inference_count_   = 0;
    uint64_t error_count_       = 0;
    uint64_t last_inference_us_ = 0;

    static std::string format_shape(const std::vector<int64_t>& shape) {
        std::string s = "[";
        for (size_t i = 0; i < shape.size(); i++) {
            if (i > 0) s += ", ";
            s += std::to_string(shape[i]);
        }
        s += "]";
        return s;
    }
};

} // namespace hft

#endif // USE_ONNXRUNTIME
