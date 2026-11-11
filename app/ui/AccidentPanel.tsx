// The accident simulator's form and results: how much is released, where, in which
// weather, and the dose that follows downwind.

import { SOURCES } from '@physics/sources';
import { STABILITY_CLASSES, type StabilityClass } from '@physics/dispersion/plume';
import { IAEA_CRITERIA, MAX_RANGE_M } from '@physics/dispersion/release';
import { t } from '../i18n';
import { formatActivity, formatDistance, formatEffectiveDose, formatHeight, formatLatLon, formatSpeed } from '../lib/format';
import {
  ACCIDENTS,
  accidentForm,
  accidentRun,
  accidentSite,
  chosenAccident,
  clearAccident,
  runAccident,
  SCALES,
  updateAccidentForm,
  useHistoricalPlace,
} from '../state/accident';
import { PLUME_COLORS, PLUME_LEVELS_SV } from '../map/overlays';
import { settings } from '../state/settings';
import { explaining } from '../state/simulation';
import { Button, Field, HowButton, Icon, NumberInput, Segmented } from './controls';

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

function range(metres: number): string {
  if (metres <= 0) return t('accident.notReached');
  if (metres >= MAX_RANGE_M) return t('accident.beyond', { distance: formatDistance(MAX_RANGE_M) });
  return formatDistance(metres);
}

