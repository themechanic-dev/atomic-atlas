// The app's voice on the desktop: Piper, a small offline text-to-speech engine, with one
// Greek and one English voice, and two male English voices the user can add. Nothing is
// installed with the app; the user downloads the engine and the voices from the settings,
// into the app's own data folder.
//
// Sources: the Piper release 2023.11.14-2 on GitHub (rhasspy/piper) and the voices
// el_GR-joy-medium, en_US-lessac-medium, en_US-ryan-high and en_US-hfc_male-medium on
// HuggingFace (rhasspy/piper-voices).
//
// The voices are read from one fixed revision of rhasspy/piper-voices, and both files of
// each voice are checked against their SHA-256. The repository retrains voices on its main
// branch (en_US-ryan-medium changed in November 2026), and a retrained voice's settings can
// use phonemes of several characters, which make this Piper release stop with an error.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { app, type WebContents } from 'electron';
import { download } from './download';

const RELEASE = 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2';
/** rhasspy/piper-voices at 13 November 2026. */
const VOICES_REVISION = '6b9cfaacb4fb2e02a9621227e3c1a48bec9710c3';
const VOICES_BASE = `https://huggingface.co/rhasspy/piper-voices/resolve/${VOICES_REVISION}`;

export type VoiceLanguage = 'el' | 'en';
/** The male English voices: 'male' is Ryan, 'male2' is HFC. */
export type MaleVoice = 'male' | 'male2';
const MALE_VOICES: MaleVoice[] = ['male', 'male2'];
/** The voices: one per language, and the male English voices. */
type VoiceId = VoiceLanguage | MaleVoice;
/** What a download fetches: the engine with the Greek and English voices, or one male voice. */
export type VoicePart = 'base' | MaleVoice;

interface VoiceFiles {
  path: string;
  name: string;
  /** SHA-256 of the model (.onnx). */
  sha256: string;
  /** SHA-256 of its settings (.onnx.json). */
  configSha256: string;
}

const VOICES: Record<VoiceId, VoiceFiles> = {
  el: {
    path: 'el/el_GR/joy/medium',
    name: 'el_GR-joy-medium',
    sha256: '31b1d51dc72dd43a5429b67798e27599f8cdcfce8a80265bc6f50d932bf144bc',
    configSha256: '451a8885a0ea72e4432fffe22e65a75bbd2e65f6757273d1a5a9ed8a3419852e',
  },
  en: {
    path: 'en/en_US/lessac/medium',
    name: 'en_US-lessac-medium',
    sha256: '5efe09e69902187827af646e1a6e9d269dee769f9877d17b16b1b46eeaaf019f',
    configSha256: 'efe19c417bed055f2d69908248c6ba650fa135bc868b0e6abb3da181dab690a0',
  },
  male: {
    path: 'en/en_US/ryan/high',
    name: 'en_US-ryan-high',
    sha256: 'b3990d7606e183ec8dbfba70a4607074f162de1a0c412e0180d1ff60bb154eca',
    configSha256: 'c6d3b98f08315cb4bebf0d49d50fc4ff491b503c64b940cd3d5ca28543b48011',
  },
  male2: {
    path: 'en/en_US/hfc_male/medium',
    name: 'en_US-hfc_male-medium',
    sha256: 'd11e403a02bdf5a670c877b3dc56e0e1c8cece6fb30289586314dffdc0a78cb0',
    configSha256: 'f66847424aed0bf99ecbb5d7cfde47c0a906f426a0daf7c46f305e7d21afd886',
  },
};

/** Approximate size of the downloads, bytes. */
const ENGINE_BYTES = 26_500_000;
const PART_BYTES: Record<VoicePart, number> = { base: ENGINE_BYTES + 63_600_000 + 63_300_000, male: 120_800_000, male2: 63_200_000 };
const PART_VOICES: Record<VoicePart, VoiceId[]> = { base: ['el', 'en'], male: ['male'], male2: ['male2'] };

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
const voiceModel = (voice: VoiceId): string => join(voicesDir(), `${VOICES[voice].name}.onnx`);
/** A voice counts once both of its files are there (a download writes `.part` files until it is checked). */
const hasVoice = (voice: VoiceId): boolean => existsSync(voiceModel(voice)) && existsSync(`${voiceModel(voice)}.json`);

export interface VoiceStatus {
  supported: boolean;
  installed: boolean;
  /** The male English voices that are downloaded too. */
  maleVoices: MaleVoice[];
  installing: boolean;
  error: string | null;
}

let installing = false;
let lastError: string | null = null;

export function voiceStatus(): VoiceStatus {
  const engine = existsSync(executable());
  const installed = engine && hasVoice('el') && hasVoice('en');
  const maleVoices = installed ? MALE_VOICES.filter(hasVoice) : [];
  return { supported: engineArchive() !== null, installed, maleVoices, installing, error: lastError };
}


function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'ignore', windowsHide: true });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))));
  });
}

export async function installVoice(sender: WebContents, part: VoicePart = 'base'): Promise<VoiceStatus> {
  const archive = engineArchive();
  if (!archive || installing) return voiceStatus();
  installing = true;
  lastError = null;
  let received = 0;
  const progress = (n: number): void => {
    received += n;
    if (!sender.isDestroyed()) sender.send('voice:progress', Math.min(1, received / PART_BYTES[part]));
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
    for (const id of PART_VOICES[part]) {
      const voice = VOICES[id];
      for (const suffix of ['.onnx.json', '.onnx']) {
        const target = join(voicesDir(), `${voice.name}${suffix}`);
        if (!existsSync(target)) await download(`${VOICES_BASE}/${voice.path}/${voice.name}${suffix}`, target, progress, { sha256: suffix === '.onnx' ? voice.sha256 : voice.configSha256 });
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
 * `rate` above 1 speaks faster (Piper's length scale is its inverse). `male` picks a male
 * English voice when it is downloaded; Greek has only the one voice.
 */
export function synthesize(text: string, language: VoiceLanguage, rate: number, male: MaleVoice | null = null): Promise<Uint8Array | null> {
  stopSpeaking();
  if (!voiceStatus().installed || !text.trim()) return Promise.resolve(null);
  const voice: VoiceId = language === 'en' && male && hasVoice(male) ? male : language;
  const out = join(root(), `speech-${Date.now()}.wav`);
  const lengthScale = String(Math.min(2, Math.max(0.5, 1 / (rate > 0 ? rate : 1))));
  return new Promise((resolve) => {
    const child = spawn(executable(), ['--model', voiceModel(voice), '--output_file', out, '--length_scale', lengthScale], {
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
