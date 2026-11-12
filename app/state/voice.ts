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
const onAndroid = (): boolean => platform() === 'android' && typeof window.Capacitor?.nativePromise === 'function';

/** On Android the phone's own voice speaks: nothing to download. */
export const usesPhoneVoice = onAndroid;

export function voiceSupported(): boolean {
  return Boolean(shellVoice()) || onAndroid();
}

export async function refreshVoice(): Promise<void> {
  const voice = shellVoice();
  if (voice) {
    voiceStatus.value = await voice.status();
    return;
  }
  if (onAndroid()) {
    const result = (await window.Capacitor!.nativePromise!('Speech', 'available', { language: settings.value.language }).catch(() => null)) as { state?: string } | null;
    const state = result?.state ?? 'no';
    voiceStatus.value = { supported: state !== 'no', installed: state === 'yes', installing: false, error: state === 'missing' ? 'missing' : null };
    // The engine starts a moment after the app; ask again shortly.
    if (state === 'starting') setTimeout(() => void refreshVoice(), 1500);
  }
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
  if (onAndroid()) void window.Capacitor!.nativePromise!('Speech', 'stop').catch(() => undefined);
  audio?.pause();
  audio = null;
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = null;
  speaking.value = false;
}

let androidListener = false;

export async function speak(text: string): Promise<void> {
  if (!voiceStatus.value?.installed || !text) return;
  if (onAndroid()) {
    stopVoice();
    lastSpeech.value = text;
    speaking.value = true;
    if (!androidListener) {
      androidListener = true;
      void window.Capacitor?.Plugins?.Speech?.addListener?.('done', () => (speaking.value = false));
    }
    await window.Capacitor!.nativePromise!('Speech', 'speak', { text, language: settings.value.language, rate: settings.value.voiceRate }).catch(() => (speaking.value = false));
    return;
  }
  const voice = shellVoice();
  if (!voice) return;
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
  // The phone's voice depends on the language: check again when it changes.
  if (onAndroid()) effect(() => {
    void settings.value.language;
    void refreshVoice();
  });
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
