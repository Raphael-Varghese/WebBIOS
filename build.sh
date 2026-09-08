#!/bin/bash
set -e

echo "========================================"
echo "  WebBIOS QEMU-WASM Build Script"
echo "  (with zlib URL fix applied)"
echo "========================================"
echo ""

QEMU_WASM_REPO="https://github.com/ktock/qemu-wasm.git"
BUILD_DIR="$(pwd)/build"
OUTPUT_DIR="$(pwd)/dist"
JOBS=6

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Enable Docker BuildKit for COPY --link support
export DOCKER_BUILDKIT=1

log_info "Checking prerequisites..."
if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed."
    exit 1
fi
if ! command -v git &> /dev/null; then
    log_error "Git is not installed."
    exit 1
fi
if ! docker info &> /dev/null; then
    log_error "Docker daemon is not running."
    exit 1
fi
log_info "Prerequisites OK."

# Clone or update qemu-wasm
if [ -d "$BUILD_DIR/qemu-wasm" ]; then
    log_info "Updating qemu-wasm repository..."
    cd "$BUILD_DIR/qemu-wasm"
    git pull
else
    log_info "Cloning qemu-wasm repository..."
    mkdir -p "$BUILD_DIR"
    git clone "$QEMU_WASM_REPO" "$BUILD_DIR/qemu-wasm"
fi

cd "$BUILD_DIR/qemu-wasm"

# FIX: Patch the broken zlib URL in the Dockerfile
log_info "Patching Dockerfile (fixing zlib download URL)..."
if grep -q "zlib.net/zlib" Dockerfile; then
    sed -i 's|https://zlib.net/zlib-$ZLIB_VERSION.tar.xz|https://github.com/madler/zlib/releases/download/v$ZLIB_VERSION/zlib-$ZLIB_VERSION.tar.xz|g' Dockerfile
    log_info "Dockerfile patched successfully."
else
    log_info "Dockerfile already patched or URL not found."
fi

# Verify the patch
if grep -q "github.com/madler/zlib" Dockerfile; then
    log_info "Verified: zlib URL now points to GitHub releases."
else
    log_warn "Could not verify zlib URL patch. Build may fail."
fi

# Build Docker image
log_info "Building Docker builder image (this may take a while)..."
docker build -t buildqemu - < Dockerfile

# Run builder container
log_info "Starting build container..."
docker run --rm -d --name build-qemu-wasm -v "$(pwd):/qemu/:ro" buildqemu

# Trap to clean up container on exit
trap 'docker stop build-qemu-wasm &> /dev/null; log_warn "Build interrupted."; exit 1' INT TERM

# Compile qemu-system-x86_64
log_info "Compiling qemu-system-x86_64 with $JOBS parallel jobs..."
log_info "This will take 10-30 minutes. Grab a coffee."
echo ""

EXTRA_CFLAGS="-O3 -g -Wno-error=unused-command-line-argument -matomics -mbulk-memory -DNDEBUG -DG_DISABLE_ASSERT -D_GNU_SOURCE -sASYNCIFY=1 -pthread -sPROXY_TO_PTHREAD=1 -sFORCE_FILESYSTEM -sALLOW_TABLE_GROWTH -sTOTAL_MEMORY=2300MB -sWASM_BIGINT -sMALLOC=mimalloc --js-library=/build/node_modules/xterm-pty/emscripten-pty.js -sEXPORT_ES6=1 -sASYNCIFY_IMPORTS=ffi_call_js"

docker exec -it build-qemu-wasm emconfigure /qemu/configure \
  --static --target-list=x86_64-softmmu --cpu=wasm32 --cross-prefix= \
  --without-default-features --enable-system --with-coroutine=fiber --enable-virtfs \
  --extra-cflags="$EXTRA_CFLAGS" \
  --extra-cxxflags="$EXTRA_CFLAGS" \
  --extra-ldflags="-sEXPORTED_RUNTIME_METHODS=getTempRet0,setTempRet0,addFunction,removeFunction,TTY,FS" \
  && docker exec -it build-qemu-wasm emmake make -j$JOBS qemu-system-x86_64

if [ $? -ne 0 ]; then
    log_error "QEMU compilation failed."
    docker stop build-qemu-wasm &> /dev/null
    exit 1
fi

log_info "QEMU compilation successful!"

# Package firmware files
log_info "Packaging firmware files..."
mkdir -p /tmp/pack/
cp ./pc-bios/{bios-256k.bin,vgabios-stdvga.bin,kvmvapic.bin,linuxboot_dma.bin} /tmp/pack/ 2>/dev/null || true
docker cp /tmp/pack build-qemu-wasm:/
docker exec -it build-qemu-wasm /bin/sh -c "/emsdk/upstream/emscripten/tools/file_packager.py qemu-system-x86_64.data --preload /pack > load.js"

# Prepare output directory
log_info "Preparing output directory: $OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Copy built files
docker cp build-qemu-wasm:/build/qemu-system-x86_64 "$OUTPUT_DIR/out.js"

for f in qemu-system-x86_64.wasm qemu-system-x86_64.worker.js qemu-system-x86_64.data load.js; do
    if docker cp build-qemu-wasm:/build/${f} "$OUTPUT_DIR/" 2>/dev/null; then
        log_info "Copied ${f}"
    else
        log_warn "Could not copy ${f}"
    fi
done

# Clean up
docker stop build-qemu-wasm &> /dev/null
log_info "Build container stopped."

# Report
echo ""
echo "========================================"
echo "  Build Complete!"
echo "========================================"
echo ""
echo "Output files are in: $OUTPUT_DIR"
echo ""
ls -lh "$OUTPUT_DIR/"
echo ""
echo "Next steps:"
echo "  1. Copy WebBIOS.html and server.py into $OUTPUT_DIR"
echo "  2. cd $OUTPUT_DIR"
echo "  3. python3 server.py"
echo "  4. Open http://localhost:8080/WebBIOS.html"
echo ""
