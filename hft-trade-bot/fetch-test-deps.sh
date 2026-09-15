#!/usr/bin/env bash
# Fetch test-only dependencies into hft-trade-bot/deps/ (gitignored).
# Used by CMake's HFT_TESTS_ONLY mode when system/vcpkg packages are absent.
# Requires: git, curl, cmake, ninja, a C++20 compiler (clang++).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p deps/nlohmann

echo "==> nlohmann/json (single header)"
curl -fsSL -o deps/nlohmann/json.hpp \
    https://raw.githubusercontent.com/nlohmann/json/v3.11.3/single_include/nlohmann/json.hpp

echo "==> spdlog (header-only, bundled fmt)"
git clone --depth 1 --branch v1.15.3 https://github.com/gabime/spdlog deps/_spdlog_src
mkdir -p deps/spdlog && cp -r deps/_spdlog_src/include/spdlog deps/spdlog/
rm -rf deps/_spdlog_src

echo "==> fmt (header-only via FMT_HEADER_ONLY)"
git clone --depth 1 --branch 11.1.4 https://github.com/fmtlib/fmt deps/_fmt_src
mkdir -p deps/fmt && cp -r deps/_fmt_src/include/fmt deps/fmt/
rm -rf deps/_fmt_src

echo "==> asio standalone (for signal_receiver/test_signal_engine)"
git clone --depth 1 --branch asio-1-30-2 https://github.com/chriskohlhoff/asio deps/_asio_src
mkdir -p deps/asio && cp -r deps/_asio_src/asio/include/* deps/asio/
rm -rf deps/_asio_src

echo "==> yaml-cpp (prebuilt static lib)"
git clone --depth 1 --branch 0.8.0 https://github.com/jbeder/yaml-cpp deps/_yaml_src
cmake -S deps/_yaml_src -B deps/_yaml_build -G Ninja -DCMAKE_BUILD_TYPE=Release \
    -DYAML_CPP_BUILD_TESTS=OFF -DYAML_CPP_BUILD_TOOLS=OFF \
    -DYAML_CPP_BUILD_CONTRIB=OFF -DYAML_BUILD_SHARED_LIBS=OFF \
    -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
    -DCMAKE_CXX_COMPILER=clang++ -DCMAKE_C_COMPILER=clang
cmake --build deps/_yaml_build

echo "==> OpenSSL (msys2 ucrt64 prebuilt — headers + static libs)"
OPENSSL_PKG=mingw-w64-ucrt-x86_64-openssl-3.6.4-1-any.pkg.tar.zst
curl -fsSL -o /tmp/openssl.pkg.tar.zst "https://mirror.msys2.org/mingw/ucrt64/${OPENSSL_PKG}"
python - <<'PYEOF'
import zstandard as zstd, tarfile, io, os, shutil
raw = zstd.ZstdDecompressor().stream_reader(io.BytesIO(open('/tmp/openssl.pkg.tar.zst','rb').read())).read()
tf = tarfile.open(fileobj=io.BytesIO(raw))
tf.extractall('deps/_ossl', filter='data')
os.makedirs('deps/openssl', exist_ok=True)
shutil.copytree('deps/_ossl/ucrt64/include/openssl', 'deps/openssl/openssl', dirs_exist_ok=True)
for lib in ('libssl.a', 'libcrypto.a'):
    shutil.copy2(f'deps/_ossl/ucrt64/lib/{lib}', 'deps/openssl/')
shutil.rmtree('deps/_ossl')
PYEOF

echo "Done. Configure with: cmake -B build-mingw -G Ninja -DHFT_TESTS_ONLY=ON -DCMAKE_CXX_COMPILER=clang++"
