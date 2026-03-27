<p align="center">
  <img src="logo.svg" width="180" height="180" alt="mcp-buttplug logo" />
</p>

<h1 align="center">mcp-buttplug</h1>

<p align="center">
  <strong>MCP server that gives Claude direct control over intimate hardware via <a href="https://buttplug.io">buttplug.io</a></strong>
</p>

<p align="center">
  <code>vibrate</code> &middot; <code>rotate</code> &middot; <code>oscillate</code> &middot; <code>linear</code> &middot; <code>pulse</code> &middot; <code>wave</code>
</p>

---

An [MCP](https://modelcontextprotocol.io) server that connects Claude Code (or any MCP client) to [buttplug.io](https://buttplug.io) — the open-source intimate hardware control library. Claude gets tools to discover, control, and orchestrate haptic devices in real-time.

The LLM decides what you feel, and when.

## Prerequisites

- [Bun](https://bun.sh) runtime
- [Intiface Central](https://intiface.com/central/) — GUI server for buttplug.io (free, runs on macOS/Windows/Linux)
- A [supported device](https://iostindex.com/?filter0ButtplugSupport=7) connected via Bluetooth/USB

## Install

```bash
git clone <this-repo>
cd mcp-buttplug
bun install
```

## Setup

**1. Start Intiface Central** and click "Start Server" (defaults to `ws://127.0.0.1:12345`)

**2. Add to Claude Code** — edit `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "buttplug": {
      "command": "bun",
      "args": ["/absolute/path/to/mcp-buttplug/index.ts"]
    }
  }
}
```

**3. Restart Claude Code.** The tools will be available immediately.

## Tools

| Tool | Description |
|---|---|
| `connect` | Connect to Intiface Engine via WebSocket |
| `scan` | Discover devices (Bluetooth, USB, Serial) |
| `devices` | List connected devices and their capabilities |
| `vibrate` | Vibrate at intensity `0.0`–`1.0`, optional auto-stop timer |
| `rotate` | Rotate at speed `0.0`–`1.0` |
| `oscillate` | Oscillate at intensity `0.0`–`1.0` |
| `linear` | Move to position over duration (stroker devices) |
| `pulse` | Patterned pulses — count, on/off timing, intensity |
| `wave` | Smooth ramp between two intensities over time |
| `stop` | Stop one or all devices |
| `battery` | Read device battery level |
| `disconnect` | Disconnect from Intiface Engine |

## Usage

Once connected, just talk to Claude. It has the tools — it'll figure it out.

```
you: connect to my device and give me a gentle pulse

claude: [calls connect] → [calls scan] → [calls pulse(intensity=0.3, count=3)]
        Connected. Found your Lovense Lush 3. Sent 3 gentle pulses.
```

```
you: slowly ramp up over 10 seconds then stop

claude: [calls wave(from=0, to=0.8, duration_ms=10000)]
        [calls stop]
```

All device parameters (intensity, speed, position) are normalized to `0.0`–`1.0`. Claude handles the mapping.

## Supported Devices

Anything supported by [buttplug.io](https://iostindex.com/?filter0ButtplugSupport=7) — Lovense, We-Vibe, Kiiroo, Satisfyer, Magic Motion, and [200+ more](https://iostindex.com/?filter0ButtplugSupport=7).

## How It Works

```
Claude Code ←→ MCP (stdio) ←→ mcp-buttplug ←→ WebSocket ←→ Intiface Engine ←→ Bluetooth/USB ←→ Device
```

The server maintains a persistent connection to Intiface Engine. Each MCP tool call translates to buttplug.io protocol commands sent to the device. Patterns like `pulse` and `wave` are composed from sequences of basic commands with timing.

## License

BSD-3-Clause
