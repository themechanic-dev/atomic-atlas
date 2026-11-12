// The assistant on the desktop: a local language model run by llama.cpp's llama-server,
// listening only on this computer. Nothing is installed with the app; the user downloads
// the engine and one model from the settings, into the app's own data folder.
//
// The web UI sends the conversation and the tools it offers; this file only passes them to
// the local server and returns its answer. The tools themselves run in the web UI.

import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, unlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { app, type WebContents } from 'electron';

const LLAMA_RELEASE = 'https://github.com/ggml-org/llama.cpp/releases/download/b12308';

export type AssistantSize = 'small' | 'large';

/** The models offered, chosen by measurement (ΣΧΕΔΙΟ §8, phase 0.7). */
export const ASSISTANT_MODELS: Record<AssistantSize, { url: string; file: string; bytes: number }> = {
  small: {
    url: 'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf',
    file: 'Qwen3.5-4B-Q4_K_M.gguf',
    bytes: 2_740_937_888,
  },
  large: {
    url: 'https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-Q4_K_M.gguf',
    file: 'Qwen3.5-9B-Q4_K_M.gguf',
    bytes: 5_680_000_000,
  },
};

type EngineKind = 'vulkan' | 'cpu';

/**
 * The two builds of llama.cpp: Vulkan for graphics cards of any maker, and one for the
 * processor only, for computers without the Vulkan library (no graphics driver, virtual machines).
 */
function engineArchives(): Record<EngineKind, { url: string; file: string; bytes: number }> | null {
  if (process.platform === 'linux' && process.arch === 'x64') {
    return {
      vulkan: { url: `${LLAMA_RELEASE}/llama-b12308-bin-ubuntu-vulkan-x64.tar.gz`, file: 'llama-vulkan.tar.gz', bytes: 36_124_458 },
      cpu: { url: `${LLAMA_RELEASE}/llama-b12308-bin-ubuntu-x64.tar.gz`, file: 'llama-cpu.tar.gz', bytes: 23_306_608 },
    };
  }
  if (process.platform === 'win32' && process.arch === 'x64') {
    return {
      vulkan: { url: `${LLAMA_RELEASE}/llama-b12308-bin-win-vulkan-x64.zip`, file: 'llama-vulkan.zip', bytes: 38_045_356 },
      cpu: { url: `${LLAMA_RELEASE}/llama-b12308-bin-win-cpu-x64.zip`, file: 'llama-cpu.zip', bytes: 25_079_170 },
    };
  }
  return null;
}

const root = (): string => join(app.getPath('userData'), 'assistant');
const engineDir = (kind: EngineKind): string => join(root(), 'engine', kind);
const modelsDir = (): string => join(root(), 'models');

/** The server program inside an unpacked archive, wherever the archive put it. */
function serverPath(kind: EngineKind): string | null {
  const name = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
  const dir = engineDir(kind);
  if (!existsSync(dir)) return null;
  const direct = join(dir, name);
  if (existsSync(direct)) return direct;
  for (const entry of readdirSync(dir)) {
    const candidate = join(dir, entry, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const enginesInstalled = (): boolean => serverPath('vulkan') !== null && serverPath('cpu') !== null;

function installedModel(): { size: AssistantSize; path: string } | null {
  for (const size of ['large', 'small'] as const) {
    const path = join(modelsDir(), ASSISTANT_MODELS[size].file);
    if (existsSync(path) && statSync(path).size > 1e8) return { size, path };
  }
  return null;
}

export interface AssistantStatus {
  supported: boolean;
  installed: boolean;
  size: AssistantSize | null;
  installing: boolean;
  running: boolean;
  /** 'gpu' when the model runs on the graphics card, 'cpu' on the processor. */
  device: 'gpu' | 'cpu' | null;
  error: string | null;
}

let installing = false;
let lastError: string | null = null;
let server: ChildProcess | null = null;
let serverPort = 0;
let device: 'gpu' | 'cpu' | null = null;
let starting: Promise<boolean> | null = null;

export function assistantStatus(): AssistantStatus {
  const model = installedModel();
  return {
    supported: engineArchives() !== null,
    installed: enginesInstalled() && model !== null,
    size: model?.size ?? null,
    installing,
    running: server !== null && serverPort > 0,
    device,
    error: lastError,
  };
}

async function download(url: string, target: string, onBytes: (n: number) => void): Promise<void> {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`${response.status} ${url}`);
  const partial = `${target}.part`;
  const body = Readable.fromWeb(response.body as never);
  body.on('data', (chunk: Buffer) => onBytes(chunk.length));
  await pipeline(body, createWriteStream(partial));
  renameSync(partial, target);
}

function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'ignore', windowsHide: true });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))));
  });
}

