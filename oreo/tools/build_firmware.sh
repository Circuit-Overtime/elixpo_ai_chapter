#!/usr/bin/env bash
set -euo pipefail

# Reproducible OreoOS MicroPython firmware builder for ESP32-S3 N16R8.
# The normal path is intentionally non-destructive. Flash erase only happens
# when the caller explicitly supplies --flash.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

IDF_VERSION="5.5.1"
MICROPY_VERSION="1.28.0"
BOARD="ESP32_GENERIC_S3"
BOARD_VARIANT="SPIRAM_OCT"
BUILD_NAME="build-oreoos-s3-v55"

ESP_ROOT="${OREO_ESP_ROOT:-${HOME}/esp}"
IDF_DIR="${OREO_IDF_DIR:-${ESP_ROOT}/esp-idf-v${IDF_VERSION}}"
MICROPY_DIR="${OREO_MICROPYTHON_DIR:-${ESP_ROOT}/micropython-v1.28}"
IDF_TOOLS_ROOT="${IDF_TOOLS_PATH:-${HOME}/.espressif}"
USER_MODULES="$REPO_ROOT/firmware/usermods/micropython.cmake"

JOBS="$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)"
PORT="/dev/ttyACM0"
FLASH_BAUD="921600"
CLEAN=false
FLASH=false
COPY_IMAGE=true

