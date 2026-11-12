// What came out of a detonation: casualties, effect rings, fallout, assumptions.

import { useEffect, useRef } from 'preact/hooks';
import { MILE } from '@physics/units';
import type { EffectRing } from '@physics/detonation';
import { t } from '../i18n';
import {
  formatAngle,
  formatArea,
  formatDistance,
  formatDoseRate,
  formatDuration,
  formatExposure,
  formatHeight,
  formatNumber,
  formatPeople,
  formatPercent,
  formatSpeed,
  formatYield,
} from '../lib/format';
import { EFFECT_COLORS, FALLOUT_COLORS, FALLOUT_LEVELS } from '../map/overlays';
import { settings } from '../state/settings';
import { cameFromFlight, returnToFlight } from '../state/missiles';
import { casualties, detonation, explaining } from '../state/simulation';
import { closeupRange } from '../state/ui';
import { Button, HowButton } from './controls';
import { DamsCard } from './DamsCard';
import { InfrastructureCard } from './InfrastructureCard';
import { WaterCard } from './WaterCard';
import { PlaybackCard } from './PlaybackCard';

function ringValue(ring: EffectRing): string {
  if (!(ring.radiusM > 0)) return t('results.notReached');
  if (ring.radiusLowM !== undefined && ring.radiusHighM !== undefined && ring.kind === 'radiation') {
    const low = formatDistance(ring.radiusLowM);
    const high = formatDistance(ring.radiusHighM);
    return low === high ? low : `${low} – ${high}`;
  }
  return formatDistance(ring.radiusM);
}

function ringThreshold(ring: EffectRing): string {
  switch (ring.thresholdUnit) {
    case 'psi':
      return `${formatNumber(ring.threshold, 3)} psi`;
    case 'cal/cm2':
      return formatExposure(ring.threshold).split(' (')[0]!;
    case 'rad':
      return `${formatNumber(ring.threshold, 3)} rad`;
    case 'none':
      return '';
  }
}

function range(low: number, high: number): string {
  const a = formatPeople(low);
  const b = formatPeople(high);
  return a === b ? a : `${a} – ${b}`;
}

