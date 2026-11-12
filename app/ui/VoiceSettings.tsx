// Settings of the voice: download it, switch it on or off, choose its speed, try it.

import { t } from '../i18n';
import { settings, updateSettings } from '../state/settings';
import { downloadVoice, removeVoice, speak, usesPhoneVoice, voiceProgress, voiceStatus, voiceSupported } from '../state/voice';
import { Button, Field, Segmented, Switch } from './controls';

const RATES = ['0.85', '1', '1.2'] as const;

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
        <p class="hint">{t('settings.voice.phone.missing')}</p>
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
          {usesPhoneVoice() ? <p class="hint">{t('settings.voice.phone')}</p> : null}
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
