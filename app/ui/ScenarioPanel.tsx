// The form where a detonation is set up: place, weapon, height of burst, wind.

import { useState } from 'preact/hooks';
import { falloutFreeHeightM } from '@physics/fireball';
import { resolveBurstHeightM } from '@physics/detonation';
import { PRESETS, weaponById } from '../data/catalog';
import { t } from '../i18n';
import { formatAngle, formatDistance, formatHeight, formatLatLon, formatSpeed, formatTemperature, formatYield } from '../lib/format';
import { mapHandle } from '../map/MapView';
import { settings } from '../state/settings';
import { waterDepthGiven } from '../state/water';
import {
  buildScenario,
  clearDetonation,
  detonation,
  form,
  groundZero,
  runDetonation,
  setManualYield,
  updateForm,
  weather,
  weatherState,
} from '../state/simulation';
import { Button, Field, Icon, NumberInput, Segmented } from './controls';

// The yield slider is logarithmic: 10 tons to 100 megatons.
const LOG_MIN = -2;
const LOG_MAX = 5;
const SLIDER_STEPS = 700;

const sliderFromYield = (kt: number): number => Math.round(((Math.log10(kt) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * SLIDER_STEPS);
const yieldFromSlider = (position: number): number => {
  const value = Math.pow(10, LOG_MIN + (position / SLIDER_STEPS) * (LOG_MAX - LOG_MIN));
  // Round to two significant figures so the number reads cleanly.
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)) - 1);
  return Math.round(value / magnitude) * magnitude;
};

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

