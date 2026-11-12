// The missile simulator's form and results: a weapon, a launch point, targets,
// the flight of each warhead and the clock that plays it back.

import { flightKind } from '@physics/ballistics/flight';
import type { TrajectoryShape } from '@physics/ballistics/trajectory';
import { COUNTRIES } from '../data/catalog';
import { t } from '../i18n';
import { formatDistance, formatHeight, formatLatLon, formatSpeed, formatYield } from '../lib/format';
import {
  chooseMissile,
  clearMissiles,
  clock,
  directed,
  duration,
  flights,
  followsToCity,
  launchPoint,
  missile,
  MISSILES,
  pause,
  picking,
  platformWarning,
  play,
  PLAYBACK_RATES,
  playbackRate,
  playing,
  reach,
  removeTarget,
  seek,
  shape,
  showEffectsAt,
  skipToImpact,
  stage,
  targets,
  warheadYieldKt,
  type PickTarget,
} from '../state/missiles';
import { settings } from '../state/settings';
import { explaining } from '../state/simulation';
import { Button, Field, HowButton, Icon, Segmented } from './controls';
import { WarCard } from './WarCard';

/** Minutes and seconds, or hours and minutes for long flights. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

export function MissilePanel() {
  void settings.value;
  const weapon = missile.value;
  const from = launchPoint.value;
  const list = flights.value;
  const total = duration.value;
  const ballistic = weapon ? flightKind(weapon.category) === 'ballistic' : true;
  const maxTargets = weapon?.warheadsMax ?? 1;

  return (
    <section class="panel-section" data-testid="missile-panel">
      <h2 class="panel-title">{t('missiles.title')}</h2>

      <div class="group">
        <h3>{t('scenario.weapon')}</h3>
        <select
          class="select select-wide"
          value={weapon?.id ?? ''}
          onChange={(event) => chooseMissile(event.currentTarget.value || null)}
          aria-label={t('scenario.weapon')}
          data-testid="missile-select"
        >
          <option value="">{t('missiles.choose')}</option>
          {COUNTRIES.filter((c) => MISSILES.some((w) => w.country === c)).map((country) => (
            <optgroup key={country} label={t(`country.${country}`)}>
              {MISSILES.filter((w) => w.country === country).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} · {t(`category.${w.category}`)} · {formatDistance((w.rangeKm ?? 0) * 1000, 3)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {weapon ? (
          <>
            <dl class="facts" data-testid="missile-facts">
              <dt>{t('catalog.field.platform')}</dt>
              <dd>
                {weapon.platform.map((p) => t(`platform.${p}`)).join(', ')}
                {weapon.carrier ? ` (${weapon.carrier})` : ''}
              </dd>
              <dt>{t('catalog.field.range')}</dt>
              <dd>{formatDistance((weapon.rangeKm ?? 0) * 1000, 3)}</dd>
              <dt>{t('catalog.field.warheads')}</dt>
              <dd>
                {weapon.warheadsMax}
                {weapon.mirv ? ` (${t('catalog.mirv')})` : ''}
              </dd>
            </dl>
            <Field label={t('catalog.field.yield')}>
              <select
                class="select"
                value={String(warheadYieldKt.value ?? '')}
                onChange={(event) => (warheadYieldKt.value = Number(event.currentTarget.value))}
                aria-label={t('catalog.field.yield')}
                data-testid="missile-yield"
              >
                {weapon.yieldsKt.map((y) => (
                  <option key={y} value={String(y)}>
                    {formatYield(y)}
                  </option>
                ))}
              </select>
            </Field>
            {weapon.estimate ? <p class="hint warn">{t('catalog.estimate.hint')}</p> : null}
          </>
        ) : (
          <p class="hint">{t('missiles.choose.hint')}</p>
        )}
      </div>

      {weapon && ballistic ? (
        <div class="group">
          <h3>{t('missiles.shape')}</h3>
          <Segmented<TrajectoryShape>
            label={t('missiles.shape')}
            value={shape.value}
            onChange={(value) => (shape.value = value)}
            options={[
              { value: 'depressed', label: t('missiles.shape.depressed') },
              { value: 'minimumEnergy', label: t('missiles.shape.minimumEnergy') },
              { value: 'lofted', label: t('missiles.shape.lofted') },
            ]}
            testId="missile-shape"
          />
          <p class="hint">{t(`missiles.shape.${shape.value}.hint`)}</p>
          {shape.value !== 'minimumEnergy' ? (
            <p class="hint" data-testid="missile-reach">
              {t('missiles.shape.reach', { range: formatDistance(reach.value, 3) })}
            </p>
          ) : null}
        </div>
      ) : null}

      <div class="group">
        <h3>
          <Icon name="target" size={16} /> {t('missiles.place')}
        </h3>
        <Segmented<PickTarget>
          label={t('missiles.place')}
          value={picking.value}
          onChange={(value) => (picking.value = value)}
          options={[
            { value: 'launch', label: t('missiles.launchPoint') },
            { value: 'target', label: t('missiles.targets', { count: targets.value.length, max: maxTargets }) },
          ]}
          testId="missile-picking"
        />
        <p class="hint">{t(picking.value === 'launch' ? 'missiles.place.launch.hint' : 'missiles.place.target.hint')}</p>
        <p class="location" data-testid="launch-point">
          {from ? formatLatLon(from.lat, from.lng) : t('missiles.launch.none')}
        </p>
        {platformWarning.value ? (
          <p class="hint warn" data-testid="platform-warning">
            {t(`missiles.warning.${platformWarning.value}`)}
          </p>
        ) : null}
      </div>

      {list.length > 0 ? (
        <div class="card" data-testid="flights-card">
          <div class="card-head">
            <h3>{t('missiles.flights')}</h3>
          </div>
          <ul class="flights">
            {list.map((flight, index) => (
              <li key={`${flight.target.lat},${flight.target.lng}`} data-testid={`flight-${index}`}>
                <div class="flight-head">
                  <strong>
                    {index + 1} · {formatDistance(flight.distanceM, 3)}
                  </strong>
                  <span class="flight-actions">
                    <HowButton onClick={() => (explaining.value = `flight:${index}`)} testId={`how-flight-${index}`} />
                    <button type="button" class="how-btn remove-btn" onClick={() => removeTarget(index)} title={t('missiles.removeTarget')} aria-label={t('missiles.removeTarget')} data-testid={`remove-target-${index}`}>
                      ×
                    </button>
                  </span>
                </div>
                {!flight.inRange ? (
                  <p class="hint warn" data-testid={`out-of-range-${index}`}>
                    {t('missiles.outOfRange', { range: formatDistance(reach.value, 3) })}
                  </p>
                ) : null}
                {flight.plan ? (
                  <dl class="facts">
                    <dt>{t('quantity.flightTime')}</dt>
                    <dd data-testid={`flight-time-${index}`}>{formatClock(flight.plan.flightTimeS)}</dd>
                    {flight.plan.kind === 'ballistic' ? (
                      <>
                        <dt>{t('quantity.apogee')}</dt>
                        <dd data-testid={`flight-apogee-${index}`}>{formatDistance(flight.plan.apogeeM, 3)}</dd>
                        <dt>{t('quantity.burnoutSpeed')}</dt>
                        <dd>{formatSpeed(flight.plan.speedMs)}</dd>
                      </>
                    ) : (
                      <>
                        <dt>{t('quantity.cruiseHeight')}</dt>
                        <dd>{formatHeight(flight.plan.apogeeM)}</dd>
                        <dt>{t('quantity.cruiseSpeed')}</dt>
                        <dd>{formatSpeed(flight.plan.speedMs)}</dd>
                      </>
                    )}
                  </dl>
                ) : null}
                {flight.plan ? (
                  <Button onClick={() => showEffectsAt(index)} testId={`show-effects-${index}`}>
                    {t('missiles.showEffects')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {total > 0 ? (
        <div class="card" data-testid="playback-card">
          <div class="card-head">
            <h3>{t('missiles.playback')}</h3>
            {stage.value !== 'idle' ? (
              <span class="stage-chip" data-testid="playback-stage">
                {t(`missiles.stage.${stage.value}`)}
              </span>
            ) : null}
            <span class="clock" data-testid="playback-clock">
              T+ {formatClock(clock.value)} / {formatClock(total)}
            </span>
          </div>
          <input
            class="slider"
            type="range"
            min={0}
            max={Math.ceil(total)}
            step={1}
            value={Math.round(clock.value)}
            onInput={(event) => {
              pause();
              seek(Number(event.currentTarget.value));
            }}
            aria-label={t('missiles.playback')}
            data-testid="playback-slider"
          />
          <div class="playback-row">
            <Button kind="primary" onClick={() => (playing.value ? pause() : play())} testId="playback-toggle">
              {playing.value ? t('missiles.pause') : t('missiles.play')}
            </Button>
            <Segmented<string>
              label={t('missiles.speed')}
              value={String(playbackRate.value)}
              onChange={(value) => (playbackRate.value = Number(value))}
              options={PLAYBACK_RATES.map((rate) => ({ value: String(rate), label: `×${rate}` }))}
              testId="playback-rate"
            />
          </div>
          <div class="playback-row">
            <Segmented<string>
              label={t('missiles.camera')}
              value={directed.value ? 'directed' : 'free'}
              onChange={(value) => (directed.value = value === 'directed')}
              options={[
                { value: 'directed', label: t('missiles.camera.directed') },
                { value: 'free', label: t('missiles.camera.free') },
              ]}
              testId="playback-camera"
            />
            <Button kind="ghost" disabled={clock.value >= total} onClick={skipToImpact} testId="playback-skip">
              {t('missiles.skip')}
            </Button>
          </div>
          {clock.value >= total ? (
            <p class="hint" data-testid="playback-arrived">
              {t(followsToCity.value ? 'missiles.arrived.one' : 'missiles.arrived.many')}
            </p>
          ) : null}
        </div>
      ) : null}

      <WarCard />

      <div class="actions">
        <Button kind="ghost" disabled={!from && targets.value.length === 0} onClick={clearMissiles} testId="missile-clear">
          <Icon name="trash" size={16} /> {t('scenario.clear')}
        </Button>
      </div>
      <p class="hint">{t('missiles.assumptions')}</p>
    </section>
  );
}
