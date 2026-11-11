// Electron main process: one window that shows the shared web UI.
// Everything the user sees lives in app/; this file is only "plumbing".

import { app, BrowserWindow, ipcMain, Menu, nativeTheme, protocol, screen, shell } from 'electron';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';

const APP_SCHEME = 'app';
const APP_HOST = 'atomic-atlas';
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

/** Folder with the built web UI (dist/app next to dist/desktop). */
const WEB_ROOT = resolve(__dirname, '..', 'app');
const DEV_URL = process.env.ATOMIC_ATLAS_DEV_URL || '';
const isDev = DEV_URL !== '' || !app.isPackaged;

// A separate profile folder for test runs keeps the real profile untouched.
if (process.env.ATOMIC_ATLAS_USER_DATA) {
  app.setPath('userData', resolve(process.env.ATOMIC_ATLAS_USER_DATA));
}

// The map needs WebGL 2. Chromium refuses it on graphics drivers it does not trust and,
// without a usable graphics card (virtual machines, remote desktops, old computers), no
// longer falls back to software rendering by itself. This app only draws its own interface
// and map tiles, so both are allowed: slower drawing is better than no map.
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-unsafe-swiftshader');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.pbf': 'application/x-protobuf',
  '.wasm': 'application/wasm',
  '.bin': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

/** Serves files of the web UI. Supports byte ranges, so large data files can be read in pieces. */
function serveAppFile(request: Request): Response {
  const url = new URL(request.url);
  if (url.host !== APP_HOST) return new Response('Not found', { status: 404 });

  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  if (pathname === '/' || pathname === '') pathname = '/index.html';

  const filePath = normalize(join(WEB_ROOT, pathname));
  if (filePath !== WEB_ROOT && !filePath.startsWith(WEB_ROOT + sep)) {
    return new Response('Forbidden', { status: 403 });
  }

  let size: number;
  try {
    const stat = statSync(filePath);
    if (!stat.isFile()) return new Response('Not found', { status: 404 });
    size = stat.size;
  } catch {
    return new Response('Not found', { status: 404 });
  }

  const headers = new Headers({
    'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  });

  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '');
  if (range && (range[1] !== '' || range[2] !== '')) {
    let start: number;
    let end: number;
    if (range[1] === '') {
      // suffix range: the last N bytes
      start = Math.max(0, size - Number(range[2]));
      end = size - 1;
    } else {
      start = Number(range[1]);
      end = range[2] === '' ? size - 1 : Math.min(Number(range[2]), size - 1);
    }
    if (start > end || start >= size) {
      headers.set('Content-Range', `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    headers.set('Content-Length', String(end - start + 1));
    const body = Readable.toWeb(createReadStream(filePath, { start, end })) as unknown as ReadableStream;
    return new Response(body, { status: 206, headers });
  }

  headers.set('Content-Length', String(size));
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
  const body = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream;
  return new Response(body, { status: 200, headers });
}

// ---------------------------------------------------------------------------
// Window state (size and position survive restarts)

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized: boolean;
}

const DEFAULT_STATE: WindowState = { width: 1440, height: 900, maximized: false };

function stateFile(): string {
  return join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState(): WindowState {
  try {
    const raw = JSON.parse(readFileSync(stateFile(), 'utf8')) as Partial<WindowState>;
    const state: WindowState = {
      width: clampInt(raw.width, 960, 10000, DEFAULT_STATE.width),
      height: clampInt(raw.height, 600, 10000, DEFAULT_STATE.height),
      maximized: raw.maximized === true,
    };
    if (Number.isFinite(raw.x) && Number.isFinite(raw.y)) {
      // Use the saved position only when it is still on a connected display.
      const visible = screen.getAllDisplays().some((d) => {
        const b = d.workArea;
        return raw.x! >= b.x - 50 && raw.y! >= b.y - 50 && raw.x! < b.x + b.width - 100 && raw.y! < b.y + b.height - 100;
      });
      if (visible) {
        state.x = Math.round(raw.x!);
        state.y = Math.round(raw.y!);
      }
    }
    return state;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}

function saveWindowState(win: BrowserWindow): void {
  try {
    const bounds = win.getNormalBounds();
    const state: WindowState = { ...bounds, maximized: win.isMaximized() };
    mkdirSync(app.getPath('userData'), { recursive: true });
    writeFileSync(stateFile(), JSON.stringify(state));
  } catch {
    // Not worth interrupting the user for.
  }
}

// ---------------------------------------------------------------------------

let mainWindow: BrowserWindow | null = null;

function isAppUrl(url: string): boolean {
  if (DEV_URL && url.startsWith(DEV_URL)) return true;
  return url.startsWith(APP_ORIGIN + '/');
}

function openInBrowser(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') void shell.openExternal(parsed.toString());
  } catch {
    // ignore malformed URLs
  }
}

function findIcon(): string | undefined {
  const candidates = [join(WEB_ROOT, 'icons', 'icon-256.png'), join(WEB_ROOT, 'icons', 'icon-512.png')];
  return candidates.find((p) => existsSync(p));
}

function createWindow(): void {
  const state = loadWindowState();
  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'Atomic Atlas',
    backgroundColor: '#16181b',
    autoHideMenuBar: true,
    icon: findIcon(),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });
  mainWindow = win;
  if (state.maximized) win.maximize();

  // Show the window when its first frame is ready, and in any case after a moment:
  // on a computer with broken graphics the "ready" event may never come.
  const showTimer = setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) win.show();
  }, 4000);
  win.once('ready-to-show', () => {
    clearTimeout(showTimer);
    win.show();
  });
  win.on('close', () => saveWindowState(win));
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  // Links to sources and references open in the system browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openInBrowser(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      openInBrowser(url);
    }
  });

  // The interface has no native menu (it is the same on every OS); keep the usual keys working.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const mod = input.control || input.meta;
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    } else if (mod && !input.shift && input.key.toLowerCase() === 'q') {
      app.quit();
      event.preventDefault();
    } else if (isDev && ((mod && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12')) {
      win.webContents.toggleDevTools();
      event.preventDefault();
    } else if (isDev && mod && input.key.toLowerCase() === 'r') {
      win.webContents.reloadIgnoringCache();
      event.preventDefault();
    }
  });

  void win.loadURL(DEV_URL || `${APP_ORIGIN}/index.html`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  });

  app.on('window-all-closed', () => app.quit());

  void app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    protocol.handle(APP_SCHEME, serveAppFile);

    ipcMain.handle('app:info', () => ({
      version: app.getVersion(),
      os: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      packaged: app.isPackaged,
    }));
    ipcMain.handle('app:open-external', (_event, url: unknown) => {
      if (typeof url === 'string') openInBrowser(url);
    });
    ipcMain.handle('app:set-theme', (_event, theme: unknown) => {
      // Keeps native parts (scrollbars, dialogs, title bar where supported) in step with the UI theme.
      if (theme === 'dark' || theme === 'light' || theme === 'system') nativeTheme.themeSource = theme;
    });
    ipcMain.handle('app:quit', () => app.quit());

    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}