export async function installAssistant(sender: WebContents, size: AssistantSize): Promise<AssistantStatus> {
  const archives = engineArchives();
  if (!archives || installing) return assistantStatus();
  installing = true;
  lastError = null;
  const model = ASSISTANT_MODELS[size];
  const missing = (['vulkan', 'cpu'] as const).filter((kind) => !serverPath(kind));
  const total = model.bytes + missing.reduce((sum, kind) => sum + archives[kind].bytes, 0);
  let received = 0;
  const progress = (n: number): void => {
    received += n;
    if (!sender.isDestroyed()) sender.send('assistant:progress', Math.min(1, received / total));
  };
  try {
    mkdirSync(modelsDir(), { recursive: true });
    for (const kind of missing) {
      const dir = engineDir(kind);
      mkdirSync(dir, { recursive: true });
      const file = join(dir, archives[kind].file);
      await download(archives[kind].url, file, progress);
      // Windows 10 and later have tar (bsdtar), which also reads zip files.
      await run('tar', file.endsWith('.zip') ? ['-xf', file] : ['-xzf', file], dir);
      unlinkSync(file);
    }
    // One model at a time: a new size replaces the old one.
    await stopAssistant();
    for (const other of Object.values(ASSISTANT_MODELS)) if (other.file !== model.file) rmSync(join(modelsDir(), other.file), { force: true });
    const target = join(modelsDir(), model.file);
    if (!existsSync(target)) await download(model.url, target, progress);
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    console.error('assistant download failed', error);
  } finally {
    installing = false;
  }
  return assistantStatus();
}

export async function removeAssistant(): Promise<AssistantStatus> {
  await stopAssistant();
  rmSync(root(), { recursive: true, force: true });
  return assistantStatus();
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

async function launch(kind: EngineKind): Promise<boolean> {
  const exe = serverPath(kind);
  const offload = kind === 'vulkan';
  const model = installedModel();
  if (!exe || !model) return false;
  const port = await freePort();
  const args = ['-m', model.path, '--host', '127.0.0.1', '--port', String(port), '-c', '8192', '--jinja', '--reasoning', 'off', '-sm', 'none', '-ngl', offload ? '99' : '0', '--no-webui'];
  const child = spawn(exe, args, { cwd: join(exe, '..'), stdio: 'ignore', windowsHide: true });
  let exited = false;
  child.on('exit', () => {
    exited = true;
    if (server === child) {
      server = null;
      serverPort = 0;
      device = null;
    }
  });
  const started = Date.now();
  while (!exited && Date.now() - started < 240_000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) {
        server = child;
        serverPort = port;
        device = offload ? 'gpu' : 'cpu';
        return true;
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  child.kill();
  return false;
}

/**
 * True when the Vulkan build sees a real graphics card. A software Vulkan (llvmpipe,
 * lavapipe) or no device at all means the processor build is the better choice.
 */
function hasGraphicsCard(): Promise<boolean> {
  const exe = serverPath('vulkan');
  if (!exe) return Promise.resolve(false);
  return new Promise((resolve) => {
    let text = '';
    const child = spawn(exe, ['--list-devices'], { cwd: join(exe, '..'), windowsHide: true });
    child.stdout?.on('data', (d: Buffer) => (text += d.toString()));
    child.stderr?.on('data', (d: Buffer) => (text += d.toString()));
    const timer = setTimeout(() => child.kill(), 20_000);
    child.on('error', () => resolve(false));
    child.on('exit', () => {
      clearTimeout(timer);
      const devices = text.split('\n').filter((line) => /^\s*Vulkan\d+:/.test(line));
      resolve(devices.some((line) => !/llvmpipe|lavapipe|swiftshader|basic render/i.test(line)));
    });
  });
}

/** Starts the local server if it is not running: on the graphics card if it can, else on the processor. */
export function startAssistant(): Promise<boolean> {
  if (server && serverPort) return Promise.resolve(true);
  starting ??= (async () => {
    lastError = null;
    const ok = ((await hasGraphicsCard()) && (await launch('vulkan'))) || (await launch('cpu'));
    if (!ok) lastError = 'The assistant could not be started.';
    return ok;
  })().finally(() => {
    starting = null;
  });
  return starting;
}

// The server never outlives the app.
process.on('exit', () => server?.kill());

export async function stopAssistant(): Promise<void> {
  server?.kill();
  server = null;
  serverPort = 0;
  device = null;
}

/** One turn of the conversation: messages and tools in the OpenAI form, the answer back. */
export async function chat(body: unknown): Promise<unknown> {
  if (!(await startAssistant())) return { error: lastError ?? 'not running' };
  const request = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const response = await fetch(`http://127.0.0.1:${serverPort}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: request.messages, tools: request.tools, temperature: 0.3, max_tokens: 700 }),
  });
  if (!response.ok) return { error: `${response.status}` };
  return response.json();
}
