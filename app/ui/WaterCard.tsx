// Water waves from a detonation on water: depth at surface zero, how far the waves
// stay high, when they arrive, and the land they could flood.

import { t } from '../i18n';
import { formatArea, formatDistance, formatDuration, formatHeight, formatSpeed } from '../lib/format';
import { settings } from '../state/settings';
import { explaining } from '../state/simulation';
import { setWaterDepth, water } from '../state/water';
import { Field, HowButton, NumberInput } from './controls';

export function WaterCard() {
  void settings.value;
  const w = water.value;
  if (!w || w.state === 'land' || w.state === 'unknown') return null;
  if (w.state === 'loading') {
    return (
      <div class="card" data-testid="water-card">
        <div class="card-head">
          <h3>{t('water.title')}</h3>
        </div>
        <p class="hint">{t('water.reading')}</p>
      </div>
    );
  }
  const depthField = (
    <Field label={t('quantity.waterDepth')} hint={w.depthSource ? t(`water.depth.${w.depthSource}`) : undefined}>
      <NumberInput value={Math.round(w.depthM ?? 0)} min={1} max={11000} onChange={setWaterDepth} suffix="m" label={t('quantity.waterDepth')} testId="water-depth" />
    </Field>
  );
  if (w.state === 'needsDepth') {
    return (
      <div class="card" data-testid="water-card">
        <div class="card-head">
          <h3>{t('water.title')}</h3>
        </div>
        <p class="hint">{t('water.depth.needed')}</p>
        {depthField}
      </div>
    );
  }
  const s = w.summary!;
  return (
    <div class="card" data-testid="water-card">
      <div class="card-head">
        <h3>{t('water.title')}</h3>
        {w.inWater ? <HowButton onClick={() => (explaining.value = 'water')} testId="how-water" /> : null}
      </div>
      {depthField}
      {!w.inWater ? (
        <p class="hint" data-testid="water-airburst">
          {t('water.airburst')}
        </p>
      ) : (
        <>
          <dl class="facts">
            <dt>{t('water.range10')}</dt>
            <dd data-testid="water-range-10">{formatDistance(s.rangeTo10mM)}</dd>
            <dt>{t('water.range3')}</dt>
            <dd data-testid="water-range-3">{formatDistance(s.rangeTo3mM)}</dd>
            <dt>{t('water.range1')}</dt>
            <dd data-testid="water-range-1">{formatDistance(s.rangeTo1mM)}</dd>
            <dt>{t('quantity.waveSpeed')}</dt>
            <dd>{formatSpeed(s.speedMs)}</dd>
            <dt>{t('quantity.wavePeriod')}</dt>
            <dd>{formatDuration(s.periodS / 3600)}</dd>
          </dl>
          {w.floodState === 'loading' ? <p class="hint">{t('water.flood.loading')}</p> : null}
          {w.floodState === 'unavailable' ? <p class="hint">{t('water.flood.unavailable')}</p> : null}
          {w.floodState === 'ready' && w.flood ? (
            w.flood.nearestM === null ? (
              <p class="hint" data-testid="water-flood-none">
                {t('water.flood.none', { radius: formatDistance(w.flood.radiusM) })}
              </p>
            ) : (
              <dl class="facts" data-testid="water-flood">
                <dt>{t('water.flood.area')}</dt>
                <dd data-testid="water-flood-area">{formatArea(w.flood.areaM2)}</dd>
                <dt>{t('water.flood.runup')}</dt>
                <dd>{formatHeight(w.flood.maxRunupM)}</dd>
                <dt>{t('water.flood.nearest')}</dt>
                <dd>
                  {formatDistance(w.flood.nearestM)} · {formatDuration((w.flood.nearestArrivalS ?? 0) / 3600)}
                </dd>
              </dl>
            )
          ) : null}
          <p class="hint">{t('water.hint')}</p>
        </>
      )}
    </div>
  );
}
