// Translations. English is the reference; a key missing in another language falls back to English.

import { computed } from '@preact/signals';
import { settings, type Language } from '../state/settings';
import el from './el.json';
import en from './en.json';

type Dictionary = Record<string, string>;

const DICTIONARIES: Record<Language, Dictionary> = { en, el };

export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', el: 'Ελληνικά' };

/** BCP 47 tag for number and date formatting. */
export const locale = computed(() => (settings.value.language === 'el' ? 'el-GR' : 'en-US'));

/**
 * Translated text for a key. `{name}` placeholders are replaced from `params`.
 * Reading it inside a component subscribes the component to language changes.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const language = settings.value.language;
  let text = DICTIONARIES[language][key] ?? en[key as keyof typeof en] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

/** True when a key exists in the reference language. */
export function hasKey(key: string): boolean {
  return key in en;
}

export function dictionaryFor(language: Language): Dictionary {
  return DICTIONARIES[language];
}
