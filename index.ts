#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { existsSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_WS = "ws://127.0.0.1:12345";
const DEFAULT_PORT = 12345;

// --- Buttplug v3 WebSocket client (no npm dependency) ---

let ws: WebSocket | null = null;
let msgId = 0;
let devices = new Map<number, { name: string; features: any }>();
let engineProcess: ReturnType<typeof Bun.spawn> | null = null;
let pendingResponses = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();

function nextId() { return ++msgId; }

function send(msg: Record<string, any>): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return reject(new Error("Not connected"));
    const id = Object.values(msg)[0].Id;
    pendingResponses.set(id, { resolve, reject });
    ws.send(JSON.stringify([msg]));
    setTimeout(() => {
      if (pendingResponses.has(id)) {
        pendingResponses.delete(id);
        reject(new Error("Timeout"));
      }
    }, 10000);
  });
}

function handleMessage(data: string) {
  const msgs = JSON.parse(data);
  for (const msg of msgs) {
    const type = Object.keys(msg)[0];
    const body = msg[type];

    if (body?.Id !== undefined && pendingResponses.has(body.Id)) {
      const p = pendingResponses.get(body.Id)!;
      pendingResponses.delete(body.Id);
      if (type === "Error") p.reject(new Error(body.ErrorMessage));
      else p.resolve(msg);
    }

    if (type === "DeviceAdded") {
      devices.set(body.DeviceIndex, { name: body.DeviceName, features: body.DeviceMessages });
    }
    if (type === "DeviceRemoved") {
      devices.delete(body.DeviceIndex);
    }
  }
}

async function connect(url: string = DEFAULT_WS): Promise<void> {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  // Try connecting directly first — if engine is already running, this works.
  // If not, start engine and retry.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(url);
        const timer = setTimeout(() => { socket.close(); reject(new Error("timeout")); }, 3000);
        socket.onopen = async () => {
          clearTimeout(timer);
          ws = socket;
          ws.onmessage = (e) => handleMessage(String(e.data));
          ws.onclose = () => { ws = null; };
          try {
            await send({ RequestServerInfo: { Id: nextId(), ClientName: "buttplug-mcp", MessageVersion: 3 } });
            resolve();
          } catch (e) { reject(e); }
        };
        socket.onerror = () => { clearTimeout(timer); reject(new Error("refused")); };
      });
      return; // Connected!
    } catch {
      if (attempt === 0) {
        await ensureEngine(); // Start engine and retry
      } else {
        throw new Error(`Cannot connect to ${url}`);
      }
    }
  }
}

async function vibrate(deviceIndex: number, speed: number) {
  const id = nextId();
  await send({ ScalarCmd: { Id: id, DeviceIndex: deviceIndex, Scalars: [
    { Index: 0, Scalar: speed, ActuatorType: "Vibrate" },
    { Index: 1, Scalar: speed, ActuatorType: "Vibrate" },
  ]}});
}

async function stopDevice(deviceIndex: number) {
  await send({ StopDeviceCmd: { Id: nextId(), DeviceIndex: deviceIndex } });
}

async function stopAll() {
  await send({ StopAllDevices: { Id: nextId() } });
}

async function startScanning() {
  await send({ StartScanning: { Id: nextId() } });
}

async function stopScanning() {
  await send({ StopScanning: { Id: nextId() } });
}

async function requestDeviceList() {
  const resp = await send({ RequestDeviceList: { Id: nextId() } });
  const list = resp?.DeviceList?.Devices ?? [];
  for (const d of list) {
    devices.set(d.DeviceIndex, { name: d.DeviceName, features: d.DeviceMessages });
  }
}

function getDevice(index?: number) {
  if (devices.size === 0) throw new Error("No devices found. Run scan first.");
  if (index !== undefined) {
    const d = devices.get(index);
    if (!d) throw new Error(`Device ${index} not found`);
    return { index, ...d };
  }
  const first = devices.entries().next().value!;
  return { index: first[0], ...first[1] };
}

// --- Engine auto-launch ---

const ENGINE_DIR = new URL("./engine", import.meta.url).pathname;
// On macOS, prefer .app bundle (has Bluetooth entitlements for BLE)
const ENGINE_BIN_PLAIN = join(ENGINE_DIR, process.platform === "win32" ? "intiface-engine.exe" : "intiface-engine");
const ENGINE_BIN_APP = join(ENGINE_DIR, "IntifaceEngine.app", "Contents", "MacOS", "intiface-engine");
const ENGINE_BIN = (process.platform === "darwin" && existsSync(ENGINE_BIN_APP)) ? ENGINE_BIN_APP : ENGINE_BIN_PLAIN;

