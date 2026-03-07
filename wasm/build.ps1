# Build GN Engine WASM

$ErrorActionPreference = "Stop"

# Source Emscripten environment
$EMSDK_ENV = "D:\Program\Emscripten\emsdk\emsdk_env.bat"
if (Test-Path $EMSDK_ENV) { cmd /c "$EMSDK_ENV >nul 2>&1 && set" | ForEach-Object { if ($_ -match '^([^=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process') } } }

$SRC = "$PSScriptRoot\gn_engine.cpp"
$OUT_DIR = "$PSScriptRoot\..\public\wasm"
$OUT = "$OUT_DIR\gn_engine"

if (-not (Test-Path $OUT_DIR)) { New-Item -ItemType Directory -Path $OUT_DIR -Force }

Write-Host "Building GN Engine WASM..." -ForegroundColor Cyan

emcc $SRC `
    -o "$OUT.js" `
    -s WASM=1 `
    -s EXPORTED_FUNCTIONS="['_gn_render','_gn_free','_gn_positions','_malloc','_free']" `
    -s EXPORTED_RUNTIME_METHODS="['ccall','cwrap','UTF8ToString','stringToUTF8','lengthBytesUTF8']" `
    -s ALLOW_MEMORY_GROWTH=1 `
    -s MODULARIZE=1 `
    -s EXPORT_NAME="GnEngine" `
    -s ENVIRONMENT="web" `
    -s NO_EXIT_RUNTIME=1 `
    -O2 `
    -std=c++17

if ($LASTEXITCODE -eq 0) {
    Write-Host "Build successful!" -ForegroundColor Green
    Write-Host "  $OUT.js"
    Write-Host "  $OUT.wasm"
} else {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}
