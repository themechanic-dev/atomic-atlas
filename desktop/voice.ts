// The app's voice on the desktop: Piper, a small offline text-to-speech engine, with one
// Greek and one English voice. Nothing is installed with the app; the user downloads the
// engine and the voices from the settings, into the app's own data folder.
//
// Sources: the Piper release 2023.11.14-2 on GitHub (rhasspy/piper) and the voices
// el_GR-joy-medium and en_US-lessac-medium on HuggingFace (rhasspy/piper-voices).

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { app, type WebContents } from 'electron';
import { download } from './download';

const RELEASE = 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2';
const VOICES_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main';

export type VoiceLanguage = 'el' | 'en';

const VOICES: Record<VoiceLanguage, { path: string; name: string; sha256: string }> = {
  el: { path: 'el/el_GR/joy/medium', name: 'el_GR-joy-medium', sha256: '31b1d51dc72dd43a5429b67798e27599f8cdcfce8a80265bc6f50d932bf144bc' },
  en: { path: 'en/en_US/lessac/medium', name: 'en_US-lessac-medium', sha256: '5efe09e69902187827af646e1a6e9d269dee769f9877d17b16b1b46eeaaf019f' },
};

function engineArchive(): { url: string; file: string } | null {
  if (process.platform === 'linux' && process.arch === 'x64') return { url: `${RELEASE}/piper_linux_x86_64.tar.gz`, file: 'piper.tar.gz' };
  if (process.platform === 'linux' && process.arch === 'arm64') return { url: `${RELEASE}/piper_linux_aarch64.tar.gz`, file: 'piper.tar.gz' };
  if (process.platform === 'win32' && process.arch === 'x64') return { url: `${RELEASE}/piper_windows_amd64.zip`, file: 'piper.zip' };
  return null;
}

const root = (): string => join(app.getPath('userData'), 'voice');
const engineDir = (): string => join(root(), 'engine');
const voicesDir = (): string => join(root(), 'voices');
const executable = (): string => join(engineDir(), 'piper', process.platform === 'win32' ? 'piper.exe' : 'piper');
const voiceModel = (language: VoiceLanguage): string => join(voicesDir(), `${VOICES[language].name}.onnx`);

export interface VoiceStatus {
  supported: boolean;
  installed: boolean;
  installing: boolean;
  error: string | null;
}

let installing = false;
let lastError: string | null = null;

export function voiceStatus(): VoiceStatus {
  const installed = existsSync(executable()) && existsSync(voiceModel('el')) && existsSync(voiceModel('en'));
  return { supported: engineArchive() !== null, installed, installing, error: lastError };
}


function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'ignore', windowsHide: true });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))));
  });
}

/** Approximate total of the downloads, bytes: the engine and two voices. */
const TOTAL_BYTES = 26_500_000 + 63_600_000 + 63_300_000;

export async function installVoice(sender: WebContents): Promise<VoiceStatus> {
  const archive = engineArchive();
  if (!archive || installing) return voiceStatus();
  installing = true;
  lastError = null;
  let received = 0;
  const progress = (n: number): void => {
    received += n;
    if (!sender.isDestroyed()) sender.send('voice:progress', Math.min(1, received / TOTAL_BYTES));
  };
  try {
    mkdirSync(engineDir(), { recursive: true });
    mkdirSync(voicesDir(), { recursive: true });
    if (!existsSync(executable())) {
      const file = join(engineDir(), archive.file);
      await download(archive.url, file, progress);
      if (archive.file.endsWith('.zip')) {
        // Windows 10 and later have tar (bsdtar), which also reads zip files.
        await run('tar', ['-xf', file], engineDir());
      } else {
        await run('tar', ['-xzf', file], engineDir());
      }
      unlinkSync(file);
    }
    for (const language of ['el', 'en'] as const) {
      const voice = VOICES[language];
      for (const suffix of ['.onnx.json', '.onnx']) {
        const target = join(voicesDir(), `${voice.name}${suffix}`);
        if (!existsSync(target)) await download(`${VOICES_BASE}/${voice.path}/${voice.name}${suffix}`, target, progress, suffix === '.onnx' ? { sha256: voice.sha256 } : {});
      }
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    console.error('voice download failed', error);
  } finally {
    installing = false;
  }
  return voiceStatus();
}

export function removeVoice(): VoiceStatus {
  stopSpeaking();
  rmSync(root(), { recursive: true, force: true });
  return voiceStatus();
}

let current: ReturnType<typeof spawn> | null = null;

export function stopSpeaking(): void {
  current?.kill();
  current = null;
}

/**
 * Speaks a text: Piper writes a WAV file, which is returned to the window to play.
 * `rate` above 1 speaks faster (Piper's length scale is its inverse).
 */
export function synthesize(text: string, language: VoiceLanguage, rate: number): Promise<Uint8Array | null> {
  stopSpeaking();
  if (!voiceStatus().installed || !text.trim()) return Promise.resolve(null);
  const out = join(root(), `speech-${Date.now()}.wav`);
  const lengthScale = String(Math.min(2, Math.max(0.5, 1 / (rate > 0 ? rate : 1))));
  return new Promise((resolve) => {
    const child = spawn(executable(), ['--model', voiceModel(language), '--output_file', out, '--length_scale', lengthScale], {
      cwd: join(engineDir(), 'piper'),
      stdio: ['pipe', 'ignore', 'ignore'],
      windowsHide: true,
    });
    current = child;
    child.on('error', () => resolve(null));
    child.on('exit', (code) => {
      if (current === child) current = null;
      if (code !== 0 || !existsSync(out)) return resolve(null);
      const bytes = readFileSync(out);
      unlinkSync(out);
      resolve(new Uint8Array(bytes));
    });
    child.stdin?.end(`${text.replace(/\s+/g, ' ').trim()}\n`, 'utf8');
  });
}
