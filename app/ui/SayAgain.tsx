// "Say it again": repeats the last spoken summary, or stops the voice while it speaks.

import { t } from '../i18n';
import { lastSpeech, sayAgain, speaking, stopVoice, voiceStatus } from '../state/voice';

export function SayAgain() {
  if (!voiceStatus.value?.installed || !lastSpeech.value) return null;
  const on = speaking.value;
  return (
    <button
      type="button"
      class="say-again"
      onClick={() => (on ? stopVoice() : sayAgain())}
      title={t(on ? 'voice.stop' : 'voice.again')}
      aria-label={t(on ? 'voice.stop' : 'voice.again')}
      data-testid="say-again"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        {on ? <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" /> : <path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z" fill="currentColor" />}
      </svg>
      <span>{t(on ? 'voice.stop' : 'voice.again')}</span>
    </button>
  );
}
