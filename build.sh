#!/usr/bin/env bash
set -e

echo "=========================================="
echo "  WebBIOS - QEMU-WASM Direct Build v12"
echo "  (lower parallelism, nop trace backend)"
echo "=========================================="

if ! docker info > /dev/null 2>&1; then
    echo "[ERROR] Docker is not running or not installed."
    exit 1
fi

# Clean old Docker-owned files using Docker itself
if [ -d qemu-wasm-build ]; then
    echo "[0/6] Cleaning old build directory (Docker-owned files)..."
    docker run --rm -v "$(pwd):/w" -w /w alpine rm -rf qemu-wasm-build 2>/dev/null || true
fi

mkdir -p qemu-wasm-build
cd qemu-wasm-build

echo "[1/6] Cloning qemu-wasm repository (fresh)..."
git clone --depth 1 https://github.com/ktock/qemu-wasm.git qemu

cd qemu

echo "[2/6] Setting up dtc/libfdt (required for fdt support)..."
git submodule update --init --recursive --depth 1 2>/dev/null || true

if [ ! -f "dtc/libfdt/fdt.c" ]; then
    echo "        dtc submodule missing. Cloning manually..."
    rm -rf dtc
    git clone --depth 1 https://gitlab.com/qemu-project/dtc.git dtc
fi

if [ ! -f "dtc/libfdt/fdt.c" ]; then
    echo "[ERROR] Failed to obtain dtc source."
    exit 1
fi

echo "        dtc source verified."

echo "[3/6] Patching zlib download URL in Dockerfile..."
DOCKERFILE="Dockerfile"
if [ -f "$DOCKERFILE" ]; then
    sed -i 's|https://zlib\.net/zlib-$ZLIB_VERSION\.tar\.xz|https://github.com/madler/zlib/releases/download/v$ZLIB_VERSION/zlib-$ZLIB_VERSION.tar.xz|g' "$DOCKERFILE"
    if grep -q "github.com/madler/zlib/releases/download" "$DOCKERFILE"; then
        echo "        Patch applied successfully."
    else
        echo "        [WARN] sed patch may not have matched."
        grep -n "zlib" "$DOCKERFILE" | head -5
    fi
else
    echo "[ERROR] Dockerfile not found"
    exit 1
fi

echo "[4/6] Building Docker image from repo Dockerfile..."
docker build -t qemu-wasm-builder .

echo "[5/6] Building QEMU inside repo builder image..."
echo "        This will take 25-60 minutes on first run."
echo "        Trace generation steps may appear frozen for 10+ minutes."
echo "        Do not interrupt unless CPU usage drops to zero for 30 min."
echo ""

# CHANGES in v12:
# - Reduced from -j$(nproc) to -j2 to avoid trace-generation deadlocks.
# - Added --enable-trace-backends=nop to speed up trace source generation.
# - Added --disable-docs explicitly (just in case).
# - Kept --with-coroutine=fiber and xterm-pty js-library as upstream requires.

docker run --rm \
    -v "$(pwd):/qemu" \
    -e PKG_CONFIG_PATH=/build/target/lib/pkgconfig \
    qemu-wasm-builder \
    bash -c '
        set -e
        mkdir -p /qemu-build
        cd /qemu-build
        
        EXTRA_CFLAGS="-O3 -g -Wno-error=unused-command-line-argument -matomics -mbulk-memory -DNDEBUG -DG_DISABLE_ASSERT -D_GNU_SOURCE -sASYNCIFY=1 -pthread -sPROXY_TO_PTHREAD=1 -sFORCE_FILESYSTEM -sALLOW_TABLE_GROWTH -sTOTAL_MEMORY=2300MB -sWASM_BIGINT -sMALLOC=mimalloc --js-library=/build/node_modules/xterm-pty/emscripten-pty.js -sEXPORT_ES6=1 -sASYNCIFY_IMPORTS=ffi_call_js"
        
        emconfigure /qemu/configure \
            --static \
            --target-list=x86_64-softmmu \
            --cpu=wasm32 \
            --cross-prefix= \
            --without-default-features \
            --enable-system \
            --with-coroutine=fiber \
            --enable-virtfs \
            --enable-trace-backends=nop \
            --disable-docs \
            --extra-cflags="$EXTRA_CFLAGS" \
            --extra-cxxflags="$EXTRA_CFLAGS" \
            --extra-ldflags="-sEXPORTED_RUNTIME_METHODS=getTempRet0,setTempRet0,addFunction,removeFunction,TTY,FS"
        
        # Build ONLY the emulator binary, with limited parallelism
        emmake make -j2 qemu-system-x86_64
        
        # Copy build artifacts to /output for extraction
        mkdir -p /output
        cp /qemu-build/qemu-system-x86_64 /output/ 2>/dev/null || true
        cp /qemu-build/qemu-system-x86_64.wasm /output/ 2>/dev/null || true
        cp /qemu-build/qemu-system-x86_64.js /output/out.js 2>/dev/null || true
    '

echo ""
echo "[6/6] Extracting build artifacts..."
mkdir -p "$(pwd)/../build-output"
docker cp "$(docker ps -lq):/output/." "$(pwd)/../build-output/" 2>/dev/null || true

cd "$(dirname "$0")"
mkdir -p qemu-artifacts
cp qemu-wasm-build/build-output/qemu-system-x86_64 qemu-artifacts/ 2>/dev/null || true
cp qemu-wasm-build/build-output/qemu-system-x86_64.wasm qemu-artifacts/ 2>/dev/null || true
cp qemu-wasm-build/build-output/out.js qemu-artifacts/out.js 2>/dev/null || true

echo "Done."
echo ""
echo "=========================================="
echo "  Artifacts copied to: qemu-artifacts/"
echo "=========================================="