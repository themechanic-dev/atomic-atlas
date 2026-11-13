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
