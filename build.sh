#!/usr/bin/env bash
set -e

echo "=========================================="
echo "  WebBIOS - QEMU-WASM Direct Build v6"
echo "  (fixes zlib GitHub release URL format)"
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

echo "[2/6] Patching zlib download URL in Dockerfile..."
# The repo's Dockerfile downloads zlib from zlib.net which is now broken.
# GitHub release assets have a different path format:
#   OLD: https://zlib.net/zlib-$ZLIB_VERSION.tar.xz
#   NEW: https://github.com/madler/zlib/releases/download/v$ZLIB_VERSION/zlib-$ZLIB_VERSION.tar.xz
#
# We patch the Dockerfile to use the correct GitHub release URL format.

DOCKERFILE="Dockerfile"
if [ -f "$DOCKERFILE" ]; then
    echo "        Patching: $DOCKERFILE"
    # Replace the full zlib URL pattern correctly
    sed -i 's|https://zlib\.net/zlib-$ZLIB_VERSION\.tar\.xz|https://github.com/madler/zlib/releases/download/v$ZLIB_VERSION/zlib-$ZLIB_VERSION.tar.xz|g' "$DOCKERFILE"
    # Verify the patch worked
    if grep -q "github.com/madler/zlib/releases/download" "$DOCKERFILE"; then
        echo "        Patch applied successfully."
    else
        echo "        [WARN] sed patch may not have matched. Checking Dockerfile content..."
        grep -n "zlib" "$DOCKERFILE" | head -5
    fi
else
    echo "[ERROR] Dockerfile not found at $(pwd)/Dockerfile"
    exit 1
fi

echo "[3/6] Building Docker image from repo Dockerfile..."
echo "        This image contains the full Emscripten + deps environment"
docker build -t qemu-wasm-builder .

echo "[4/6] Building QEMU inside repo builder image..."
echo "        This will take 25-60 minutes on first run."
echo ""

docker run --rm     -v "$(pwd):/qemu"     -v "$(pwd)/../build-output:/build"     -w /qemu     qemu-wasm-builder     bash -c '
        set -e
        mkdir -p /build
        cd /build

        emconfigure /qemu/configure             --static             --target-list=x86_64-softmmu             --cpu=wasm32             --cross-prefix=             --without-default-features             --enable-system             --with-coroutine=fiber             --enable-virtfs             --disable-fdt             --disable-capstone             --disable-gnutls             --disable-nettle             --disable-gcrypt             --disable-auth-pam             --disable-libusb             --disable-usb-redir             --disable-lzo             --disable-snappy             --disable-bzip2             --disable-guest-agent             --disable-numa             --disable-opengl             --disable-virglrenderer             --disable-spice             --disable-rdma             --disable-libiscsi             --disable-libnfs             --disable-debug-info             --disable-bochs             --disable-cloop             --disable-dmg             --disable-qcow1             --disable-vdi             --disable-vvfat             --disable-qed             --disable-parallels             --disable-curl             --disable-linux-user             --extra-cflags="-O3 -g -Wno-error=unused-command-line-argument -matomics -mbulk-memory -DNDEBUG -DG_DISABLE_ASSERT -D_GNU_SOURCE -sASYNCIFY=1 -pthread -sPROXY_TO_PTHREAD=1 -sFORCE_FILESYSTEM -sALLOW_TABLE_GROWTH -sTOTAL_MEMORY=2300MB -sWASM_BIGINT -sMALLOC=mimalloc -sEXPORT_ES6=1 -sASYNCIFY_IMPORTS=ffi_call_js"             --extra-cxxflags="-O3 -g -Wno-error=unused-command-line-argument -matomics -mbulk-memory -DNDEBUG -DG_DISABLE_ASSERT -D_GNU_SOURCE -sASYNCIFY=1 -pthread -sPROXY_TO_PTHREAD=1 -sFORCE_FILESYSTEM -sALLOW_TABLE_GROWTH -sTOTAL_MEMORY=2300MB -sWASM_BIGINT -sMALLOC=mimalloc -sEXPORT_ES6=1 -sASYNCIFY_IMPORTS=ffi_call_js"             --extra-ldflags="-sEXPORTED_RUNTIME_METHODS=getTempRet0,setTempRet0,addFunction,removeFunction,TTY,FS"

        emmake make -j$(nproc)
    '

echo ""
echo "[5/6] Build finished. Copying artifacts..."
cd "$(dirname "$0")"
mkdir -p qemu-artifacts
cp qemu-wasm-build/build-output/qemu-system-x86_64 qemu-artifacts/ 2>/dev/null || true
cp qemu-wasm-build/build-output/qemu-system-x86_64.wasm qemu-artifacts/ 2>/dev/null || true
cp qemu-wasm-build/build-output/qemu-system-x86_64.js qemu-artifacts/out.js 2>/dev/null || true

echo "[6/6] Done."
echo ""
echo "=========================================="
echo "  Artifacts copied to: qemu-artifacts/"
echo "=========================================="