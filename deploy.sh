#!/usr/bin/env bash
set -euo pipefail

# OreoOS deployment entry point.
#
#   ./deploy --pages [--preview]
#   ./deploy --board [board options]
#   ./deploy --board --full [--port /dev/ttyACM0]
#
# tools/deploy.py remains the source of truth for version bumping, hash-cache
# handling, free-space checks, Gallery overrides, and Cloudflare configuration.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ -x "$SCRIPT_DIR/.venv/bin/python3" ]]; then
  PYTHON="$SCRIPT_DIR/.venv/bin/python3"
else
  PYTHON="${PYTHON:-python3}"
fi

TARGET=""
PREVIEW=false
FULL_BOARD=false
BOARD_PORT="/dev/ttyACM0"
FLASH_BAUD=921600
BOARD_ARGS=()

usage() {
  cat <<'EOF'
Usage:
  ./deploy --pages [--preview]
  ./deploy --board [options]
  ./deploy --full [--port <device>]

Targets:
  --pages                 Build and deploy oreo.elixpo to Cloudflare Pages
  --board                 Upload OreoOS to the connected badge

Pages options:
  --preview               Deploy a Cloudflare preview instead of production

Board options:
  --port <device>         Serial port (default: /dev/ttyACM0)
  --flash-baud <rate>     Firmware flash baud (default: 921600; auto-fallback)
  --full                  Reflash MicroPython + clean-install OreoOS (board target)
  --override <apps>       Replace comma-separated app trees, e.g. gallery,reader
  --clean                 Wipe and fully reinstall the badge filesystem
  --force                 Ignore the local hash cache and upload every OS file
  --no-bump               Do not increment the OreoOS patch version
  --free-floor <bytes>    Minimum free flash required after deployment
  --no-free-guard         Disable the post-deployment free-space guard

Examples:
  ./deploy --pages
  ./deploy --pages --preview
  ./deploy --board
  ./deploy --full
  ./deploy --full --port /dev/ttyACM1
  ./deploy --board --override gallery --no-bump
EOF
}

fail() {
  printf 'deploy.sh: %s\n\n' "$1" >&2
  usage >&2
  exit 2
}

set_target() {
  local requested="$1"
  if [[ -n "$TARGET" && "$TARGET" != "$requested" ]]; then
    fail "choose exactly one target: --pages or --board"
  fi
  TARGET="$requested"
}

while (($#)); do
  case "$1" in
    --pages)
      set_target pages
      shift
      ;;
    --board)
      set_target board
      shift
      ;;
    --preview)
      PREVIEW=true
      shift
      ;;
    --port)
      [[ $# -ge 2 ]] || fail "--port requires a serial device"
      BOARD_PORT="$2"
      BOARD_ARGS+=("$2")
      shift 2
      ;;
    --port=*)
      BOARD_PORT="${1#*=}"
      BOARD_ARGS+=("$BOARD_PORT")
      shift
      ;;
    --flash-baud)
      [[ $# -ge 2 ]] || fail "--flash-baud requires a rate"
      [[ "$2" =~ ^[0-9]+$ ]] || fail "--flash-baud must be a positive integer"
      FLASH_BAUD="$2"
      shift 2
      ;;
    --flash-baud=*)
      FLASH_BAUD="${1#*=}"
      [[ "$FLASH_BAUD" =~ ^[0-9]+$ ]] || fail "--flash-baud must be a positive integer"
      shift
      ;;
    --full|--reflash)
      set_target board
      FULL_BOARD=true
      shift
      ;;
    --override)
      [[ $# -ge 2 ]] || fail "--override requires an app name or comma-separated list"
      BOARD_ARGS+=("--override=$2")
      shift 2
      ;;
    --override=*)
      BOARD_ARGS+=("$1")
      shift
      ;;
    --free-floor)
      [[ $# -ge 2 ]] || fail "--free-floor requires a byte count"
      [[ "$2" =~ ^[0-9]+$ ]] || fail "--free-floor must be a non-negative integer"
      BOARD_ARGS+=("--free-floor=$2")
      shift 2
      ;;
    --free-floor=*)
      value="${1#*=}"
      [[ "$value" =~ ^[0-9]+$ ]] || fail "--free-floor must be a non-negative integer"
      BOARD_ARGS+=("--free-floor=$value")
      shift
      ;;
    --clean|--force|--no-bump|--no-free-guard)
      BOARD_ARGS+=("$1")
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

[[ -n "$TARGET" ]] || fail "missing target (--pages or --board)"

