#!/bin/bash
set -e

# Build GN Engine WASM
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/gn_engine.cpp"
OUT_DIR="$SCRIPT_DIR/../public/wasm"
OUT="$OUT_DIR/gn_engine"

if [ ! -d "$OUT_DIR" ]; then
    mkdir -p "$OUT_DIR"
fi

echo "Building GN Engine WASM..."

emcc "$SRC" \
    -o "$OUT.js" \
    -s WASM=1 \
    -s EXPORTED_FUNCTIONS="['_gn_render','_gn_free','_gn_positions','_malloc','_free']" \
    -s EXPORTED_RUNTIME_METHODS="['ccall','cwrap','UTF8ToString','stringToUTF8','lengthBytesUTF8']" \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s MODULARIZE=1 \
    -s EXPORT_NAME="GnEngine" \
    -s ENVIRONMENT="web" \
    -s NO_EXIT_RUNTIME=1 \
    -O2 \
    -std=c++17

echo "Build successful!"
echo "  $OUT.js"
echo "  $OUT.wasm"