export function ResultsPanel() {
  const current = detonation.value;
  // Reading the settings subscribes the panel to unit and language changes.
  void settings.value;
  const section = useRef<HTMLElement>(null);
  const id = current?.id;
  // A new result scrolls into view: on small screens it would otherwise stay below the form.
  useEffect(() => {
    if (id !== undefined) section.current?.scrollIntoView({ behavior: settings.value.reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }, [id]);
  if (!current) return null;
  const { result } = current;
  const c = casualties.value;
  const fallout = result.fallout;
  const model = fallout.model;

  return (
    <section class="panel-section results" data-testid="results-panel" ref={section}>
      <h2 class="panel-title">{t('results.title')}</h2>
      <p class="summary" data-testid="results-summary">
        {t('results.summary', {
          yield: formatYield(result.scenario.yieldKt),
          height: result.heightM > 0 ? formatHeight(result.heightM) : t('results.summary.surface'),
        })}
      </p>
      {cameFromFlight.value ? (
        <Button kind="ghost" onClick={returnToFlight} testId="back-to-flight">
          ← {t('results.backToFlight')}
        </Button>
      ) : null}
      <PlaybackCard />
      <Button
        onClick={() => {
          const ring = result.rings.find((r) => r.id === 'blast5' && r.radiusM > 0) ?? result.rings.find((r) => r.kind === 'blast' && r.radiusM > 0);
          // Just inside the ring, so the view shows what the ring stands for.
          closeupRange.value = ring ? ring.radiusM * 0.97 : result.maxRadiusM / 2;
        }}
        testId="open-closeup"
      >
        {t('closeup.open')}
      </Button>

      <div class="card" data-testid="casualties-card">
        <div class="card-head">
          <h3>{t('casualties.title')}</h3>
          <HowButton onClick={() => (explaining.value = 'casualties')} testId="how-casualties" />
        </div>
        {c.state === 'loading' || c.state === 'idle' ? <p class="hint">{t('casualties.loading')}</p> : null}
        {c.state === 'unavailable' ? <p class="hint warn">{t('casualties.unavailable')}</p> : null}
        {c.state === 'error' ? <p class="hint warn">{t('casualties.error')}</p> : null}
        {c.state === 'ready' && c.estimate ? (
          <>
            <dl class="big-numbers">
              <div>
                <dt>{t('casualties.killed')}</dt>
                <dd data-testid="killed-range">{range(c.estimate.killed.low, c.estimate.killed.high)}</dd>
              </div>
              <div>
                <dt>{t('casualties.injured')}</dt>
                <dd data-testid="injured-range">{range(c.estimate.injured.low, c.estimate.injured.high)}</dd>
              </div>
            </dl>
            <p class="hint">
              {t('casualties.central', {
                killed: formatPeople(c.estimate.killed.central),
                injured: formatPeople(c.estimate.injured.central),
              })}
            </p>
            <p class="hint">
              {t('casualties.population', { people: formatPeople(c.estimate.peopleInside1Psi), year: c.epoch ?? '' })}
            </p>
          </>
        ) : null}
      </div>

      <div class="card" data-testid="effects-card">
        <div class="card-head">
          <h3>{t('results.effects')}</h3>
        </div>
        <ul class="effects">
          {result.rings.map((ring) => (
            <li key={ring.id} class={ring.radiusM > 0 ? '' : 'is-absent'} data-testid={`effect-${ring.id}`}>
              <span class={`swatch swatch-${ring.kind}`} style={{ '--swatch': EFFECT_COLORS[ring.id] ?? '#fff' }} />
              <span class="effect-text">
                <span class="effect-name">{t(`effect.${ring.id}`)}</span>
                <span class="effect-detail">
                  {ringThreshold(ring)}
                  {ring.radiusM > 0 ? ` · ${formatArea(ring.areaM2)}` : ''}
                </span>
              </span>
              <span class="effect-value" data-testid={`effect-${ring.id}-value`}>
                {ringValue(ring)}
              </span>
              <HowButton onClick={() => (explaining.value = ring.id)} testId={`how-${ring.id}`} />
            </li>
          ))}
        </ul>
        <p class="hint">{t('results.effects.hint', { speed: formatSpeed(result.windAt5PsiMs) })}</p>
      </div>
      <WaterCard />
      <InfrastructureCard />
      <DamsCard />

      <div class="card" data-testid="fallout-card">
        <div class="card-head">
          <h3>{t('fallout.title')}</h3>
          <HowButton onClick={() => (explaining.value = 'fallout')} testId="how-fallout" />
        </div>
        {!fallout.significant || !model ? (
          <p class="hint" data-testid="fallout-none">
            {result.scenario.fissionFraction <= 0
              ? t('fallout.none.clean')
              : t('fallout.none', { height: formatHeight(result.heightM), limit: formatHeight(result.falloutFreeHeightM) })}
          </p>
        ) : (
          <>
            <p class="hint">
              {t('fallout.wind', {
                speed: formatSpeed(fallout.wind.speedMs),
                from: formatAngle(fallout.wind.fromDeg),
                source: current.liveWind ? t('fallout.wind.live') : t('fallout.wind.manual'),
              })}
            </p>
            <table class="mini-table" data-testid="fallout-table">
              <thead>
                <tr>
                  <th>{t('fallout.table.rate')}</th>
                  <th>{t('fallout.table.downwind')}</th>
                  <th>{t('fallout.table.width')}</th>
                  <th>{t('fallout.table.arrival')}</th>
                </tr>
              </thead>
              <tbody>
                {FALLOUT_LEVELS.map((level) => {
                  const extent = model.contourExtentM(level);
                  if (!extent) {
                    return (
                      <tr key={level} class="is-absent">
                        <td>
                          <span class="swatch" style={{ '--swatch': FALLOUT_COLORS[level] }} /> {formatDoseRate(level).split(' (')[0]}
                        </td>
                        <td colSpan={3}>{t('results.notReached')}</td>
                      </tr>
                    );
                  }
                  // Widest point of the contour, found by sampling along the wind axis.
                  let width = 0;
                  for (let i = 0; i <= 60; i++) {
                    const x = extent[0] + ((extent[1] - extent[0]) * i) / 60;
                    width = Math.max(width, 2 * model.contourHalfWidthM(x, level));
                  }
                  return (
                    <tr key={level}>
                      <td>
                        <span class="swatch" style={{ '--swatch': FALLOUT_COLORS[level] }} /> {formatDoseRate(level).split(' (')[0]}
                      </td>
                      <td>{formatDistance(extent[1], 2)}</td>
                      <td>{formatDistance(width, 2)}</td>
                      <td>{formatDuration(model.arrivalTimeH(extent[1]))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p class="hint">
              {t('fallout.cloud', { top: formatHeight(fallout.cloud.topM), bottom: formatHeight(fallout.cloud.bottomM) })}
              {fallout.localFraction < 1 ? ` ${t('fallout.partial', { fraction: formatPercent(fallout.localFraction) })}` : ''}
            </p>
            <p class="hint">{t('fallout.note')}</p>
          </>
        )}
      </div>

      <div class="card" data-testid="assumptions-card">
        <div class="card-head">
          <h3>{t('assumptions.title')}</h3>
        </div>
        <dl class="assumptions">
          <dt>{t('assumptions.surface')}</dt>
          <dd>{t('assumptions.surface.value')}</dd>
          <dt>{t('quantity.burstHeight')}</dt>
          <dd>
            {formatHeight(result.heightM)} ({t(`scenario.burst.${result.scenario.burstMode}`)})
          </dd>
          <dt>{t('quantity.fissionFraction')}</dt>
          <dd>{formatPercent(result.scenario.fissionFraction)}</dd>
          <dt>{t('quantity.visibility')}</dt>
          <dd>
            {formatDistance(result.scenario.visibilityM, 2)}
            {Math.abs(result.scenario.visibilityM - 12 * MILE) < 1 ? ` (${t('assumptions.visibility.clear')})` : ''}
          </dd>
          <dt>{t('assumptions.wind')}</dt>
          <dd>
            {current.liveWind
              ? t('assumptions.wind.live', { time: (current.weatherTime ?? '').replace('T', ' ') })
              : t('assumptions.wind.manual')}
          </dd>
          <dt>{t('assumptions.population')}</dt>
          <dd>{t('assumptions.population.value')}</dd>
          <dt>{t('assumptions.shelter')}</dt>
          <dd>{t('assumptions.shelter.value')}</dd>
          <dt>{t('assumptions.scope')}</dt>
          <dd>{t('assumptions.scope.value')}</dd>
        </dl>
      </div>
    </section>
  );
}
