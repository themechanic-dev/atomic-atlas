// Which of the phone's voices are male and female English voices. Android's text-to-speech
// does not say whether a voice is male or female, so the names come from a measurement: on a
// Galaxy S22 with Google's speech engine, the median pitch (F0) of each offline en-US voice
// reading the same sentence. Male: tpd 140 Hz, iom 143 Hz, iol 150 Hz. Female: iob 207,
// tpf 224, sfg 222, iog 235 Hz (iog is also what the engine's default en-US voice says).
// tpc (164 Hz) sits between the two and is left out. A phone without one of the male voices
// has no "male" choice; one without the female voices speaks with its default voice.

/** A voice of the phone, as the Speech plugin lists it. */
export interface PhoneVoice {
  name: string;
  locale: string;
  network: boolean;
  installed: boolean;
}

/** Measured male English voices of Google's engine, the clearest first. */
export const PHONE_MALE_VOICES = ['en-us-x-tpd-local', 'en-us-x-iom-local', 'en-us-x-iol-local'] as const;
/** Measured female English voices of Google's engine, its default voice first. */
export const PHONE_FEMALE_VOICES = ['en-us-x-iog-local', 'en-us-x-iob-local', 'en-us-x-tpf-local', 'en-us-x-sfg-local'] as const;

/** The first of these voices the phone has installed and can use offline, if any. */
function pickFrom(names: readonly string[], voices: readonly PhoneVoice[]): string | null {
  for (const name of names) {
    if (voices.some((v) => v.name === name && v.installed && !v.network)) return name;
  }
  return null;
}

export const pickPhoneMaleVoice = (voices: readonly PhoneVoice[]): string | null => pickFrom(PHONE_MALE_VOICES, voices);
export const pickPhoneFemaleVoice = (voices: readonly PhoneVoice[]): string | null => pickFrom(PHONE_FEMALE_VOICES, voices);

// ---------------------------------------------------------------- the browser's voices

/** A voice of the browser (the fields of SpeechSynthesisVoice that matter here). */
export interface BrowserVoice {
  name: string;
  lang: string;
  localService: boolean;
  default?: boolean;
}

// Browsers do not say whether a voice is male or female either; their names usually do.
// These are the names browsers on Windows, macOS, Android and Linux give their voices.
const FEMALE_NAMES = /female|woman|zira|hazel|susan|samantha|victoria|karen|moira|tessa|fiona|serena|allison|\bava\b|kate|catherine|jenny|aria|libby|sonia|natasha|emma|olivia|melina|maria|athina|nancy|joanna|salli|kimberly|ivy|amy|google us english|google ελληνικά/i;
const MALE_NAMES = /\bmale\b|david|mark|george|daniel|james|ryan|\bguy\b|christopher|eric|\balex\b|\bfred\b|thomas|oliver|stefanos|nestoras|arthur|matthew|joey|justin|brian|russell/i;

export type VoiceGender = 'female' | 'male';

/** Guessed from the name; null when the name does not tell. */
export function browserVoiceGender(voice: BrowserVoice): VoiceGender | null {
  if (MALE_NAMES.test(voice.name) && !/female/i.test(voice.name)) return 'male';
  if (FEMALE_NAMES.test(voice.name)) return 'female';
  return null;
}

/**
 * The browser voice to speak a language with: one whose name says it has the wanted gender,
 * else (for a female voice) one whose name does not say. Greek is spoken by a female voice
 * only (the user's decision, 13 and 14/11/2026): a browser with only male Greek voices gets
 * none. English falls back to any English voice. Offline voices first, then the default.
 */
export function pickBrowserVoice(voices: readonly BrowserVoice[], language: 'en' | 'el', gender: VoiceGender): BrowserVoice | null {
  const own = voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(language));
  if (own.length === 0) return null;
  const rank = (v: BrowserVoice): number => (v.localService ? 0 : 2) + (v.default ? 0 : 1);
  const sorted = [...own].sort((a, b) => rank(a) - rank(b) || (a.lang.toLowerCase() === (language === 'el' ? 'el-gr' : 'en-us') ? -1 : 0));
  const exact = sorted.find((v) => browserVoiceGender(v) === gender);
  if (exact) return exact;
  if (gender === 'male') return null;
  return sorted.find((v) => browserVoiceGender(v) === null) ?? (language === 'en' ? (sorted[0] ?? null) : null);
}
