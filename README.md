<p align="center">
  <img src="logo.svg" width="160" height="160" alt="mcp-buttplug" />
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

## Install Intiface Central

Intiface Central is the server that talks to your hardware. You need it running before using mcp-buttplug.

<table>
<tr>
<td><strong>macOS</strong></td>
<td>

[Download from Mac App Store](https://apps.apple.com/us/app/intiface-central/id6444728067) (requires macOS 11.0+, Apple Silicon)

Or download directly from [intiface.com/central](https://intiface.com/central/)

</td>
</tr>
<tr>
<td><strong>Windows</strong></td>
<td>

Download from [intiface.com/central](https://intiface.com/central/) or install via [Microsoft Store](https://www.microsoft.com/store/apps/9P246MQX7TRV)

</td>
</tr>
<tr>
<td><strong>Linux</strong></td>
<td>

```bash
flatpak install flathub com.nonpolynomial.intiface_central
```

Or download AppImage from [intiface.com/central](https://intiface.com/central/)

</td>
</tr>
</table>

Once installed, open Intiface Central and click **Start Server**. It listens on `ws://127.0.0.1:12345` by default.

## Install mcp-buttplug

Requires [Bun](https://bun.sh) runtime.

```bash
git clone https://github.com/chiefautism/mcp-buttplug.git
cd mcp-buttplug
bun install
```

## Setup

Add to Claude Code — edit `~/.claude/settings.json`:

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

Restart Claude Code. The tools are available immediately.

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

750+ devices from 30+ brands. Anything in the [buttplug.io ecosystem](https://iostindex.com/?filter0ButtplugSupport=7) works.

| Brand | Devices | Connection |
|---|---|---|
| **Lovense** | Lush, Hush, Edge, Nora, Max, Osci, Domi, Calor, Diamo, Ferri, Gravity, Flexer, Vulse, Solace, Hyphy | Bluetooth LE |
| **We-Vibe** | Sync, Melt, Vector, Nova, Rave, Pivot, Verge, Chorus, Wish | Bluetooth LE |
| **Kiiroo** | Onyx+, Pearl 2/3, Keon, FeelConnect, Titan, Cliona, OhMiBod Fuse | Bluetooth LE |
| **Satisfyer** | Curvy, Love Triangle, Sexy Secret, Royal One, Double Joy, Mono Flex | Bluetooth LE (requires CSR dongle on Windows/Linux) |
| **The Handy** | The Handy | Wi-Fi / API |
| **Magic Motion** | Flamingo, Awaken, Equinox, Bobi, Nyx, Umi, Zenith | Bluetooth LE |
| **MysteryVibe** | Crescendo, Tenuto, Poco | Bluetooth LE |
| **Svakom** | Ella Neo, Connexion Series | Bluetooth LE |
| **Hismith** | Series with Bluetooth adapter | Bluetooth LE / Serial |
| **Vorze** | A10 Cyclone SA, Bach, UFO SA | Bluetooth LE / USB |
| **Lelo** | F1s, Hugo, Tiani | Bluetooth LE |
| **TCode** | OSR-2, SR-6, and DIY TCode devices | Serial / USB |
| **Xinput** | Xbox controllers, gamepads (vibration motors) | USB |
| **Buttplug** | Generic WebSocket devices, DIY hardware | WebSocket |

Full searchable database: [iostindex.com](https://iostindex.com/?filter0ButtplugSupport=7)

## How It Works

```
Claude Code ←→ MCP (stdio) ←→ mcp-buttplug ←→ WebSocket ←→ Intiface Engine ←→ Bluetooth/USB ←→ Device
```

The server maintains a persistent connection to Intiface Engine. Each MCP tool call translates to buttplug.io protocol commands sent to the device. Patterns like `pulse` and `wave` are composed from sequences of basic commands with timing.

## License

BSD-3-Clause
