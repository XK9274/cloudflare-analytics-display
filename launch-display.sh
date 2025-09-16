#!/usr/bin/env bash
set -euo pipefail

# Launch script for Cloudflare Analytics Display on horizontal sidecar displays
# Default geometry: 1920x480 sidecar above primary (adjust as needed)

# If not already set, target primary X session
export DISPLAY="${DISPLAY:-:0}"

# Detect if running under systemd (INVOCATION_ID is set for systemd services)
RUN_FOREGROUND=0
if [[ "${1:-}" == "--foreground" ]]; then
  RUN_FOREGROUND=1
elif [[ -n "${INVOCATION_ID:-}" ]]; then
  RUN_FOREGROUND=1
fi

# Give X time to finish starting
sleep 2 || true

# Choose Chromium binary
CHROME_BIN=""
for bin in chromium-browser chromium google-chrome-stable google-chrome; do
  if command -v "$bin" >/dev/null 2>&1; then
    CHROME_BIN="$bin"; break
  fi
done
if [[ -z "$CHROME_BIN" ]]; then
  echo "Chromium/Chrome not found. Install 'chromium-browser' or 'chromium'." >&2
  exit 1
fi

# Window placement and flags
WIN_POS=${WIN_POS:-0,-480}
WIN_SIZE=${WIN_SIZE:-1920,480}
DASH_URL=${DASH_URL:-http://localhost:3001}

# Rendering flags: disable GPU to avoid GBM/DRM issues on some setups
COMMON_FLAGS=(
  --kiosk
  --window-position="$WIN_POS"
  --window-size="$WIN_SIZE"
  --no-first-run
  --disable-infobars
  --disable-notifications
  --disable-default-apps
  --disable-gpu
)

if [[ "$RUN_FOREGROUND" -eq 1 ]]; then
  exec "$CHROME_BIN" "${COMMON_FLAGS[@]}" "$DASH_URL"
else
  "$CHROME_BIN" "${COMMON_FLAGS[@]}" "$DASH_URL" &
  CHROME_PID=$!
  # Wait briefly, then enforce fullscreen as a fallback
  sleep 2 || true
  xdotool search --onlyvisible --class chromium key F11 2>/dev/null || true
  wait "$CHROME_PID"
fi