if [[ "$TARGET" == "pages" ]]; then
  ! $FULL_BOARD || fail "--full is only valid with --board"
  ((${#BOARD_ARGS[@]} == 0)) || fail "board options cannot be used with --pages"
  command=("$PYTHON" tools/deploy.py --website)
  if $PREVIEW; then command+=(--preview); fi
  exec "${command[@]}"
fi

$PREVIEW && fail "--preview is only valid with --pages"

# The device-native video is generated, not committed. Recreate it when a
# clean checkout lacks the artifact or the tracked source video is newer.
VIDEO_SOURCE="$SCRIPT_DIR/oreo.elixpo/public/video_assn.mp4"
VIDEO_ASSET="$SCRIPT_DIR/apps/gallery/assets/optimized/video_assn.rv565"
if [[ -f "$VIDEO_SOURCE" && (! -f "$VIDEO_ASSET" || "$VIDEO_SOURCE" -nt "$VIDEO_ASSET") ]]; then
  printf 'Preparing Gallery video (RV565 v6, 180x135 @ 24 FPS)...\n'
  "$PYTHON" tools/media_ingest.py "$VIDEO_SOURCE" \
    --output-dir apps/gallery/assets/optimized \
    --seconds 10 --fps 24 --width 180 --height 135
  printf '\n'
fi

if $FULL_BOARD; then
  # Resolve the firmware before touching the board. Refuse an ambiguous set so
  # a future second image cannot silently flash the wrong hardware variant.
  shopt -s nullglob
  firmware_images=(
    "$SCRIPT_DIR"/oreoWare/firmware/ESP32_GENERIC_S3-SPIRAM_OCT-*.bin
  )
  shopt -u nullglob
  ((${#firmware_images[@]} > 0)) || \
    fail "no ESP32-S3 octal-PSRAM firmware found in oreoWare/firmware/"
  ((${#firmware_images[@]} == 1)) || \
    fail "multiple ESP32-S3 firmware images found; keep exactly one"
  FIRMWARE="${firmware_images[0]}"

  # Preflight every tool before erase-flash. A missing mpremote discovered
  # after the firmware write would leave the badge bootable but without OS
  # files, which is needlessly confusing.
  "$PYTHON" -m esptool version >/dev/null 2>&1 || \
    fail "esptool is missing; install it in the active environment"
  "$PYTHON" -m mpremote --help >/dev/null 2>&1 || \
    fail "mpremote is missing; install it in the active environment"

  printf 'Full board recovery → %s\n' "$BOARD_PORT"
  printf 'Firmware: %s\n\n' "${FIRMWARE#$SCRIPT_DIR/}"

  if ! "$PYTHON" -m esptool --chip esp32s3 --port "$BOARD_PORT" \
      --baud "$FLASH_BAUD" erase-flash; then
    printf 'High-speed erase failed; retrying at 460800 baud...\n'
    "$PYTHON" -m esptool --chip esp32s3 --port "$BOARD_PORT" \
      --baud 460800 erase-flash
  fi
  if ! "$PYTHON" -m esptool --chip esp32s3 --port "$BOARD_PORT" \
      --baud "$FLASH_BAUD" write-flash -z 0x0 "$FIRMWARE"; then
    printf 'High-speed write failed; retrying at 460800 baud...\n'
    "$PYTHON" -m esptool --chip esp32s3 --port "$BOARD_PORT" \
      --baud 460800 write-flash -z 0x0 "$FIRMWARE"
  fi

  printf '\nWaiting for MicroPython REPL'
  repl_ready=false
  deadline=$((SECONDS + 35))
  while ((SECONDS < deadline)); do
    if "$PYTHON" -m mpremote connect "$BOARD_PORT" fs ls : \
         >/dev/null 2>&1; then
      repl_ready=true
      break
    fi
    printf '.'
    sleep 1
  done
  printf '\n'
  $repl_ready || fail \
    "MicroPython did not appear on $BOARD_PORT within 35 seconds; reset the board and rerun ./deploy --board --clean --no-bump"

  # --clean sets NOSKIP inside tools/deploy.py and clears the host hash cache,
  # guaranteeing a complete filesystem after the firmware replaced its
  # partition table. Avoid adding a second --clean if the caller supplied it.
  clean_present=false
  for arg in "${BOARD_ARGS[@]}"; do
    [[ "$arg" == "--clean" ]] && clean_present=true
  done
  $clean_present || BOARD_ARGS+=("--clean")

  # Recovery reproduces the version already present in the repository. A
  # firmware repair should not silently turn into a release/version change.
  no_bump_present=false
  for arg in "${BOARD_ARGS[@]}"; do
    [[ "$arg" == "--no-bump" ]] && no_bump_present=true
  done
  $no_bump_present || BOARD_ARGS+=("--no-bump")
fi

exec "$PYTHON" tools/deploy.py "${BOARD_ARGS[@]}"