usage() {
  cat <<'EOF'
Usage: ./build-firmware [options]

Build OreoOS MicroPython v1.28.0 with the native ESP32-S3 modules.
Missing ESP-IDF/MicroPython sources and the matching IDF Python environment
are installed automatically. A normal invocation never touches the badge.

Options:
  --clean                 Full-clean the dedicated firmware build first
  --flash                 After a successful build, clean-flash firmware + OS
  --port <device>         Badge serial port (default: /dev/ttyACM0)
  --flash-baud <rate>     Initial flash baud (default: 921600)
  --jobs <count>          Parallel build jobs (default: host CPU count)
  --no-copy               Do not update oreoWare/firmware/*.bin
  -h, --help              Show this help

Environment overrides:
  OREO_ESP_ROOT           Parent directory for ESP-IDF and MicroPython
  OREO_IDF_DIR            Existing ESP-IDF v5.5.1 checkout
  OREO_MICROPYTHON_DIR    Existing MicroPython v1.28.0 checkout
  OREO_FIRMWARE_PYTHON    Standalone Python interpreter for IDF setup

Examples:
  ./build-firmware
  ./build-firmware --clean
  ./build-firmware --flash --port /dev/ttyACM0
EOF
}

fail() {
  printf 'build-firmware: %s\n' "$1" >&2
  exit 2
}

while (($#)); do
  case "$1" in
    --clean)
      CLEAN=true
      shift
      ;;
    --flash)
      FLASH=true
      shift
      ;;
    --port)
      [[ $# -ge 2 ]] || fail "--port requires a serial device"
      PORT="$2"
      shift 2
      ;;
    --port=*)
      PORT="${1#*=}"
      shift
      ;;
    --flash-baud)
      [[ $# -ge 2 ]] || fail "--flash-baud requires a rate"
      FLASH_BAUD="$2"
      shift 2
      ;;
    --flash-baud=*)
      FLASH_BAUD="${1#*=}"
      shift
      ;;
    --jobs)
      [[ $# -ge 2 ]] || fail "--jobs requires a count"
      JOBS="$2"
      shift 2
      ;;
    --jobs=*)
      JOBS="${1#*=}"
      shift
      ;;
    --no-copy)
      COPY_IMAGE=false
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown option: $1"
      ;;
  esac
done

[[ "$JOBS" =~ ^[1-9][0-9]*$ ]] || fail "--jobs must be a positive integer"
[[ "$FLASH_BAUD" =~ ^[1-9][0-9]*$ ]] || fail "--flash-baud must be a positive integer"
$FLASH && ! $COPY_IMAGE && fail "--flash cannot be combined with --no-copy"

command -v git >/dev/null || fail "git is required"
command -v make >/dev/null || fail "make is required"
command -v strings >/dev/null || fail "binutils strings is required"
[[ -f "$USER_MODULES" ]] || fail "missing $USER_MODULES"

find_base_python() {
  local candidate prefix_pair
  local -a candidates=()

  if [[ -n "${OREO_FIRMWARE_PYTHON:-}" ]]; then
    candidates+=("$OREO_FIRMWARE_PYTHON")
  fi
  candidates+=(
    "$HOME/.local/share/uv/python/cpython-3.11.15-linux-x86_64-gnu/bin/python3"
    "$HOME/.local/share/uv/python/cpython-3.11-linux-x86_64-gnu/bin/python3"
    "/usr/bin/python3.11"
    "/usr/local/bin/python3.11"
  )

  if command -v python3.11 >/dev/null 2>&1; then
    candidates+=("$(command -v python3.11)")
  fi
  if command -v python3 >/dev/null 2>&1; then
    candidates+=("$(command -v python3)")
  fi

  for candidate in "${candidates[@]}"; do
    [[ -x "$candidate" ]] || continue
    prefix_pair="$($candidate -c 'import sys; print(sys.prefix == sys.base_prefix, sys.version_info[:2] >= (3, 9), sep=":")' 2>/dev/null || true)"
    if [[ "$prefix_pair" == "True:True" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

BASE_PYTHON="$(find_base_python)" || fail \
  "no standalone Python 3.9+ found; set OREO_FIRMWARE_PYTHON"
PYTHON_TAG="$($BASE_PYTHON -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
IDF_PY_ENV="${OREO_IDF_PY_ENV:-${IDF_TOOLS_ROOT}/python_env/idf5.5_py${PYTHON_TAG}_env}"

# Never let a project virtualenv leak into ESP-IDF's environment discovery.
unset VIRTUAL_ENV
unset PYTHONHOME
export PATH="$(dirname "$BASE_PYTHON"):/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
hash -r

mkdir -p "$ESP_ROOT"

if [[ ! -d "$IDF_DIR/.git" ]]; then
  printf 'Cloning ESP-IDF v%s → %s\n' "$IDF_VERSION" "$IDF_DIR"
  git clone --branch "v$IDF_VERSION" --depth 1 --recursive \
    https://github.com/espressif/esp-idf.git "$IDF_DIR"
fi

IDF_TAG="$(git -C "$IDF_DIR" describe --tags --exact-match 2>/dev/null || true)"
[[ "$IDF_TAG" == "v$IDF_VERSION" ]] || fail \
  "$IDF_DIR is $IDF_TAG; ESP-IDF v$IDF_VERSION is required"

if [[ ! -x "$IDF_PY_ENV/bin/python" ]]; then
  printf 'Installing ESP-IDF v%s tools and Python environment...\n' "$IDF_VERSION"
  unset IDF_PYTHON_ENV_PATH
  "$IDF_DIR/install.sh" esp32s3
fi

export IDF_PYTHON_ENV_PATH="$IDF_PY_ENV"
# shellcheck disable=SC1090
source "$IDF_DIR/export.sh" >/dev/null
hash -r

IDF_REPORTED="$(idf.py --version)"
[[ "$IDF_REPORTED" == *"v$IDF_VERSION"* ]] || fail \
  "activated the wrong toolchain: $IDF_REPORTED"
printf 'Toolchain: %s\n' "$IDF_REPORTED"

if [[ ! -d "$MICROPY_DIR/.git" ]]; then
  printf 'Cloning MicroPython v%s → %s\n' "$MICROPY_VERSION" "$MICROPY_DIR"
  git clone --branch "v$MICROPY_VERSION" --depth 1 \
    https://github.com/micropython/micropython.git "$MICROPY_DIR"
fi

MICROPY_TAG="$(git -C "$MICROPY_DIR" describe --tags --exact-match 2>/dev/null || true)"
[[ "$MICROPY_TAG" == "v$MICROPY_VERSION" ]] || fail \
  "$MICROPY_DIR is $MICROPY_TAG; MicroPython v$MICROPY_VERSION is required"

printf 'Building mpy-cross...\n'
make -C "$MICROPY_DIR/mpy-cross" -j"$JOBS"

printf 'Preparing ESP32-only submodules...\n'
make -C "$MICROPY_DIR/ports/esp32" submodules \
  BOARD="$BOARD" \
  BOARD_VARIANT="$BOARD_VARIANT" \
  BUILD="$BUILD_NAME"

if $CLEAN && [[ -d "$MICROPY_DIR/ports/esp32/$BUILD_NAME" ]]; then
  printf 'Cleaning %s...\n' "$BUILD_NAME"
  make -C "$MICROPY_DIR/ports/esp32" clean \
    BOARD="$BOARD" \
    BOARD_VARIANT="$BOARD_VARIANT" \
    BUILD="$BUILD_NAME"
fi

printf 'Building OreoOS firmware...\n'
make -C "$MICROPY_DIR/ports/esp32" \
  BOARD="$BOARD" \
  BOARD_VARIANT="$BOARD_VARIANT" \
  BUILD="$BUILD_NAME" \
  USER_C_MODULES="$USER_MODULES" \
  -j"$JOBS"

BUILD_DIR="$MICROPY_DIR/ports/esp32/$BUILD_NAME"
FIRMWARE_IMAGE="$BUILD_DIR/firmware.bin"
MICROPY_IMAGE="$BUILD_DIR/micropython.bin"
[[ -s "$FIRMWARE_IMAGE" ]] || fail "firmware image was not produced"
[[ -s "$MICROPY_IMAGE" ]] || fail "MicroPython image was not produced"
strings "$MICROPY_IMAGE" | grep '_oreo_ir' >/dev/null || fail \
  "native _oreo_ir module is missing from the image"
strings "$MICROPY_IMAGE" | grep '_oreo_rv565' >/dev/null || fail \
  "native _oreo_rv565 module is missing from the image"

printf 'Verified native module: _oreo_ir\n'
printf 'Verified native module: _oreo_rv565\n'
printf 'Built: %s\n' "$FIRMWARE_IMAGE"

if $COPY_IMAGE; then
  shopt -s nullglob
  firmware_targets=(
    "$REPO_ROOT"/oreoWare/firmware/ESP32_GENERIC_S3-SPIRAM_OCT-*.bin
  )
  shopt -u nullglob
  ((${#firmware_targets[@]} == 1)) || fail \
    "expected exactly one deployable firmware image, found ${#firmware_targets[@]}"
  TARGET_IMAGE="${firmware_targets[0]}"
  TEMP_IMAGE="${TARGET_IMAGE}.new"
  trap 'rm -f "$TEMP_IMAGE"' EXIT
  install -m 0644 "$FIRMWARE_IMAGE" "$TEMP_IMAGE"
  mv "$TEMP_IMAGE" "$TARGET_IMAGE"
  trap - EXIT
  printf 'Updated: %s\n' "$TARGET_IMAGE"
  sha256sum "$FIRMWARE_IMAGE" "$TARGET_IMAGE"
fi

if $FLASH; then
  printf '\nClean-flashing firmware and OreoOS to %s...\n' "$PORT"
  exec "$REPO_ROOT/deploy" --full --port "$PORT" --flash-baud "$FLASH_BAUD"
fi

printf '\nDone. To build and flash next time:\n'
printf '  ./build-firmware --flash --port %s\n' "$PORT"