async function ensureEngine(port: number = DEFAULT_PORT): Promise<void> {
  if (engineProcess) return; // Already started by us

  if (!existsSync(ENGINE_BIN)) {
    throw new Error("intiface-engine not found. Run 'bun run scripts/install-engine.ts' to build it.");
  }

  engineProcess = Bun.spawn([
    ENGINE_BIN,
    "--websocket-port", String(port),
    "--use-sdl-gamepad",
    "--use-bluetooth-le",
    "--use-device-websocket-server",
  ], { stdout: "ignore", stderr: "ignore" });

  // Give it a moment to start
  await new Promise((r) => setTimeout(r, 1500));
}

function killEngine() {
  if (ws) { try { ws.close(); } catch {} ws = null; }
  if (engineProcess) { engineProcess.kill(); engineProcess = null; }
}

process.on("exit", killEngine);
process.on("SIGINT", () => { killEngine(); process.exit(0); });
process.on("SIGTERM", () => { killEngine(); process.exit(0); });

// --- MCP Server ---

const server = new McpServer({ name: "buttplug", version: "2.0.0" });

server.tool(
  "connect",
  "Connect to Intiface Engine. Auto-launches our forked engine with gamepad + BLE support if not already running.",
  { ws_url: z.string().optional().describe("WebSocket URL, default ws://127.0.0.1:12345") },
  async ({ ws_url }) => {
    try {
      await connect(ws_url ?? DEFAULT_WS);
      return { content: [{ type: "text", text: "Connected to Intiface Engine" }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Connection failed: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  "scan",
  "Scan for devices — gamepads (Xbox/PS/Switch via SDL2), Bluetooth LE toys, USB devices. Scans for 5s by default.",
  { duration_ms: z.number().optional().describe("Scan duration in ms, default 5000") },
  async ({ duration_ms }) => {
    try {
      await connect();
      await startScanning();
      await new Promise((r) => setTimeout(r, duration_ms ?? 5000));
      try { await stopScanning(); } catch {}
      await requestDeviceList();

      const devs = [...devices.entries()].map(([i, d]) => `[${i}] ${d.name}`);
      return {
        content: [{
          type: "text",
          text: devs.length ? `Found ${devs.length} device(s):\n${devs.join("\n")}` : "No devices found.",
        }],
      };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Scan failed: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  "devices",
  "List currently connected devices.",
  {},
  async () => {
    try {
      if (!ws) return { content: [{ type: "text", text: "Not connected" }], isError: true };
      await requestDeviceList();
      const devs = [...devices.entries()].map(([i, d]) => `[${i}] ${d.name}`);
      return { content: [{ type: "text", text: devs.length ? devs.join("\n") : "No devices" }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
  }
);

server.tool(
  "vibrate",
  "Vibrate a device at given intensity (0.0-1.0). Works with gamepads and toys.",
  {
    intensity: z.number().min(0).max(1).describe("Vibration intensity 0.0 to 1.0"),
    duration_ms: z.number().optional().describe("Auto-stop after this many ms"),
    device_index: z.number().optional().describe("Device index, defaults to first device"),
  },
  async ({ intensity, duration_ms, device_index }) => {
    try {
      const dev = getDevice(device_index);
      await vibrate(dev.index, intensity);
      if (duration_ms) {
        setTimeout(async () => { try { await stopDevice(dev.index); } catch {} }, duration_ms);
      }
      return { content: [{ type: "text", text: `Vibrating ${dev.name} at ${Math.round(intensity * 100)}%${duration_ms ? ` for ${duration_ms}ms` : ""}` }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
  }
);

server.tool(
  "rotate",
  "Rotate a device at given speed (0.0-1.0). For rotating toys.",
  {
    speed: z.number().min(0).max(1).describe("Rotation speed 0.0 to 1.0"),
    duration_ms: z.number().optional().describe("Auto-stop after this many ms"),
    device_index: z.number().optional().describe("Device index, defaults to first device"),
  },
  async ({ speed, duration_ms, device_index }) => {
    try {
      const dev = getDevice(device_index);
      await send({ RotateCmd: { Id: nextId(), DeviceIndex: dev.index, Rotations: [{ Index: 0, Speed: speed, Clockwise: true }] } });
      if (duration_ms) {
        setTimeout(async () => { try { await stopDevice(dev.index); } catch {} }, duration_ms);
      }
      return { content: [{ type: "text", text: `Rotating ${dev.name} at ${Math.round(speed * 100)}%` }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
  }
);

server.tool(
  "oscillate",
  "Oscillate a device at given intensity (0.0-1.0).",
  {
    intensity: z.number().min(0).max(1).describe("Oscillation intensity 0.0 to 1.0"),
    duration_ms: z.number().optional().describe("Auto-stop after this many ms"),
    device_index: z.number().optional().describe("Device index, defaults to first device"),
  },
  async ({ intensity, duration_ms, device_index }) => {
    try {
      const dev = getDevice(device_index);
      await send({ ScalarCmd: { Id: nextId(), DeviceIndex: dev.index, Scalars: [{ Index: 0, Scalar: intensity, ActuatorType: "Oscillate" }] } });
      if (duration_ms) {
        setTimeout(async () => { try { await stopDevice(dev.index); } catch {} }, duration_ms);
      }
      return { content: [{ type: "text", text: `Oscillating ${dev.name} at ${Math.round(intensity * 100)}%` }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
  }
);

server.tool(
  "linear",
  "Move a linear device to a position over a duration (stroker devices).",
  {
    position: z.number().min(0).max(1).describe("Target position 0.0 to 1.0"),
    duration_ms: z.number().describe("Time to reach position in ms"),
    device_index: z.number().optional().describe("Device index, defaults to first device"),
  },
  async ({ position, duration_ms, device_index }) => {
    try {
      const dev = getDevice(device_index);
      await send({ LinearCmd: { Id: nextId(), DeviceIndex: dev.index, Vectors: [{ Index: 0, Duration: duration_ms, Position: position }] } });
      return { content: [{ type: "text", text: `Moving ${dev.name} to ${Math.round(position * 100)}% over ${duration_ms}ms` }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
  }
);

server.tool(
  "pulse",
  "Send a pattern of pulses.",
  {
    intensity: z.number().min(0).max(1).describe("Pulse intensity 0.0 to 1.0"),
    pulse_ms: z.number().optional().describe("Duration of each pulse in ms, default 200"),
    pause_ms: z.number().optional().describe("Pause between pulses in ms, default 200"),
    count: z.number().optional().describe("Number of pulses, default 3"),
    device_index: z.number().optional().describe("Device index, defaults to first device"),
  },
  async ({ intensity, pulse_ms, pause_ms, count, device_index }) => {
    try {
      const dev = getDevice(device_index);
      const n = count ?? 3;
      const on = pulse_ms ?? 200;
      const off = pause_ms ?? 200;
      for (let i = 0; i < n; i++) {
        await vibrate(dev.index, intensity);
        await new Promise((r) => setTimeout(r, on));
        await stopDevice(dev.index);
        if (i < n - 1) await new Promise((r) => setTimeout(r, off));
      }
      return { content: [{ type: "text", text: `Pulsed ${dev.name} ${n}x at ${Math.round(intensity * 100)}%` }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
  }
);

server.tool(
  "wave",
  "Ramp intensity up and/or down over time.",
  {
    from: z.number().min(0).max(1).describe("Starting intensity"),
    to: z.number().min(0).max(1).describe("Ending intensity"),
    duration_ms: z.number().describe("Total duration in ms"),
    steps: z.number().optional().describe("Number of steps, default 20"),
    device_index: z.number().optional().describe("Device index, defaults to first device"),
  },
  async ({ from, to, duration_ms, steps, device_index }) => {
    try {
      const dev = getDevice(device_index);
      const n = steps ?? 20;
      const interval = duration_ms / n;
      for (let i = 0; i <= n; i++) {
        const val = Math.max(0, Math.min(1, from + (to - from) * (i / n)));
        await vibrate(dev.index, val);
        await new Promise((r) => setTimeout(r, interval));
      }
      if (to === 0) await stopDevice(dev.index);
      return { content: [{ type: "text", text: `Wave on ${dev.name}: ${Math.round(from * 100)}% → ${Math.round(to * 100)}% over ${duration_ms}ms` }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
  }
);

server.tool(
  "stop",
  "Stop a device or all devices.",
  { device_index: z.number().optional().describe("Device index. If omitted, stops ALL devices.") },
  async ({ device_index }) => {
    try {
      if (!ws) return { content: [{ type: "text", text: "Not connected" }], isError: true };
      if (device_index !== undefined) {
        const dev = getDevice(device_index);
        await stopDevice(dev.index);
        return { content: [{ type: "text", text: `Stopped ${dev.name}` }] };
      }
      await stopAll();
      return { content: [{ type: "text", text: "Stopped all devices" }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
  }
);

server.tool(
  "battery",
  "Read battery level of a device.",
  { device_index: z.number().optional().describe("Device index, defaults to first device") },
  async ({ device_index }) => {
    try {
      const dev = getDevice(device_index);
      const resp = await send({ SensorReadCmd: { Id: nextId(), DeviceIndex: dev.index, SensorIndex: 0, SensorType: "Battery" } });
      const reading = resp?.SensorReading?.Data?.[0] ?? 0;
      return { content: [{ type: "text", text: `${dev.name} battery: ${reading}%` }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
  }
);

server.tool(
  "disconnect",
  "Disconnect from Intiface Engine and stop it if we started it.",
  {},
  async () => {
    try {
      if (ws) {
        try { await stopAll(); } catch {}
        ws.close();
        ws = null;
      }
      devices.clear();
      killEngine();
      return { content: [{ type: "text", text: "Disconnected" }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
  }
);

// --- Start ---

const transport = new StdioServerTransport();
await server.connect(transport);
