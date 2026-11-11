// "How was this calculated?": the formula, the inputs, the result and the source
// behind a number on screen.

import { ASSUMPTIONS, OTA_ZONES } from '@physics/casualties/model';
import { SOURCES, type Explanation, type SourceId } from '@physics/sources';
import { t } from '../i18n';
import { formatPercent, formatQuantity } from '../lib/format';
import { openExternal } from '../lib/platform';
import { settings } from '../state/settings';
import { accidentRun } from '../state/accident';
import { timeline } from '../state/blastPlayback';
import { flights } from '../state/missiles';
import { detonation, explaining } from '../state/simulation';
import { Dialog, Icon } from './controls';

function SourceList({ ids }: { ids: readonly SourceId[] }) {
  return (
    <ul class="sources">
      {ids.map((id) => {
        const source = SOURCES[id];
        const url = 'url' in source ? source.url : undefined;
        return (
          <li key={id}>
            {source.citation}{' '}
            {url ? (
              <button type="button" class="link" onClick={() => openExternal(url)} data-testid={`source-${id}`}>
                {t('how.openSource')} <Icon name="external" size={13} />
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function ExplanationView({ explanation }: { explanation: Explanation }) {
  return (
    <>
      <p class="how-body">{t(`how.${explanation.id}.body`)}</p>
      <h3>{t('how.formula')}</h3>
      <pre class="formula" data-testid="how-formula">
        {explanation.formula}
      </pre>
      <div class="how-grid">
        <div>
          <h3>{t('how.inputs')}</h3>
          <table class="mini-table">
            <tbody>
              {explanation.inputs.map((v) => (
                <tr key={v.symbol}>
                  <td class="symbol">{v.symbol}</td>
                  <td>{t(`quantity.${v.labelKey}`)}</td>
                  <td class="num">{formatQuantity(v.value, v.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3>{t('how.outputs')}</h3>
          <table class="mini-table">
            <tbody>
              {explanation.outputs.map((v) => (
                <tr key={v.symbol}>
                  <td class="symbol">{v.symbol}</td>
                  <td>{t(`quantity.${v.labelKey}`)}</td>
                  <td class="num">{formatQuantity(v.value, v.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {explanation.where ? (
        <>
          <h3>{t('how.where')}</h3>
          <p>{explanation.where}</p>
        </>
      ) : null}
      {explanation.uncertainty ? (
        <>
          <h3>{t('how.uncertainty')}</h3>
          <p data-testid="how-uncertainty">
            {explanation.uncertainty === 'rough' ? t('how.uncertainty.rough') : explanation.uncertainty}. {t(`how.${explanation.id}.uncertainty`)}
          </p>
        </>
      ) : null}
      {explanation.sources.length > 0 ? (
        <>
          <h3>{t('how.sources')}</h3>
          <SourceList ids={explanation.sources} />
        </>
      ) : null}
    </>
  );
}

function CasualtiesView() {
  return (
    <>
      <p class="how-body">{t('how.casualties.body')}</p>
      <h3>{t('how.casualties.blast')}</h3>
      <table class="mini-table" data-testid="how-ota-table">
        <thead>
          <tr>
            <th>{t('quantity.overpressure')}</th>
            <th>{t('casualties.killed')}</th>
            <th>{t('casualties.injured')}</th>
          </tr>
        </thead>
        <tbody>
          {OTA_ZONES.map((zone, i) => (
            <tr key={zone.minPsi}>
              <td>{i === 0 ? `> ${zone.minPsi} psi` : `${zone.minPsi} – ${OTA_ZONES[i - 1]!.minPsi} psi`}</td>
              <td class="num">{formatPercent(zone.killed)}</td>
              <td class="num">{formatPercent(zone.injured)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>{t('how.casualties.range')}</h3>
      <table class="mini-table">
        <thead>
          <tr>
            <th />
            <th>{t('how.casualties.low')}</th>
            <th>{t('how.casualties.central')}</th>
            <th>{t('how.casualties.high')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{t('how.casualties.exposed')}</td>
            <td class="num">{formatPercent(ASSUMPTIONS.low.exposedFraction)}</td>
            <td class="num">{formatPercent(ASSUMPTIONS.central.exposedFraction)}</td>
            <td class="num">{formatPercent(ASSUMPTIONS.high.exposedFraction)}</td>
          </tr>
          <tr>
            <td>{t('how.casualties.blastRange')}</td>
            <td class="num">× {ASSUMPTIONS.low.blastRangeFactor}</td>
            <td class="num">× {ASSUMPTIONS.central.blastRangeFactor}</td>
            <td class="num">× {ASSUMPTIONS.high.blastRangeFactor}</td>
          </tr>
          <tr>
            <td>{t('how.casualties.transmission')}</td>
            <td class="num">{formatPercent(ASSUMPTIONS.low.radiationTransmission)}</td>
            <td class="num">{formatPercent(ASSUMPTIONS.central.radiationTransmission)}</td>
            <td class="num">{formatPercent(ASSUMPTIONS.high.radiationTransmission)}</td>
          </tr>
        </tbody>
      </table>
      <p>{t('how.casualties.burns')}</p>
      <p>{t('how.casualties.radiation')}</p>
      <h3>{t('how.uncertainty')}</h3>
      <p>{t('how.casualties.uncertainty')}</p>
      <h3>{t('how.sources')}</h3>
      <SourceList ids={['ota1979', 'ghspop', 'gd1977']} />
    </>
  );
}

export function HowDialog() {
  const id = explaining.value;
  const current = detonation.value;
  void settings.value;
  if (!id) return null;
  const close = (): void => {
    explaining.value = null;
  };

  if (id.startsWith('flight:')) {
    const plan = flights.value[Number(id.slice(7))]?.plan;
    if (!plan) return null;
    return (
      <Dialog title={`${t('how.title')}: ${t(`how.${plan.explanation.id}.title`)}`} onClose={close} wide testId="how-dialog">
        <ExplanationView explanation={plan.explanation} />
      </Dialog>
    );
  }
  if (id === 'timeline') {
    const line = timeline.value;
    if (!line) return null;
    return (
      <Dialog title={`${t('how.title')}: ${t('how.arrival.title')}`} onClose={close} wide testId="how-dialog">
        <ExplanationView explanation={line.explanation} />
      </Dialog>
    );
  }
  if (id === 'plume') {
    const run = accidentRun.value;
    if (!run) return null;
    return (
      <Dialog title={`${t('how.title')}: ${t('how.plume.title')}`} onClose={close} wide testId="how-dialog">
        <ExplanationView explanation={run.result.explanation} />
        <SourceList ids={[run.accident.source]} />
      </Dialog>
    );
  }
  if (id === 'infrastructure') {
    return (
      <Dialog title={`${t('how.title')}: ${t('infra.title')}`} onClose={close} wide testId="how-dialog">
        <p class="how-body">{t('how.infrastructure.body')}</p>
        <h3>{t('infra.kind.airport')}</h3>
        <table class="mini-table">
          <tbody>
            {(['light', 'moderate', 'severe'] as const).map((level, i) => (
              <tr key={level}>
                <td class="num">≥ {formatQuantity([1, 2, 3][i]!, 'pressure')}</td>
                <td>{t(`infra.airport.${level}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>{t('infra.kind.power')}</h3>
        <table class="mini-table">
          <tbody>
            {(['light', 'moderate', 'beyond'] as const).map((level, i) => (
              <tr key={level}>
                <td class="num">≥ {formatQuantity([1.7, 5, 5.5][i]!, 'pressure')}</td>
                <td>{t(`infra.power.${level}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>{t('how.where')}</h3>
        <p>Glasstone &amp; Dolan (1977) Table 5.153, §5.99-5.105</p>
        <h3>{t('how.uncertainty')}</h3>
        <p>{t('how.infrastructure.uncertainty')}</p>
        <h3>{t('how.sources')}</h3>
        <SourceList ids={['gd1977']} />
        <p class="hint">{t('how.infrastructure.data')}</p>
      </Dialog>
    );
  }
  if (!current) return null;

  if (id === 'casualties') {
    return (
      <Dialog title={`${t('how.title')}: ${t('casualties.title')}`} onClose={close} wide testId="how-dialog">
        <CasualtiesView />
      </Dialog>
    );
  }
  if (id === 'fallout') {
    return (
      <Dialog title={`${t('how.title')}: ${t('fallout.title')}`} onClose={close} wide testId="how-dialog">
        <ExplanationView explanation={current.result.fallout.explanation} />
      </Dialog>
    );
  }
  const ring = current.result.rings.find((r) => r.id === id);
  if (!ring) return null;
  return (
    <Dialog title={`${t('how.title')}: ${t(`effect.${ring.id}`)}`} onClose={close} wide testId="how-dialog">
      <ExplanationView explanation={ring.explanation} />
    </Dialog>
  );
}
