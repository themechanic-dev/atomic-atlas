// The war scenario: launches added from the missile simulator, each with its time; one
// clock for all of them; a defence in general terms; what gets through; and the published
// studies of what such a war would do to the climate and to food.

import { useState } from 'preact/hooks';
import { DEFENCE_PHASES } from '@physics/defence/layers';
import { closestCase, XIA_2022, XIA_2022_COOLING_C } from '@physics/war/winter';
import { weaponById } from '../data/catalog';
import { t } from '../i18n';
import { formatLatLon, formatNumber, formatPeople, formatYield } from '../lib/format';
import { flights } from '../state/missiles';
import { settings } from '../state/settings';
import { explaining } from '../state/simulation';
import {
  addCurrentLaunch,
  clearWar,
  defence,
  estimateWarCasualties,
  removeSalvo,
  salvos,
  updateDefence,
  WAR_RATES,
  warCasualties,
  warClock,
  warDuration,
  warEvents,
  warFlights,
  warPause,
  warPlay,
  warPlaying,
  warRate,
  warSeek,
  warSummary,
} from '../state/war';
import { Button, Field, HowButton, Icon, NumberInput, Segmented, Switch } from './controls';
import { formatClock } from './MissilePanel';

const EVENTS_SHOWN = 40;

export function WarCard() {
  void settings.value;
  const [launchMin, setLaunchMin] = useState(0);
  const list = salvos.value;
  const canAdd = flights.value.some((f) => f.plan);
  if (!canAdd && list.length === 0) return null;
  const summary = warSummary.value;
  const d = defence.value;
  const total = warDuration.value;
  const casualties = warCasualties.value;
  const closest = closestCase(summary.arrivingYieldKt);
  // Far below the smallest case or far above the largest, the table says little about the scenario.
  const smallest = XIA_2022[0]!.weapons * XIA_2022[0]!.yieldKt;
  const largest = XIA_2022[XIA_2022.length - 1]!.weapons * XIA_2022[XIA_2022.length - 1]!.yieldKt;
  const outside = summary.arrivingYieldKt < smallest / 3 ? 'below' : summary.arrivingYieldKt > largest * 3 ? 'above' : 'closest';

  return (
    <div class="card" data-testid="war-card">
      <div class="card-head">
        <h3>{t('war.title')}</h3>
      </div>
      {canAdd ? (
        <div class="war-add">
          <Field label={t('war.launchAt')}>
            <NumberInput value={launchMin} min={0} max={1440} step={1} onChange={setLaunchMin} suffix="min" label={t('war.launchAt')} testId="war-launch-at" />
          </Field>
          <Button kind="primary" onClick={() => addCurrentLaunch(launchMin * 60)} testId="war-add">
            {t('war.add')}
          </Button>
          {list.length === 0 ? <p class="hint">{t('war.add.hint')}</p> : null}
        </div>
      ) : null}

      {list.length > 0 ? (
        <>
          <ul class="sites" data-testid="war-salvos">
            {list.map((salvo, index) => {
              const weapon = weaponById(salvo.weaponId);
              return (
                <li key={salvo.id} data-testid={`war-salvo-${index}`}>
                  <div class="site-head">
                    <strong>
                      {index + 1} · T+ {formatClock(salvo.launchAtS)} · {weapon?.name ?? salvo.weaponId}
                    </strong>
                    <button type="button" class="how-btn remove-btn" onClick={() => removeSalvo(salvo.id)} title={t('war.remove')} aria-label={t('war.remove')} data-testid={`war-remove-${index}`}>
                      ×
                    </button>
                  </div>
                  <div class="site-kind">
                    {t('war.salvo.detail', { count: salvo.targets.length, yield: formatYield(salvo.yieldKt) })} · {formatLatLon(salvo.from.lat, salvo.from.lng)}
                  </div>
                </li>
              );
            })}
          </ul>

          <h4 class="war-sub">
            {t('war.defence')} <HowButton onClick={() => (explaining.value = 'defence')} testId="how-defence" />
          </h4>
          <p class="hint">{t('war.defence.hint')}</p>
          <Field label={t('war.boost')} hint={t('war.boost.hint')}>
            <NumberInput value={d.boostS} min={0} max={600} step={10} onChange={(boostS) => updateDefence({ boostS })} suffix="s" label={t('war.boost')} testId="war-boost" />
          </Field>
          <Field label={t('war.terminalHeight')}>
            <NumberInput value={d.terminalHeightM / 1000} min={10} max={300} step={10} onChange={(km) => updateDefence({ terminalHeightM: km * 1000 })} suffix="km" label={t('war.terminalHeight')} testId="war-terminal-height" />
          </Field>
          {DEFENCE_PHASES.map((phase) => {
            const layer = d.layers[phase];
            return (
              <div class="war-layer" key={phase} data-testid={`war-layer-${phase}`}>
                <div class="war-layer-head">
                  <span>{t(`war.phase.${phase}`)}</span>
                  <Switch checked={layer.enabled} onChange={(enabled) => updateDefence({}, phase, { enabled })} label={t(`war.phase.${phase}`)} testId={`war-layer-${phase}-on`} />
                </div>
                {layer.enabled ? (
                  <div class="war-layer-row">
                    <Field label={t('war.shots')}>
                      <NumberInput value={layer.shots} min={1} max={10} step={1} onChange={(shots) => updateDefence({}, phase, { shots })} label={t('war.shots')} width={64} testId={`war-layer-${phase}-shots`} />
                    </Field>
                    <Field label={t('war.pk')}>
                      <NumberInput value={Math.round(layer.killProbability * 100)} min={0} max={100} step={5} onChange={(pct) => updateDefence({}, phase, { killProbability: pct / 100 })} suffix="%" label={t('war.pk')} width={64} testId={`war-layer-${phase}-pk`} />
                    </Field>
                  </div>
                ) : null}
              </div>
            );
          })}

          <dl class="facts" data-testid="war-summary">
            <dt>{t('war.warheads')}</dt>
            <dd>{summary.warheads}</dd>
            <dt>{t('war.arriving')}</dt>
            <dd data-testid="war-arriving">{formatNumber(summary.arriving, 3)}</dd>
            <dt>{t('war.yieldLaunched')}</dt>
            <dd>{formatYield(summary.launchedYieldKt)}</dd>
            <dt>{t('war.yieldArriving')}</dt>
            <dd>{formatYield(summary.arrivingYieldKt)}</dd>
          </dl>

          <h4 class="war-sub">{t('war.timeline')}</h4>
          <div class="playback-row">
            <span class="clock" data-testid="war-clock">
              T+ {formatClock(warClock.value)} / {formatClock(total)}
            </span>
          </div>
          <input
            class="slider"
            type="range"
            min={0}
            max={Math.ceil(total)}
            step={1}
            value={Math.round(warClock.value)}
            onInput={(event) => {
              warPause();
              warSeek(Number(event.currentTarget.value));
            }}
            aria-label={t('war.timeline')}
            data-testid="war-slider"
          />
          <div class="playback-row">
            <Button kind="primary" onClick={() => (warPlaying.value ? warPause() : warPlay())} testId="war-play">
              {warPlaying.value ? t('missiles.pause') : t('missiles.play')}
            </Button>
            <Segmented<string>
              label={t('missiles.speed')}
              value={String(warRate.value)}
              onChange={(value) => (warRate.value = Number(value))}
              options={WAR_RATES.map((rate) => ({ value: String(rate), label: `×${rate}` }))}
              testId="war-rate"
            />
          </div>
          <ol class="war-events" data-testid="war-events">
            {warEvents.value.slice(0, EVENTS_SHOWN).map((e, i) => (
              <li key={i} class={warClock.value >= e.timeS ? 'is-past' : ''}>
                <span class="war-time">T+ {formatClock(e.timeS)}</span>
                <span>{t(`war.event.${e.kind}`, { salvo: e.salvoIndex + 1, target: (e.targetIndex ?? 0) + 1 })}</span>
              </li>
            ))}
          </ol>
          {warEvents.value.length > EVENTS_SHOWN ? <p class="hint">{t('war.moreEvents', { count: warEvents.value.length - EVENTS_SHOWN })}</p> : null}

          <h4 class="war-sub">{t('casualties.title')}</h4>
          {casualties.state === 'idle' ? (
            <Button onClick={() => void estimateWarCasualties()} testId="war-casualties">
              {t('war.casualties.run', { count: warFlights.value.length })}
            </Button>
          ) : casualties.state === 'loading' ? (
            <p class="hint">{t('war.casualties.loading', { done: casualties.done, total: casualties.total })}</p>
          ) : casualties.state === 'unavailable' ? (
            <p class="hint">{t('war.casualties.unavailable')}</p>
          ) : (
            <dl class="facts" data-testid="war-casualties-result">
              <dt>{t('casualties.killed')}</dt>
              <dd>
                {formatPeople(casualties.killed.low)} – {formatPeople(casualties.killed.high)}
              </dd>
              <dt>{t('casualties.injured')}</dt>
              <dd>
                {formatPeople(casualties.injured.low)} – {formatPeople(casualties.injured.high)}
              </dd>
            </dl>
          )}
          <p class="hint">{t('war.casualties.hint')}</p>

          <h4 class="war-sub">
            {t('war.winter')} <HowButton onClick={() => (explaining.value = 'winter')} testId="how-winter" />
          </h4>
          <p class="hint">{t('war.winter.hint')}</p>
          <table class="mini-table war-winter" data-testid="war-winter">
            <thead>
              <tr>
                <th>{t('war.winter.soot')}</th>
                <th>{t('war.winter.weapons')}</th>
                <th>{t('war.winter.direct')}</th>
                <th>{t('war.winter.food')}</th>
              </tr>
            </thead>
            <tbody>
              {XIA_2022.map((c, i) => (
                <tr key={i} class={i === closest ? 'is-closest' : ''}>
                  <td class="num">{c.sootTg} Tg</td>
                  <td class="num">
                    {formatNumber(c.weapons, 4)} × {formatYield(c.yieldKt)}
                  </td>
                  <td class="num">{formatNumber(c.directDeaths, 4)}</td>
                  <td class="num">{formatNumber(c.withoutFoodYear2, 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {closest >= 0 ? (
            <p class="hint" data-testid="war-winter-closest">
              {t(`war.winter.${outside}`, { yield: formatYield(summary.arrivingYieldKt), soot: XIA_2022[closest]!.sootTg })}
            </p>
          ) : null}
          <p class="hint">{t('war.winter.cooling', { low: formatNumber(XIA_2022_COOLING_C.at5Tg, 2), high: formatNumber(XIA_2022_COOLING_C.at150Tg, 3) })}</p>

          <div class="actions">
            <Button kind="ghost" onClick={clearWar} testId="war-clear">
              <Icon name="trash" size={16} /> {t('war.clear')}
            </Button>
          </div>
        </>
      ) : null}
      <p class="hint">{t('war.assumptions')}</p>
    </div>
  );
}
