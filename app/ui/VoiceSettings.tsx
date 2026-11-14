// Settings of the voice: download it, switch it on or off, choose its speed and, in English,
// a female or a male voice, try it. Greek has only the one voice, so the choice is not shown.

import { t } from '../i18n';
import { settings, updateSettings, type EnglishVoice } from '../state/settings';
import { browserGreekOnlyMale, downloadVoice, removeVoice, speak, usesBrowserVoice, usesPhoneVoice, voiceProgress, voiceStatus, voiceSupported } from '../state/voice';
import { Button, Field, Segmented, Switch } from './controls';

const RATES = ['0.85', '1', '1.2'] as const;
/** Approximate download of each male voice, MB (desktop). */
const MALE_VOICE_MB = { male: 121, male2: 63 } as const;

/**
 * Female or male English voice. The desktop has two male voices, each a download of its own;
 * a phone has its own male voice, or none, and then there is no choice to offer.
 */
function EnglishVoiceChoice() {
  const s = settings.value;
  const status = voiceStatus.value;
  const progress = voiceProgress.value;
  if (s.language !== 'en' || !status) return null;
  const phone = usesPhoneVoice();
  if (phone && status.maleVoices.length === 0) return null;
  const choices: EnglishVoice[] = phone ? ['female', 'male'] : ['female', 'male', 'male2'];
  // On a phone both male choices are its one male voice.
  const value: EnglishVoice = phone && s.englishVoice === 'male2' ? 'male' : s.englishVoice;
  const needsDownload = value !== 'female' && !status.maleVoices.includes(value);
  return (
    <>
      <Field label={t('settings.voice.english')}>
        <Segmented<EnglishVoice>
          label={t('settings.voice.english')}
          value={value}
          onChange={(englishVoice) => updateSettings({ englishVoice })}
          options={choices.map((voice) => ({ value: voice, label: t(phone && voice === 'male' ? 'settings.voice.english.phoneMale' : `settings.voice.english.${voice}`) }))}
          testId="setting-english-voice"
        />
      </Field>
      {needsDownload ? (
        <>
          <p class="hint">{t('settings.voice.male.hint', { size: MALE_VOICE_MB[value] })}</p>
          {progress !== null ? (
            <p class="hint" data-testid="voice-male-progress">
              {t('settings.voice.downloading', { percent: Math.round(progress * 100) })}
            </p>
          ) : (
            <Button kind="primary" onClick={() => void downloadVoice(value)} testId="voice-male-download">
              {t('settings.voice.male.download')}
            </Button>
          )}
          {status.error ? <p class="hint warn">{t('settings.voice.error')}</p> : null}
        </>
      ) : null}
    </>
  );
}

export function VoiceSettings() {
  if (!voiceSupported()) return null;
  const s = settings.value;
  const status = voiceStatus.value;
  const progress = voiceProgress.value;
  return (
    <section class="settings-group" data-testid="voice-settings">
      <h3>{t('settings.voice')}</h3>
      {!status?.supported ? (
        <p class="hint">{t('settings.voice.unsupported')}</p>
      ) : usesPhoneVoice() && !status.installed ? (
        <p class="hint">{t(usesBrowserVoice() ? 'settings.voice.browser.missing' : 'settings.voice.phone.missing')}</p>
      ) : !status.installed ? (
        <>
          <p class="hint">{t('settings.voice.download.hint')}</p>
          {progress !== null ? (
            <p class="hint" data-testid="voice-progress">
              {t('settings.voice.downloading', { percent: Math.round(progress * 100) })}
            </p>
          ) : (
            <Button kind="primary" onClick={() => void downloadVoice()} testId="voice-download">
              {t('settings.voice.download')}
            </Button>
          )}
          {status.error ? <p class="hint warn">{t('settings.voice.error')}</p> : null}
        </>
      ) : (
        <>
          {usesPhoneVoice() ? <p class="hint">{t(usesBrowserVoice() ? 'settings.voice.browser' : 'settings.voice.phone')}</p> : null}
          {browserGreekOnlyMale.value ? <p class="hint">{t('settings.voice.browser.onlyMale')}</p> : null}
          <Field label={t('settings.voice.on')} hint={t('settings.voice.on.hint')}>
            <Switch checked={s.voice} onChange={(voice) => updateSettings({ voice })} label={t('settings.voice.on')} testId="setting-voice" />
          </Field>
          <Field label={t('settings.voice.rate')}>
            <Segmented<string>
              label={t('settings.voice.rate')}
              value={String(s.voiceRate)}
              onChange={(value) => updateSettings({ voiceRate: Number(value) })}
              options={RATES.map((rate) => ({ value: rate, label: t(`settings.voice.rate.${rate}`) }))}
              testId="setting-voice-rate"
            />
          </Field>
          <EnglishVoiceChoice />
          <div class="actions">
            <Button onClick={() => void speak(t('settings.voice.sample'))} testId="voice-test">
              {t('settings.voice.test')}
            </Button>
            {usesPhoneVoice() ? null : (
              <Button kind="ghost" onClick={() => void removeVoice()} testId="voice-remove">
                {t('settings.voice.remove')}
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
