#!/bin/bash
# Creates IntifaceEngine.app bundle with Bluetooth entitlements
# so intiface-engine can use BLE on macOS without Intiface Central

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENGINE_BIN="$PROJECT_DIR/engine/intiface-engine"
APP_DIR="$PROJECT_DIR/engine/IntifaceEngine.app"

if [ ! -f "$ENGINE_BIN" ]; then
  echo "Error: engine/intiface-engine not found. Run 'bun run scripts/install-engine.ts' first."
  exit 1
fi

echo "Creating IntifaceEngine.app bundle..."

mkdir -p "$APP_DIR/Contents/MacOS"

cp "$ENGINE_BIN" "$APP_DIR/Contents/MacOS/intiface-engine"

cat > "$APP_DIR/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>intiface-engine</string>
  <key>CFBundleIdentifier</key>
  <string>io.buttplug.intiface-engine</string>
  <key>CFBundleName</key>
  <string>Intiface Engine</string>
  <key>CFBundleVersion</key>
  <string>4.0.2</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSBluetoothAlwaysUsageDescription</key>
  <string>Intiface Engine needs Bluetooth to communicate with intimate hardware devices.</string>
  <key>NSBluetoothPeripheralUsageDescription</key>
  <string>Intiface Engine needs Bluetooth to communicate with intimate hardware devices.</string>
</dict>
</plist>
PLIST

echo "Created $APP_DIR"
echo "To use BLE: engine/IntifaceEngine.app/Contents/MacOS/intiface-engine --use-bluetooth-le --use-sdl-gamepad --websocket-port 12345"