export function AccidentPanel() {
  void settings.value;
  const form = accidentForm.value;
  const site = accidentSite.value;
  const accident = chosenAccident.value;
  const run = accidentRun.value;
  const total = accident.nuclides.reduce((sum, entry) => sum + entry.activityBq, 0) * form.scale;

  return (
    <>
      <section class="panel-section" data-testid="accident-panel">
        <h2 class="panel-title">{t('accident.title')}</h2>

        <div class="group">
          <h3>{t('accident.release')}</h3>
          <Field label={t('accident.like')}>
            <select
              class="select"
              value={form.accidentId}
              onChange={(event) => updateAccidentForm({ accidentId: event.currentTarget.value })}
              aria-label={t('accident.like')}
              data-testid="accident-select"
            >
              {ACCIDENTS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {t(`accident.name.${entry.id}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('accident.scale')}>
            <Segmented<string>
              label={t('accident.scale')}
              value={String(form.scale)}
              onChange={(value) => updateAccidentForm({ scale: Number(value) })}
              options={SCALES.map((scale) => ({ value: String(scale), label: scale === 1 ? t('accident.scale.whole') : `${scale * 100} %` }))}
              testId="accident-scale"
            />
          </Field>
          <dl class="facts" data-testid="accident-inventory">
            <dt>{t('quantity.activityReleased')}</dt>
            <dd>{formatActivity(total)}</dd>
            {accident.nuclides.map((entry) => (
              <>
                <dt key={`${entry.nuclide}-name`}>{entry.nuclide}</dt>
                <dd key={`${entry.nuclide}-value`}>{formatActivity(entry.activityBq * form.scale)}</dd>
              </>
            ))}
          </dl>
          <p class="hint">
            {t(`accident.note.${accident.id}`)} {t('accident.sourceIs', { source: SOURCES[accident.source].short })}
          </p>
        </div>

        <div class="group">
          <h3>
            <Icon name="target" size={16} /> {t('accident.place')}
          </h3>
          <p class="location" data-testid="accident-site">
            {site ? formatLatLon(site.lat, site.lng) : t('accident.place.none')}
          </p>
          <Button onClick={useHistoricalPlace} testId="accident-historical-place">
            {t('accident.place.historical')}
          </Button>
          <p class="hint">{t('accident.place.hint')}</p>
        </div>

        <div class="group">
          <h3>{t('accident.weather')}</h3>
          <Field label={t('accident.wind')} hint={formatSpeed(form.wind10Ms)}>
            <NumberInput value={form.wind10Ms} min={0.5} max={30} onChange={(wind10Ms) => updateAccidentForm({ wind10Ms })} suffix="m/s" label={t('accident.wind')} testId="accident-wind" />
          </Field>
          <Field label={t('scenario.wind.from')}>
            <select
              class="select"
              value={String(Math.round(form.windFromDeg / 45) % 8)}
              onChange={(event) => updateAccidentForm({ windFromDeg: Number(event.currentTarget.value) * 45 })}
              aria-label={t('scenario.wind.from')}
              data-testid="accident-wind-from"
            >
              {COMPASS.map((name, i) => (
                <option key={name} value={String(i)}>
                  {t(`compass.${name}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('accident.stability')}>
            <Segmented<StabilityClass>
              label={t('accident.stability')}
              value={form.stability}
              onChange={(stability) => updateAccidentForm({ stability })}
              options={STABILITY_CLASSES.map((value) => ({ value, label: value }))}
              testId="accident-stability"
            />
          </Field>
          <p class="hint">{t(`accident.stability.${form.stability}`)}</p>
          <Field label={t('quantity.releaseHeight')} hint={formatHeight(form.releaseHeightM)}>
            <NumberInput value={form.releaseHeightM} min={0} max={3000} onChange={(releaseHeightM) => updateAccidentForm({ releaseHeightM })} suffix="m" label={t('quantity.releaseHeight')} testId="accident-height" />
          </Field>
          <Field label={t('accident.duration')}>
            <NumberInput value={form.durationMin} min={10} max={14400} onChange={(durationMin) => updateAccidentForm({ durationMin })} suffix="min" label={t('accident.duration')} testId="accident-duration" />
          </Field>
        </div>

        <div class="actions">
          <Button kind="primary" wide disabled={!site} onClick={runAccident} testId="accident-run">
            {t('accident.run')}
          </Button>
          <Button kind="ghost" disabled={!site && !run} onClick={clearAccident} testId="accident-clear">
            <Icon name="trash" size={16} /> {t('scenario.clear')}
          </Button>
        </div>
        {!site ? <p class="hint center">{t('accident.run.hint')}</p> : null}
      </section>

      {run ? (
        <section class="panel-section results" data-testid="accident-results">
          <h2 class="panel-title">{t('results.title')}</h2>
          <div class="card">
            <div class="card-head">
              <h3>{t('accident.criteria')}</h3>
              <HowButton onClick={() => (explaining.value = 'plume')} testId="how-plume" />
            </div>
            <dl class="facts" data-testid="accident-ranges">
              <dt>{t('accident.urgent', { dose: formatEffectiveDose(IAEA_CRITERIA.urgentSv) })}</dt>
              <dd>{range(run.result.urgentRangeM)}</dd>
              <dt>{t('accident.relocation', { dose: formatEffectiveDose(IAEA_CRITERIA.relocationSv) })}</dt>
              <dd>{range(run.result.relocationRangeM)}</dd>
            </dl>
            <p class="hint">{t('accident.criteria.hint')}</p>
          </div>
          <div class="card">
            <div class="card-head">
              <h3>{t('accident.table')}</h3>
            </div>
            <table class="mini-table dose-table" data-testid="accident-table">
              <thead>
                <tr>
                  <th>{t('accident.distance')}</th>
                  <th>{t('accident.dose7d')}</th>
                  <th>{t('accident.dose1y')}</th>
                  <th>Cs-137</th>
                </tr>
              </thead>
              <tbody>
                {run.table.map(({ rangeM, dose }) => (
                  <tr key={rangeM}>
                    <td>{formatDistance(rangeM)}</td>
                    <td class="num">{formatEffectiveDose(dose.first7dSv)}</td>
                    <td class="num">{formatEffectiveDose(dose.firstYearSv)}</td>
                    <td class="num">{dose.depositionBqM2['Cs-137'] ? `${formatActivity(dose.depositionBqM2['Cs-137'])}/m²` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p class="hint">{t('accident.table.hint')}</p>
          </div>
          <div class="card" data-testid="accident-legend">
            <div class="card-head">
              <h3>{t('accident.legend')}</h3>
            </div>
            <ul class="legend">
              {PLUME_LEVELS_SV.map((level) => (
                <li key={level}>
                  <span class="legend-dot" style={{ background: PLUME_COLORS[level] }} />
                  {formatEffectiveDose(level)}
                </li>
              ))}
            </ul>
          </div>
          <p class="hint">{t('accident.assumptions')}</p>
        </section>
      ) : null}
    </>
  );
}
