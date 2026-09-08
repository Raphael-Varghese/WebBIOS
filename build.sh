#!/usr/bin/env bash
set -e

echo "=========================================="
echo "  WebBIOS - QEMU-WASM Direct Build v15"
echo "  (guaranteed extraction, no --rm)"
echo "=========================================="

if ! docker info > /dev/null 2>&1; then
    echo "[ERROR] Docker is not running or not installed."
    exit 1
fi

# Do NOT clean. Reuse existing clone.
if [ ! -d qemu-wasm-build/qemu ]; then
    echo "[0/4] Fresh clone needed..."
    mkdir -p qemu-wasm-build
    cd qemu-wasm-build
    git clone --depth 1 https://github.com/ktock/qemu-wasm.git qemu
    cd qemu
else
    echo "[0/4] Reusing existing qemu-wasm-build/qemu"
    cd qemu-wasm-build/qemu
fi

# dtc setup (only if missing)
if [ ! -f "dtc/libfdt/fdt.c" ]; then
    echo "[1/4] Setting up dtc..."
    git submodule update --init --recursive --depth 1 2>/dev/null || true
    if [ ! -f "dtc/libfdt/fdt.c" ]; then
        rm -rf dtc
        git clone --depth 1 https://gitlab.com/qemu-project/dtc.git dtc
    fi
fi
echo "        dtc ok."

# Patch Dockerfile (idempotent)
if [ -f "Dockerfile" ] && ! grep -q "github.com/madler/zlib/releases/download" Dockerfile; then
    sed -i 's|https://zlib\.net/zlib-$ZLIB_VERSION\.tar\.xz|https://github.com/madler/zlib/releases/download/v$ZLIB_VERSION/zlib-$ZLIB_VERSION.tar.xz|g' Dockerfile
fi

echo "[2/4] Ensuring Docker image exists..."
docker build -t qemu-wasm-builder .

echo "[3/4] Building QEMU (container will be kept for extraction)..."
echo "        This will take 25-50 minutes. Do not interrupt."

# CRITICAL: No --rm. Container name is fixed so we can docker cp after it stops.
docker run \
    --name qemu-wasm-build-container \
    -v "$(pwd):/qemu" \
    -e PKG_CONFIG_PATH=/build/target/lib/pkgconfig \
    qemu-wasm-builder \
    bash -c '
        set -e
        mkdir -p /qemu-build && cd /qemu-build
        EXTRA_CFLAGS="-O3 -g -Wno-error=unused-command-line-argument -matomics -mbulk-memory -DNDEBUG -DG_DISABLE_ASSERT -D_GNU_SOURCE -sASYNCIFY=1 -pthread -sPROXY_TO_PTHREAD=1 -sFORCE_FILESYSTEM -sALLOW_TABLE_GROWTH -sTOTAL_MEMORY=1800MB -sWASM_BIGINT -sMALLOC=mimalloc --js-library=/build/node_modules/xterm-pty/emscripten-pty.js -sEXPORT_ES6=1 -sASYNCIFY_IMPORTS=ffi_call_js"
        emconfigure /qemu/configure \
            --static --target-list=x86_64-softmmu --cpu=wasm32 --cross-prefix= \
            --without-default-features --enable-system --with-coroutine=fiber \
            --enable-virtfs --enable-trace-backends=nop --disable-docs \
            --extra-cflags="$EXTRA_CFLAGS" --extra-cxxflags="$EXTRA_CFLAGS" \
            --extra-ldflags="-sEXPORTED_RUNTIME_METHODS=getTempRet0,setTempRet0,addFunction,removeFunction,TTY,FS"
        emmake make -j2 qemu-system-x86_64
        echo "BUILD COMPLETE"
    '

echo ""
echo "[4/4] Extracting artifacts from stopped container..."
mkdir -p ../../qemu-artifacts
docker cp qemu-wasm-build-container:/qemu-build/qemu-system-x86_64 ../../qemu-artifacts/out.js
docker cp qemu-wasm-build-container:/qemu-build/qemu-system-x86_64.wasm ../../qemu-artifacts/
docker rm qemu-wasm-build-container

echo ""
echo "=========================================="
echo "  DONE. Artifacts in qemu-artifacts/"
echo "=========================================="
ls -lah ../../qemu-artifacts/