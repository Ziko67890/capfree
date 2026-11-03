"use strict";

/**
 * `npm run electron:build`: static-export the Next app, then package it.
 *
 * Both steps run through node with resolved bin paths rather than a shell, so
 * the script behaves the same under cmd.exe, PowerShell and a POSIX shell, and
 * needs neither cross-env nor shell chaining.
 *
 * Extra arguments pass through to electron-builder, so the per-platform targets
 * in electron-builder.yml are reachable:
 *   npm run electron:build -- --win
 *   npm run electron:build -- --mac --linux
 * With no arguments it builds for the host platform only. A macOS DMG has to be
 * built on macOS.
 */

const { spawnSync } = require("node:child_process");

function run(label, bin, args, env) {
  console.log(`\n[electron:build] ${label}`);
  const result = spawnSync(process.execPath, [bin, ...args], {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("next build (static export)", require.resolve("next/dist/bin/next"), ["build"], {
  DESKTOP_BUILD: "1",
});

run(
  "electron-builder",
  require.resolve("electron-builder/cli.js"),
  process.argv.slice(2),
  {},
);
