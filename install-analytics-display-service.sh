#!/usr/bin/env bash
set -euo pipefail

# Installs and starts a user-level systemd service that launches
# the Cloudflare Analytics Display in Chromium kiosk mode.

SERVICE_NAME=analytics-display
# Resolve repository directory (script location)
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT_FILE="$UNIT_DIR/${SERVICE_NAME}.service"

echo "Installing user systemd service: $SERVICE_NAME"
echo "App directory: $APP_DIR"

# Sanity checks
if [[ ! -f "$APP_DIR/launch-display.sh" ]]; then
  echo "Error: $APP_DIR/launch-display.sh not found" >&2
  exit 1
fi

# Ensure launcher is executable
chmod +x "$APP_DIR/launch-display.sh"

# Create user systemd unit
mkdir -p "$UNIT_DIR"
cat > "$UNIT_FILE" <<UNIT
[Unit]
Description=Cloudflare Analytics Display (Chromium Kiosk)
After=graphical-session.target network-online.target
Wants=graphical-session.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
ExecStart=$APP_DIR/launch-display.sh
Restart=on-failure
Environment=DISPLAY=:0
Environment=XAUTHORITY=%h/.Xauthority

[Install]
WantedBy=default.target
UNIT

# Enable and start
systemctl --user daemon-reload
systemctl --user enable --now "${SERVICE_NAME}.service"

echo "Service installed and started: ${SERVICE_NAME}.service"
echo "Logs: journalctl --user -u ${SERVICE_NAME} -f"
echo "Run 'loginctl enable-linger $USER' if you want it to start before login."

