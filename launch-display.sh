#!/bin/bash

# Launch script for Cloudflare Analytics Display on horizontal sidecar displays
# Optimized for 1920x480 displays

export DISPLAY=:0
sleep 2  # Give X time to finish starting

# Start Chromium with Analytics URL
chromium-browser \
  --kiosk \
  --window-position=0,-480 \
  --window-size=1920,480 \
  --no-first-run \
  --disable-infobars \
  --disable-notifications \
  --disable-default-apps \
  http://localhost:3001 &

# Wait for window to appear
sleep 2

# Force fullscreen with F11 just in case kiosk didn't engage
xdotool search --onlyvisible --class chromium key F11 2>/dev/null || true