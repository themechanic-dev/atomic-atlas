// The voice: a short spoken summary after each simulation, and the assistant's answers;
// on the desktop with Piper, on Android with the phone's own voice. Nothing is listened to;
// the app only speaks. English can be spoken by a female or a male voice; Greek has one.

import { effect, signal } from '@preact/signals';
import { t } from '../i18n';
import { accidentSpeech, detonationSpeech } from '../lib/speech';
import { pickPhoneFemaleVoice, pickPhoneMaleVoice, type PhoneVoice } from '../lib/voices';
import { platform, type VoiceStatus } from '../lib/platform';
import { accidentRun } from './accident';
import { settings } from './settings';
import { detonation } from './simulation';
import { water } from './water';

export const voiceStatus = signal<VoiceStatus | null>(null);
/** Share of the download done, 0 to 1, while the voice is being downloaded. */
export const voiceProgress = signal<number | null>(null);
/** The last simulation summary, for "say it again". */
export const lastSpeech = signal<string | null>(null);
export const speaking = signal(false);
/**
 * True while the assistant works on a question. A simulation it runs then is not summarised
 * aloud: the assistant's answer is spoken instead, once it is written.
 */
export const assistantAnswering = signal(false);

const shellVoice = () => (platform() === 'desktop' ? window.atomicAtlasShell?.voice : undefined);
const onAndroid = (): boolean => platform() === 'android' && typeof window.Capacitor?.nativePromise === 'function';

/** On Android the phone's own voice speaks: nothing to download. */
export const usesPhoneVoice = onAndroid;

/** The phone's male and female English voices, when it has them (Android). */
const phoneMaleVoice = signal<string | null>(null);
const phoneFemaleVoice = signal<string | null>(null);

/** The male voice English is to be spoken by, or null for the female voice (and for Greek). */
const wantsMale = (): 'male' | 'male2' | null => {
  const { language, englishVoice } = settings.value;
  return language === 'en' && englishVoice !== 'female' ? englishVoice : null;
};

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
    if (state === 'yes') {
      const list = (await window.Capacitor!.nativePromise!('Speech', 'voices', { language: 'en' }).catch(() => null)) as { voices?: PhoneVoice[] } | null;
      phoneMaleVoice.value = pickPhoneMaleVoice(list?.voices ?? []);
      phoneFemaleVoice.value = pickPhoneFemaleVoice(list?.voices ?? []);
    }
    voiceStatus.value = {
      supported: state !== 'no',
      installed: state === 'yes',
      maleVoices: phoneMaleVoice.value !== null ? ['male'] : [],
      installing: false,
      error: state === 'missing' ? 'missing' : null,
    };
    // The engine starts a moment after the app; ask again shortly.
    if (state === 'starting') setTimeout(() => void refreshVoice(), 1500);
  }
}

/** Downloads the voice ('base') or, once it is there, a male English voice. Desktop only. */
export async function downloadVoice(part: 'base' | 'male' | 'male2' = 'base'): Promise<void> {
  const voice = shellVoice();
  if (!voice) return;
  voiceProgress.value = 0;
  const off = voice.onProgress((share) => (voiceProgress.value = share));
  try {
    voiceStatus.value = { ...(voiceStatus.value ?? { supported: true, installed: false, maleVoices: [], error: null }), installing: true };
    voiceStatus.value = await voice.install(part);
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
    speaking.value = true;
    if (!androidListener) {
      androidListener = true;
      void window.Capacitor?.Plugins?.Speech?.addListener?.('done', () => (speaking.value = false));
    }
    // English names its voice, so "female" stays female whatever the phone's default is; a
    // phone has at most one male voice, which both male choices use. Greek: the default voice.
    const english = settings.value.language === 'en';
    const named = english ? (wantsMale() ? phoneMaleVoice.value : phoneFemaleVoice.value) : null;
    await window.Capacitor!.nativePromise!('Speech', 'speak', { text, language: settings.value.language, rate: settings.value.voiceRate, ...(named ? { voice: named } : {}) }).catch(
      () => (speaking.value = false),
    );
    return;
  }
  const voice = shellVoice();
  if (!voice) return;
  stopVoice();
  const mine = ++request;
  speaking.value = true;
  const bytes = await voice.speak(text, settings.value.language, settings.value.voiceRate, wantsMale());
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

/** A simulation's summary: spoken, and kept for "say it again" (the assistant's answers are not). */
function speakSummary(text: string): void {
  lastSpeech.value = text;
  void speak(text);
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
    if (assistantAnswering.peek()) {
      spokenDetonation = current.id;
      return;
    }
    // Wait for the depth of the water, so the waves can be said in the same breath.
    if (w && w.id === current.id && w.state === 'loading') return;
    spokenDetonation = current.id;
    if (settings.peek().voice) speakSummary(detonationSpeech(current.result, w && w.id === current.id ? w : null));
  });
  effect(() => {
    const run = accidentRun.value;
    if (!run || run.id === spokenAccident) return;
    spokenAccident = run.id;
    if (settings.peek().voice) speakSummary(accidentSpeech(t(`accident.name.${run.accident.id}`), run.result));
  });
}
