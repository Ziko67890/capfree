"use strict";

/**
 * CapFree desktop shell.
 *
 * In development the window points at `next dev`. A packaged build serves the
 * static export through a custom scheme rather than file://, because Next emits
 * absolute asset paths (/_next/...) that a file:// document cannot resolve.
 * Reading the files with fs rather than net.fetch keeps it working inside the
 * asar archive, which Chromium's network stack cannot see into.
 */

const { app, BrowserWindow, protocol, session, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const SCHEME = "capfree";
const APP_ORIGIN = `${SCHEME}://app`;
/** Matches the port electron:dev starts next dev on. */
const DEV_SERVER = "http://localhost:3111";
/** Where `npm run electron:build` leaves the static export. */
const EXPORT_DIR = path.join(__dirname, "..", "out-desktop");
/**
 * NEXT_PUBLIC_API_URL is inlined into the bundle at build time, so this has to
 * agree with the value the export was built with or the CSP below blocks every
 * API call the editor makes.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * A packaged build always serves the export. ELECTRON_SERVE_EXPORT=1 does the
 * same from a dev checkout, which is how to exercise the real window against
 * the output of `npm run electron:build` without packaging it first.
 */
const serveExport = app.isPackaged || process.env.ELECTRON_SERVE_EXPORT === "1";
/** ELECTRON_START_URL overrides what the window opens, in either mode. */
const START_URL = process.env.ELECTRON_START_URL ?? (serveExport ? `${APP_ORIGIN}/` : DEV_SERVER);

/** Must run before the app is ready, so the scheme counts as a secure origin. */
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function apiOrigin() {
  try {
    return new URL(API_URL).origin;
  } catch {
    return "http://localhost:8000";
  }
}

/**
 * Pinned to what the editor actually loads: Google Fonts for the text presets,
 * Unsplash and Pixabay for the panel thumbnails, Pixabay for the stock clips,
 * Mixkit and the royalty-free music hosts for the audio previews, blob: for
 * imported media and the worker modules the renderer starts.
 *
 * `'unsafe-inline'` for script is unavoidable here — Next inlines its bootstrap
 * and flight payload as <script> tags, and a static export has no server to
 * mint a per-response nonce. Dev additionally needs eval and a websocket for
 * hot reload, so that stays out of the packaged policy.
 */
// The Music panel streams its previews straight from the host Openverse names,
// so these need to be playable. They are not in connect-src: the bytes for the
// timeline come through the API's /music/download proxy instead, which is what
// keeps the hosts' missing CORS headers from breaking the import.
const MUSIC_HOSTS = [
  "https://*.jamendo.com",
  "https://*.freesound.org",
  "https://*.ccmixter.org",
  "https://ccmixter.org",
  "https://upload.wikimedia.org",
];

function buildCsp({ dev }) {
  const api = apiOrigin();
  // The audio panel fetches the Mixkit previews rather than streaming them from
  // a media element, so the host has to be allowed to connect as well as play.
  const connect = [
    "'self'",
    "data:",
    "blob:",
    api,
    "https://assets.mixkit.co",
    // Pixabay is deliberately absent: stock clips come through the API's
    // /media/proxy-video, because the CDN sends no CORS header at all.
  ];
  if (dev) connect.push("ws://localhost:*", "http://localhost:*");

  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://images.unsplash.com https://cdn.pixabay.com https://pixabay.com",
    `media-src 'self' data: blob: https://assets.mixkit.co ${MUSIC_HOSTS.join(' ')}`,
    `connect-src ${connect.join(" ")}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join("; ");
}

const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
  [".ico", "image/x-icon"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"],
  [".otf", "font/otf"],
  [".wasm", "application/wasm"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
]);

/** Maps a request path onto a file in the export, the way a static host would. */
async function resolveExportPath(pathname) {
  let clean;
  try {
    clean = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  clean = clean.replace(/\/+$/, "");
  const relative = clean.replace(/^\/+/, "");
  const candidates = relative
    ? [relative, `${relative}.html`, path.join(relative, "index.html")]
    : ["index.html"];

  for (const candidate of candidates) {
    const full = path.join(EXPORT_DIR, candidate);
    // Keep a crafted path from walking out of the export directory.
    if (full !== EXPORT_DIR && !full.startsWith(EXPORT_DIR + path.sep)) continue;
    try {
      const stat = await fs.stat(full);
      if (stat.isFile()) return full;
    } catch {
      /* Try the next shape. */
    }
  }
  return null;
}

function registerAppProtocol() {
  const csp = buildCsp({ dev: false });

  protocol.handle(SCHEME, async (request) => {
    const { pathname } = new URL(request.url);
    const hit = await resolveExportPath(pathname);
    const file = hit ?? (await resolveExportPath("/404.html"));
    if (!file) {
      return new Response("Not found", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    const body = await fs.readFile(file);
    return new Response(body, {
      status: hit ? 200 : 404,
      headers: {
        "content-type": MIME.get(path.extname(file).toLowerCase()) ?? "application/octet-stream",
        "content-security-policy": csp,
      },
    });
  });
}

/** The dev server sets no CSP of its own, so stamp one on its responses. */
function applyDevCsp() {
  const csp = buildCsp({ dev: true });
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!details.url.startsWith(DEV_SERVER)) {
      callback({});
      return;
    }
    callback({
      responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [csp] },
    });
  });
}

function isWebUrl(url) {
  try {
    const { protocol: scheme } = new URL(url);
    return scheme === "http:" || scheme === "https:";
  } catch {
    return false;
  }
}

function sameOriginAsApp(url) {
  try {
    const target = new URL(url);
    const home = new URL(START_URL);
    // Compared field by field rather than through .origin: a custom scheme and
    // file:// both report a null origin, which would match each other.
    return target.protocol === home.protocol && target.host === home.host;
  } catch {
    return false;
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: "CapFree",
    backgroundColor: "#111114",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.once("ready-to-show", () => window.show());

  // Unpackaged, surface renderer warnings and errors — CSP refusals among them
  // — in the terminal, where they are otherwise invisible without devtools.
  if (!app.isPackaged) {
    window.webContents.on("console-message", (details) => {
      if (details.level !== "warning" && details.level !== "error") return;
      console.log(`[renderer:${details.level}] ${details.message}`);
    });
  }

  // The app has no business opening windows; send real links to the browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (sameOriginAsApp(url)) return;
    event.preventDefault();
    if (isWebUrl(url)) void shell.openExternal(url);
  });

  void window.loadURL(START_URL);
  return window;
}

app.whenReady().then(() => {
  if (serveExport) registerAppProtocol();
  else applyDevCsp();

  createWindow();

  // macOS keeps the process alive with no windows; reopen on dock activate.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