export function ScenarioPanel({ onOpenCatalog }: { onOpenCatalog: () => void }) {
  const f = form.value;
  const at = groundZero.value;
  const s = settings.value;
  const [advanced, setAdvanced] = useState(false);
  const weapon = weaponById(f.weaponId);
  const mi = s.distance === 'mi';

  const scenario = buildScenario();
  const usedHeight = resolveBurstHeightM(scenario);
  const freeHeight = falloutFreeHeightM(f.yieldKt);
  const snapshot = weather.value;

  const applyPreset = (id: string): void => {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    updateForm({
      yieldKt: preset.yieldKt,
      burstMode: preset.burstMode,
      heightM: preset.heightM,
      fissionFraction: preset.fissionFraction,
      weaponId: preset.weaponId,
      fissionAuto: true,
    });
    groundZero.value = { lat: preset.lat, lng: preset.lng };
    waterDepthGiven.value = preset.waterDepthM ? { at: groundZero.value, depthM: preset.waterDepthM } : null;
    mapHandle.map?.flyTo({ center: [preset.lng, preset.lat], zoom: 11, duration: s.reduceMotion ? 0 : 2200 });
  };

  // Speeds are edited in the user's unit and stored in m/s.
  const speedUnit = mi ? 'mph' : 'km/h';
  const speedFactor = mi ? 0.44704 : 1 / 3.6;
  const heightUnit = mi ? 'ft' : 'm';
  const heightFactor = mi ? 0.3048 : 1;
  const visibilityUnit = mi ? 'mi' : 'km';
  const visibilityFactor = mi ? 1609.344 : 1000;

  return (
    <section class="panel-section" data-testid="scenario-panel">
      <h2 class="panel-title">{t('scenario.title')}</h2>

      <div class="group">
        <h3>
          <Icon name="target" size={16} /> {t('scenario.location')}
        </h3>
        <p class="location" data-testid="ground-zero">
          {at ? formatLatLon(at.lat, at.lng) : t('scenario.location.none')}
        </p>
        <Field label={t('scenario.preset')}>
          <select
            class="select"
            value=""
            onChange={(event) => {
              applyPreset(event.currentTarget.value);
              event.currentTarget.value = '';
            }}
            aria-label={t('scenario.preset')}
            data-testid="preset-select"
          >
            <option value="">{t('scenario.preset.choose')}</option>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {t(`preset.${p.id}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div class="group">
        <h3>{t('scenario.weapon')}</h3>
        <div class="weapon-row">
          <span class="weapon-name" data-testid="weapon-name">
            {weapon ? weapon.name : t('scenario.weapon.custom')}
          </span>
          <Button onClick={onOpenCatalog} testId="open-catalog">
            <Icon name="list" size={16} /> {t('scenario.weapon.catalog')}
          </Button>
        </div>
        <Field label={t('quantity.yield')}>
          <strong class="yield-value" data-testid="yield-value">
            {formatYield(f.yieldKt)}
          </strong>
        </Field>
        <input
          class="slider"
          type="range"
          min={0}
          max={SLIDER_STEPS}
          step={1}
          value={sliderFromYield(f.yieldKt)}
          onInput={(event) => setManualYield(yieldFromSlider(Number(event.currentTarget.value)))}
          aria-label={t('quantity.yield')}
          data-testid="yield-slider"
        />
        <div class="slider-scale" aria-hidden="true">
          <span>10 t</span>
          <span>1 kt</span>
          <span>100 kt</span>
          <span>10 Mt</span>
          <span>100 Mt</span>
        </div>
        <Field label={t('scenario.yield.exact')}>
          <NumberInput
            value={f.yieldKt}
            min={0.01}
            max={100000}
            onChange={(value) => setManualYield(value)}
            label={t('scenario.yield.exact')}
            suffix="kt"
            testId="yield-input"
          />
        </Field>
      </div>

      <div class="group">
        <h3>{t('scenario.burst')}</h3>
        <Segmented
          label={t('scenario.burst')}
          value={f.burstMode}
          onChange={(burstMode) => updateForm({ burstMode })}
          options={[
            { value: 'airburst', label: t('scenario.burst.airburst') },
            { value: 'surface', label: t('scenario.burst.surface') },
            { value: 'custom', label: t('scenario.burst.custom') },
          ]}
          testId="burst-mode"
        />
        {f.burstMode === 'custom' ? (
          <Field label={t('quantity.burstHeight')}>
            <NumberInput
              value={Math.round((f.heightM / heightFactor) * 10) / 10}
              min={0}
              max={mi ? 330000 : 100000}
              onChange={(value) => updateForm({ heightM: value * heightFactor })}
              label={t('quantity.burstHeight')}
              suffix={heightUnit}
              testId="height-input"
            />
          </Field>
        ) : null}
        <p class="hint" data-testid="burst-hint">
          {f.burstMode === 'airburst'
            ? t('scenario.burst.airburst.hint', { height: formatHeight(usedHeight) })
            : f.burstMode === 'surface'
              ? t('scenario.burst.surface.hint')
              : usedHeight >= freeHeight
                ? t('scenario.burst.custom.noFallout', { height: formatHeight(freeHeight) })
                : t('scenario.burst.custom.fallout', { height: formatHeight(freeHeight) })}
        </p>
      </div>

      <div class="group">
        <h3>
          <Icon name="wind" size={16} /> {t('scenario.wind')}
        </h3>
        <Segmented
          label={t('scenario.wind')}
          value={s.weatherSource === 'manual' ? 'manual' : f.windMode}
          onChange={(windMode) => updateForm({ windMode })}
          options={[
            { value: 'live', label: t('scenario.wind.live') },
            { value: 'manual', label: t('scenario.wind.manual') },
          ]}
          testId="wind-mode"
        />
        {f.windMode === 'manual' || s.weatherSource === 'manual' ? (
          <>
            <Field label={t('scenario.wind.speed')}>
              <NumberInput
                value={Math.round((f.manualWindSpeedMs / speedFactor) * 10) / 10}
                min={0}
                max={mi ? 250 : 400}
                onChange={(value) => updateForm({ manualWindSpeedMs: value * speedFactor })}
                label={t('scenario.wind.speed')}
                suffix={speedUnit}
                testId="wind-speed"
              />
            </Field>
            <Field label={t('scenario.wind.from')}>
              <span class="compass">
                <select
                  class="select"
                  value={String((Math.round(f.manualWindFromDeg / 45) % 8) * 45)}
                  onChange={(event) => updateForm({ manualWindFromDeg: Number(event.currentTarget.value) })}
                  aria-label={t('scenario.wind.from')}
                  data-testid="wind-from-select"
                >
                  {COMPASS.map((name, i) => (
                    <option key={name} value={String(i * 45)}>
                      {t(`compass.${name}`)}
                    </option>
                  ))}
                </select>
                <NumberInput
                  value={Math.round(f.manualWindFromDeg)}
                  min={0}
                  max={359}
                  step={1}
                  onChange={(value) => updateForm({ manualWindFromDeg: value })}
                  label={t('scenario.wind.fromDegrees')}
                  suffix="°"
                  width={64}
                  testId="wind-from"
                />
              </span>
            </Field>
            {s.weatherSource === 'manual' ? <p class="hint">{t('scenario.wind.sourceOff')}</p> : null}
          </>
        ) : (
          <div class="live-wind" data-testid="live-wind">
            {weatherState.value === 'error' ? <p class="hint warn">{t('scenario.wind.live.error')}</p> : null}
            {snapshot ? (
              <>
                <table class="mini-table">
                  <thead>
                    <tr>
                      <th>{t('scenario.wind.height')}</th>
                      <th>{t('scenario.wind.speed')}</th>
                      <th>{t('scenario.wind.from')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.levels.map((level) => (
                      <tr key={level.heightM}>
                        <td>{formatDistance(level.heightM, 2)}</td>
                        <td>{formatSpeed(level.speedMs)}</td>
                        <td>{formatAngle(level.fromDeg)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p class="hint">
                  {t('scenario.wind.live.info', { temperature: formatTemperature(snapshot.temperatureK), time: snapshot.time.replace('T', ' ') })}
                </p>
              </>
            ) : (
              <p class="hint">{t('scenario.wind.live.hint')}</p>
            )}
          </div>
        )}
      </div>

      <div class="group">
        <button type="button" class="disclosure" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)} data-testid="advanced-toggle">
          <span class={`chevron${advanced ? ' is-open' : ''}`}>
            <Icon name="chevron" size={16} />
          </span>
          {t('scenario.advanced')}
        </button>
        {advanced ? (
          <div class="advanced" data-testid="advanced">
            <Field label={t('quantity.fissionFraction')} hint={t('scenario.fission.hint')}>
              <NumberInput
                value={Math.round(f.fissionFraction * 100)}
                min={0}
                max={100}
                step={1}
                onChange={(value) => updateForm({ fissionFraction: value / 100, fissionAuto: false })}
                label={t('quantity.fissionFraction')}
                suffix="%"
                width={70}
                testId="fission-input"
              />
            </Field>
            <Field label={t('quantity.visibility')} hint={t('scenario.visibility.hint')}>
              <NumberInput
                value={Math.round((f.visibilityM / visibilityFactor) * 10) / 10}
                min={0.5}
                max={mi ? 60 : 100}
                onChange={(value) => updateForm({ visibilityM: value * visibilityFactor })}
                label={t('quantity.visibility')}
                suffix={visibilityUnit}
                width={70}
                testId="visibility-input"
              />
            </Field>
          </div>
        ) : null}
      </div>

      <div class="actions">
        <Button kind="primary" wide disabled={!at} onClick={() => void runDetonation()} testId="detonate" title={at ? undefined : t('scenario.location.none')}>
          {t('scenario.detonate')}
        </Button>
        <Button kind="ghost" disabled={!detonation.value} onClick={clearDetonation} testId="clear">
          <Icon name="trash" size={16} /> {t('scenario.clear')}
        </Button>
      </div>
      {!at ? <p class="hint center">{t('scenario.location.hint')}</p> : null}
    </section>
  );
}
