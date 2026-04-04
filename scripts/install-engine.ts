#!/usr/bin/env bun

// Builds intiface-engine from our buttplug fork with SDL gamepad support.
// Requires: git, cargo (Rust toolchain)
// Runs as postinstall script.

import { existsSync, mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";

const FORK_REPO = "https://github.com/chiefautism/buttplug.git";
const FORK_BRANCH = "sdl-gamepad-support";

const engineDir = join(import.meta.dir, "..", "engine");
const engineBin = join(engineDir, process.platform === "win32" ? "intiface-engine.exe" : "intiface-engine");

if (existsSync(engineBin)) {
  console.log(`intiface-engine already installed at ${engineBin}`);
  process.exit(0);
}

// Check for Rust
const rustCheck = Bun.spawnSync(["cargo", "--version"]);
if (rustCheck.exitCode !== 0) {
  console.error("Rust toolchain not found. Install from https://rustup.rs/");
  console.error("Then run this script again: bun run scripts/install-engine.ts");
  process.exit(1);
}
console.log(`Rust: ${new TextDecoder().decode(rustCheck.stdout).trim()}`);

// Check for cmake (needed for SDL2 bundled build)
const cmakeCheck = Bun.spawnSync(["cmake", "--version"]);
if (cmakeCheck.exitCode !== 0) {
  console.error("cmake not found. Install it:");
  console.error("  macOS: brew install cmake");
  console.error("  Ubuntu: sudo apt install cmake");
  console.error("  Windows: choco install cmake");
  process.exit(1);
}

const tmpDir = join(import.meta.dir, "..", ".build-tmp");

console.log(`Cloning ${FORK_REPO} (branch: ${FORK_BRANCH})...`);
const clone = Bun.spawnSync([
  "git", "clone", "--depth", "1", "--branch", FORK_BRANCH, FORK_REPO, tmpDir
], { stdout: "inherit", stderr: "inherit" });

if (clone.exitCode !== 0) {
  console.error("Git clone failed");
  process.exit(1);
}

console.log("Building intiface-engine with SDL gamepad support (this takes ~2 minutes)...");
const build = Bun.spawnSync([
  "cargo", "build", "--release", "-p", "intiface-engine"
], {
  cwd: tmpDir,
  stdout: "inherit",
  stderr: "inherit",
  env: { ...process.env, CMAKE_POLICY_VERSION_MINIMUM: "3.5" },
});

if (build.exitCode !== 0) {
  console.error("Build failed");
  process.exit(1);
}

// Copy binary
mkdirSync(engineDir, { recursive: true });
const builtBin = join(tmpDir, "target", "release", process.platform === "win32" ? "intiface-engine.exe" : "intiface-engine");

if (!existsSync(builtBin)) {
  console.error(`Built binary not found at ${builtBin}`);
  process.exit(1);
}

const { copyFileSync } = await import("node:fs");
copyFileSync(builtBin, engineBin);
chmodSync(engineBin, 0o755);

// Clean up build dir
const { rmSync } = await import("node:fs");
rmSync(tmpDir, { recursive: true, force: true });

console.log(`Installed intiface-engine → ${engineBin}`);
