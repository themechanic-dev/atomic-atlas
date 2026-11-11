// Settings: language, units, appearance, where the map and the weather come from.

import { SOURCES } from '@physics/sources';
import { LANGUAGE_NAMES, t } from '../i18n';
import { APP_VERSION, openExternal } from '../lib/platform';
import {
  resetSettings,
  settings,
  updateSettings,
  type DistanceUnit,
  type Language,
  type MapSourceId,
  type TemperatureUnit,
  type Theme,
  type WeatherSourceId,
} from '../state/settings';
import { Button, Dialog, Field, Icon, Segmented, Switch } from './controls';
import { Logo } from './Logo';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const s = settings.value;
  return (
    <Dialog
      title={t('settings.title')}
      onClose={onClose}
      testId="settings-dialog"
      footer={
        <>
          <Button kind="ghost" onClick={resetSettings} testId="settings-reset">
            {t('settings.reset')}
          </Button>
          <Button kind="primary" onClick={onClose} testId="settings-done">
            {t('common.done')}
          </Button>
        </>
      }
    >
      <section class="settings-group">
        <h3>{t('settings.language')}</h3>
        <Field label={t('settings.language.label')}>
          <Segmented<Language>
            label={t('settings.language.label')}
            value={s.language}
            onChange={(language) => updateSettings({ language })}
            options={[
              { value: 'en', label: LANGUAGE_NAMES.en },
              { value: 'el', label: LANGUAGE_NAMES.el },
            ]}
            testId="setting-language"
          />
        </Field>
      </section>

      <section class="settings-group">
        <h3>{t('settings.units')}</h3>
        <Field label={t('settings.units.distance')}>
          <Segmented<DistanceUnit>
            label={t('settings.units.distance')}
            value={s.distance}
            onChange={(distance) => updateSettings({ distance })}
            options={[
              { value: 'km', label: t('settings.units.km') },
              { value: 'mi', label: t('settings.units.mi') },
            ]}
            testId="setting-distance"
          />
        </Field>
        <Field label={t('settings.units.temperature')}>
          <Segmented<TemperatureUnit>
            label={t('settings.units.temperature')}
            value={s.temperature}
            onChange={(temperature) => updateSettings({ temperature })}
            options={[
              { value: 'C', label: '°C' },
              { value: 'F', label: '°F' },
            ]}
            testId="setting-temperature"
          />
        </Field>
      </section>

      <section class="settings-group">
        <h3>{t('settings.appearance')}</h3>
        <Field label={t('settings.theme')}>
          <Segmented<Theme>
            label={t('settings.theme')}
            value={s.theme}
            onChange={(theme) => updateSettings({ theme })}
            options={[
              { value: 'dark', label: t('settings.theme.dark') },
              { value: 'light', label: t('settings.theme.light') },
            ]}
            testId="setting-theme"
          />
        </Field>
        <Field label={t('settings.reduceMotion')} hint={t('settings.reduceMotion.hint')}>
          <Switch checked={s.reduceMotion} onChange={(reduceMotion) => updateSettings({ reduceMotion })} label={t('settings.reduceMotion')} testId="setting-reduce-motion" />
        </Field>
      </section>

      <section class="settings-group">
        <h3>{t('settings.map')}</h3>
        <Field label={t('settings.map.source')}>
          <select
            class="select"
            value={s.mapSource}
            onChange={(event) => updateSettings({ mapSource: event.currentTarget.value as MapSourceId })}
            aria-label={t('settings.map.source')}
            data-testid="setting-map-source"
          >
            <option value="openfreemap">{t('settings.map.openfreemap')}</option>
            <option value="builtin">{t('settings.map.builtin')}</option>
            <option value="satellite">{t('settings.map.satellite')}</option>
          </select>
        </Field>
        <p class="hint">{t(`settings.map.${s.mapSource}.hint`)}</p>
        {s.mapSource === 'openfreemap' ? (
          <Field label={t('settings.map.styleUrl')} hint={t('settings.map.styleUrl.hint')}>
            <input
              class="text-input"
              type="url"
              value={s.mapStyleUrl}
              placeholder="https://…/style.json"
              onChange={(event) => updateSettings({ mapStyleUrl: event.currentTarget.value.trim() })}
              aria-label={t('settings.map.styleUrl')}
              data-testid="setting-map-style-url"
            />
          </Field>
        ) : null}
        <Field label={t('settings.map.buildings')} hint={t('settings.map.buildings.hint')}>
          <Switch checked={s.buildings3d} onChange={(buildings3d) => updateSettings({ buildings3d })} label={t('settings.map.buildings')} testId="setting-buildings" />
        </Field>
        <Field label={t('settings.map.terrain')} hint={t('settings.map.terrain.hint')}>
          <Switch checked={s.terrain3d} onChange={(terrain3d) => updateSettings({ terrain3d })} label={t('settings.map.terrain')} testId="setting-terrain" />
        </Field>
      </section>

      <section class="settings-group">
        <h3>{t('settings.weather')}</h3>
        <Field label={t('settings.weather.source')}>
          <select
            class="select"
            value={s.weatherSource}
            onChange={(event) => updateSettings({ weatherSource: event.currentTarget.value as WeatherSourceId })}
            aria-label={t('settings.weather.source')}
            data-testid="setting-weather-source"
          >
            <option value="openmeteo">{t('settings.weather.openmeteo')}</option>
            <option value="manual">{t('settings.weather.manual')}</option>
          </select>
        </Field>
        <p class="hint">{t(`settings.weather.${s.weatherSource}.hint`)}</p>
      </section>

      <section class="settings-group about" data-testid="about">
        <h3>{t('settings.about')}</h3>
        <div class="about-head">
          <Logo size={72} background />
          <div>
            <strong>Atomic Atlas</strong>
            <div class="byline">by The Mechanic</div>
            <div class="hint" data-testid="app-version">
              {t('settings.about.version', { version: APP_VERSION })}
            </div>
          </div>
        </div>
        <p>{t('settings.about.text')}</p>
        <p class="hint">{t('settings.about.limits')}</p>
        <h4>{t('how.sources')}</h4>
        <ul class="sources">
          {Object.values(SOURCES).map((source) => (
            <li key={source.id}>
              {source.citation}{' '}
              {'url' in source ? (
                <button type="button" class="link" onClick={() => openExternal(source.url)}>
                  {t('how.openSource')} <Icon name="external" size={13} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        <p class="hint">{t('settings.about.mapData')}</p>
        <button type="button" class="link" onClick={() => openExternal('https://themechanic.store')} data-testid="about-site">
          themechanic.store <Icon name="external" size={13} />
        </button>
      </section>
    </Dialog>
  );
}
