#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  ButtplugClient,
  ButtplugNodeWebsocketClientConnector,
  DeviceOutput,
} from "buttplug";

const DEFAULT_WS = "ws://127.0.0.1:12345";

let client: ButtplugClient | null = null;

async function ensureConnected(wsUrl?: string): Promise<ButtplugClient> {
  if (client?.connected) return client;
  client = new ButtplugClient("Claude Code Haptics");
  const connector = new ButtplugNodeWebsocketClientConnector(
    wsUrl ?? DEFAULT_WS
  );
  await client.connect(connector);
  return client;
}

function getDevice(index?: number) {
  if (!client?.connected) throw new Error("Not connected to Intiface");
  const devices = client.devices;
  if (devices.size === 0) throw new Error("No devices found. Run scan first.");
  if (index !== undefined) {
    const dev = devices.get(index);
    if (!dev) throw new Error(`Device ${index} not found`);
    return dev;
  }
  return devices.values().next().value!;
}

// --- MCP Server ---

const server = new McpServer({
  name: "buttplug",
  version: "1.0.0",
});

server.tool(
  "connect",
  "Connect to Intiface Engine (buttplug.io server). Must be running first.",
  { ws_url: z.string().optional().describe("WebSocket URL, default ws://127.0.0.1:12345") },
  async ({ ws_url }) => {
    try {
      await ensureConnected(ws_url);
      return { content: [{ type: "text", text: "Connected to Intiface Engine" }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Connection failed: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  "scan",
  "Scan for devices via Bluetooth/USB/etc. Scans for 5s by default.",
  { duration_ms: z.number().optional().describe("Scan duration in ms, default 5000") },
  async ({ duration_ms }) => {
    try {
      const c = await ensureConnected();
      await c.startScanning();
      await new Promise((r) => setTimeout(r, duration_ms ?? 5000));
      try { await c.stopScanning(); } catch {}

      const devs = [...c.devices.values()].map((d) => {
        const outputs: string[] = [];
        for (const [, f] of d.features) {
          for (const key of Object.keys((f as any)._feature?.Output ?? {})) {
            if (!outputs.includes(key)) outputs.push(key);
          }
        }
        return `[${d.index}] ${d.name} (${outputs.join(", ") || "no outputs"})`;
      });

      return {
        content: [{
          type: "text",
          text: devs.length
            ? `Found ${devs.length} device(s):\n${devs.join("\n")}`
            : "No devices found. Make sure your device is on and in pairing mode.",
        }],
      };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Scan failed: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  "devices",
  "List currently connected devices and their capabilities.",
  {},
  async () => {
    try {
      if (!client?.connected) return { content: [{ type: "text", text: "Not connected" }], isError: true };
      const devs = [...client.devices.values()].map((d) => {
        const caps: string[] = [];
        for (const [, f] of d.features) {
          const feat = (f as any)._feature as any;
          for (const key of Object.keys(feat?.Output ?? {})) {
            if (!caps.includes(key)) caps.push(key);
          }
          for (const key of Object.keys(feat?.Input ?? {})) {
            if (!caps.includes(`input:${key}`)) caps.push(`input:${key}`);
          }
        }
        return `[${d.index}] ${d.displayName ?? d.name} — ${caps.join(", ") || "unknown"}`;
      });
      return {
        content: [{ type: "text", text: devs.length ? devs.join("\n") : "No devices" }],
      };
    } catch (e: any) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
  }
);

server.tool(
  "vibrate",
  "Vibrate a device at given intensity (0.0-1.0). Optionally auto-stop after duration_ms.",
  {
    intensity: z.number().min(0).max(1).describe("Vibration intensity 0.0 to 1.0"),
    duration_ms: z.number().optional().describe("Auto-stop after this many ms. If omitted, vibrates until stop is called."),
    device_index: z.number().optional().describe("Device index, defaults to first device"),
  },
  async ({ intensity, duration_ms, device_index }) => {
    try {
      const dev = getDevice(device_index);
      await dev.runOutput(DeviceOutput.Vibrate.percent(intensity));
      if (duration_ms) {
        setTimeout(async () => {
          try { await dev.stop(); } catch {}
        }, duration_ms);
      }
      return {
        content: [{
          type: "text",
          text: `Vibrating ${dev.name} at ${Math.round(intensity * 100)}%${duration_ms ? ` for ${duration_ms}ms` : ""}`,
        }],
      };
    } catch (e: any) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
  }
);

server.tool(
  "rotate",
  "Rotate a device at given speed (0.0-1.0).",
  {
    speed: z.number().min(0).max(1).describe("Rotation speed 0.0 to 1.0"),
    duration_ms: z.number().optional().describe("Auto-stop after this many ms"),
    device_index: z.number().optional().describe("Device index, defaults to first device"),
  },
  async ({ speed, duration_ms, device_index }) => {
    try {
      const dev = getDevice(device_index);
      await dev.runOutput(DeviceOutput.Rotate.percent(speed));
      if (duration_ms) {
        setTimeout(async () => { try { await dev.stop(); } catch {} }, duration_ms);
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
      await dev.runOutput(DeviceOutput.Oscillate.percent(intensity));
      if (duration_ms) {
        setTimeout(async () => { try { await dev.stop(); } catch {} }, duration_ms);
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
      await dev.runOutput(DeviceOutput.PositionWithDuration.percent(position, duration_ms));
      return {
        content: [{ type: "text", text: `Moving ${dev.name} to ${Math.round(position * 100)}% over ${duration_ms}ms` }],
      };
    } catch (e: any) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
  }
);

server.tool(
  "pulse",
  "Send a pattern of pulses. Useful for notifications or rhythmic feedback.",
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
        await dev.runOutput(DeviceOutput.Vibrate.percent(intensity));
        await new Promise((r) => setTimeout(r, on));
        await dev.stop();
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
  "Ramp intensity up and/or down over time. Smooth wave pattern.",
  {
    from: z.number().min(0).max(1).describe("Starting intensity"),
    to: z.number().min(0).max(1).describe("Ending intensity"),
    duration_ms: z.number().describe("Total duration in ms"),
    steps: z.number().optional().describe("Number of intermediate steps, default 20"),
    device_index: z.number().optional().describe("Device index, defaults to first device"),
  },
  async ({ from, to, duration_ms, steps, device_index }) => {
    try {
      const dev = getDevice(device_index);
      const n = steps ?? 20;
      const interval = duration_ms / n;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const val = from + (to - from) * t;
        await dev.runOutput(DeviceOutput.Vibrate.percent(Math.max(0, Math.min(1, val))));
        await new Promise((r) => setTimeout(r, interval));
      }
      if (to === 0) await dev.stop();
      return {
        content: [{
          type: "text",
          text: `Wave on ${dev.name}: ${Math.round(from * 100)}% → ${Math.round(to * 100)}% over ${duration_ms}ms`,
        }],
      };
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
      if (!client?.connected) return { content: [{ type: "text", text: "Not connected" }], isError: true };
      if (device_index !== undefined) {
        const dev = getDevice(device_index);
        await dev.stop();
        return { content: [{ type: "text", text: `Stopped ${dev.name}` }] };
      }
      await client.stopAllDevices();
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
      const level = await dev.battery();
      return { content: [{ type: "text", text: `${dev.name} battery: ${Math.round(level * 100)}%` }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
  }
);

server.tool(
  "disconnect",
  "Disconnect from Intiface Engine.",
  {},
  async () => {
    try {
      if (client?.connected) {
        await client.stopAllDevices();
        await client.disconnect();
      }
      client = null;
      return { content: [{ type: "text", text: "Disconnected" }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
  }
);

// --- Start ---

const transport = new StdioServerTransport();
await server.connect(transport);
