"use strict";

/**
 * `next dev` and Electron together for `npm run electron:dev`.
 *
 * Done here rather than with concurrently/wait-on so the only new dependencies
 * stay electron and electron-builder: start the dev server, wait for it to
 * answer, then open the shell. Either process exiting takes the other down.
 */

const { spawn, spawnSync } = require("node:child_process");
const http = require("node:http");

/** Keep in step with the electron:dev script and main.js's dev fallback. */
const DEFAULT_PORT = 3111;

/** `--port <n>` (or `--port=<n>`) wins, then PORT, then the default. */
function readPort(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    let raw = null;
    if (arg === "--port") raw = argv[i + 1];
    else if (arg.startsWith("--port=")) raw = arg.slice("--port=".length);
    if (raw === null) continue;
    const value = Number(raw);
    if (Number.isInteger(value) && value > 0 && value < 65536) return value;
  }
  const fromEnv = Number(process.env.PORT);
  if (Number.isInteger(fromEnv) && fromEnv > 0 && fromEnv < 65536) return fromEnv;
  return DEFAULT_PORT;
}

const PORT = readPort(process.argv.slice(2));
const DEV_SERVER = `http://localhost:${PORT}`;
const READY_TIMEOUT_MS = 120_000;
const POLL_MS = 400;

let devServer = null;
let shellProcess = null;
let closing = false;

/**
 * Kills a child and anything it started. On Windows a signal reaches only the
 * direct child, so `next dev` leaves workers behind still holding the port —
 * taskkill /T takes the whole tree.
 */
function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32" && child.pid !== undefined) {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  child.kill();
}

function shutdown(code) {
  if (closing) return;
  closing = true;
  stop(shellProcess);
  stop(devServer);
  process.exit(code);
}

/** Spawned through node rather than a shell so the same call works on Windows. */
function startDevServer() {
  const nextBin = require.resolve("next/dist/bin/next");
  return spawn(process.execPath, [nextBin, "dev", "--port", String(PORT)], {
    stdio: "inherit",
  });
}

function startShell() {
  // In a plain Node process the electron package exports its binary's path.
  const electronBin = require("electron");
  const env = { ...process.env, ELECTRON_START_URL: DEV_SERVER };
  // Inherited, this would run the shell as plain Node and leave `app` undefined.
  delete env.ELECTRON_RUN_AS_NODE;
  return spawn(electronBin, ["."], { stdio: "inherit", env });
}

function ping() {
  return new Promise((resolve) => {
    const request = http.get(DEV_SERVER, (response) => {
      response.resume();
      resolve(true);
    });
    request.on("error", () => resolve(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForDevServer() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline && !closing) {
    if (await ping()) return true;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return false;
}

async function main() {
  // Something already on the port is usually `npm run dev` in another terminal.
  // Attach to it rather than spawning a second server that dies of EADDRINUSE.
  if (await ping()) {
    console.log(`[electron:dev] ${DEV_SERVER} already serving, attaching to it`);
  } else {
    devServer = startDevServer();
    devServer.on("exit", (code) => shutdown(code ?? 0));

    console.log(`[electron:dev] waiting for ${DEV_SERVER}`);
    if (!(await waitForDevServer())) {
      console.error(`[electron:dev] ${DEV_SERVER} never came up`);
      shutdown(1);
      return;
    }
    console.log("[electron:dev] dev server up");
  }

  console.log("[electron:dev] opening the window");
  shellProcess = startShell();
  shellProcess.on("exit", (code) => shutdown(code ?? 0));
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(0));
}

main().catch((error) => {
  console.error(error);
  shutdown(1);
});
