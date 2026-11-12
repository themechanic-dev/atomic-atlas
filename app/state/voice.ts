// The voice: a short spoken summary after each simulation, on the desktop with Piper.
// Nothing is listened to; the app only speaks.

import { effect, signal } from '@preact/signals';
import { t } from '../i18n';
import { accidentSpeech, detonationSpeech } from '../lib/speech';
import { platform, type VoiceStatus } from '../lib/platform';
import { accidentRun } from './accident';
import { settings } from './settings';
import { detonation } from './simulation';
import { water } from './water';

export const voiceStatus = signal<VoiceStatus | null>(null);
/** Share of the download done, 0 to 1, while the voice is being downloaded. */
export const voiceProgress = signal<number | null>(null);
export const lastSpeech = signal<string | null>(null);
export const speaking = signal(false);

const shellVoice = () => (platform() === 'desktop' ? window.atomicAtlasShell?.voice : undefined);

export function voiceSupported(): boolean {
  return Boolean(shellVoice());
}

export async function refreshVoice(): Promise<void> {
  const voice = shellVoice();
  if (voice) voiceStatus.value = await voice.status();
}

export async function downloadVoice(): Promise<void> {
  const voice = shellVoice();
  if (!voice) return;
  voiceProgress.value = 0;
  const off = voice.onProgress((share) => (voiceProgress.value = share));
  try {
    voiceStatus.value = { ...(voiceStatus.value ?? { supported: true, installed: false, error: null }), installing: true };
    voiceStatus.value = await voice.install();
  } finally {
    off();
    voiceProgress.value = null;
  }
}

export async function removeVoice(): Promise<void> {
  const voice = shellVoice();
  if (voice) voiceStatus.value = await voice.remove();
}

let audio: HTMLAudioElement | null = null;
let audioUrl: string | null = null;
let request = 0;

export function stopVoice(): void {
  request++;
  void shellVoice()?.stop();
  audio?.pause();
  audio = null;
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = null;
  speaking.value = false;
}

export async function speak(text: string): Promise<void> {
  const voice = shellVoice();
  if (!voice || !voiceStatus.value?.installed || !text) return;
  stopVoice();
  const mine = ++request;
  lastSpeech.value = text;
  speaking.value = true;
  const bytes = await voice.speak(text, settings.value.language, settings.value.voiceRate);
  if (mine !== request || !bytes) {
    if (mine === request) speaking.value = false;
    return;
  }
  audioUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'audio/wav' }));
  audio = new Audio(audioUrl);
  audio.onended = () => {
    if (mine === request) speaking.value = false;
  };
  await audio.play().catch(() => (speaking.value = false));
}

export function sayAgain(): void {
  if (lastSpeech.value) void speak(lastSpeech.value);
}

/** Starts speaking after each simulation, when the voice is on. Call once at start-up. */
export function initVoice(): void {
  if (!voiceSupported()) return;
  void refreshVoice();
  let spokenDetonation = -1;
  let spokenAccident = -1;
  effect(() => {
    const current = detonation.value;
    const w = water.value;
    if (!current || current.id === spokenDetonation) return;
    // Wait for the depth of the water, so the waves can be said in the same breath.
    if (w && w.id === current.id && w.state === 'loading') return;
    spokenDetonation = current.id;
    if (settings.peek().voice) void speak(detonationSpeech(current.result, w && w.id === current.id ? w : null));
  });
  effect(() => {
    const run = accidentRun.value;
    if (!run || run.id === spokenAccident) return;
    spokenAccident = run.id;
    if (settings.peek().voice) void speak(accidentSpeech(t(`accident.name.${run.accident.id}`), run.result));
  });
}
