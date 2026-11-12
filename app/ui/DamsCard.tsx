// Dams near a detonation, and what would follow downstream if one of them failed.

import { ATTENUATION_LENGTH_M, distanceToFlow } from '@physics/water/dambreak';
import { t } from '../i18n';
import { formatDistance, formatFlow, formatHeight, formatPressure, formatVolume } from '../lib/format';
import { clearDamFlood, damFlood, nearbyDams, whatIfDamFails } from '../state/dams';
import { settings } from '../state/settings';
import { explaining } from '../state/simulation';
import { Button, HowButton } from './controls';

const SHOWN = 8;

export function DamsCard() {
  void settings.value;
  if (!settings.value.infrastructure) return null;
  const list = nearbyDams.value;
  const flood = damFlood.value;
  if (list.length === 0) return null;
  return (
    <div class="card" data-testid="dams-card">
      <div class="card-head">
        <h3>{t('dams.title')}</h3>
        <HowButton onClick={() => (explaining.value = 'dam')} testId="how-dam" />
      </div>
      <ul class="sites">
        {list.slice(0, SHOWN).map(({ dam, rangeM, overpressurePsi }, index) => {
          const chosen = flood?.dam === dam;
          return (
            <li key={`${dam.lng},${dam.lat}`} data-testid={`dam-${index}`}>
              <div class="site-head">
                <strong>{dam.name || t('dams.unnamed')}</strong>
                <span class="site-range">{formatDistance(rangeM)}</span>
              </div>
              <div class="site-kind">
                {formatHeight(dam.heightM)} · {formatVolume(dam.volumeM3)} · {formatPressure(overpressurePsi)}
              </div>
              {chosen ? (
                <div class="dam-flood" data-testid="dam-flood">
                  {flood.state === 'loading' ? <p class="hint">{t('dams.flood.loading')}</p> : null}
                  <dl class="facts">
                    <dt>{t('quantity.peakOutflow')}</dt>
                    <dd data-testid="dam-peak">{formatFlow(flood.peakM3s)}</dd>
                    <dt>{t('dams.flood.third')}</dt>
                    <dd>{formatDistance(ATTENUATION_LENGTH_M)}</dd>
                    <dt>{t('dams.flood.tenth')}</dt>
                    <dd>{formatDistance(distanceToFlow(flood.peakM3s, flood.peakM3s / 10))}</dd>
                    {flood.state === 'ready' ? (
                      <>
                        <dt>{t('dams.flood.path')}</dt>
                        <dd data-testid="dam-path">{formatDistance(flood.along[flood.along.length - 1] ?? 0)}</dd>
                      </>
                    ) : null}
                  </dl>
                  {flood.state === 'ready' && flood.end ? <p class="hint">{t(`dams.flood.end.${flood.end}`)}</p> : null}
                  {flood.state === 'unavailable' ? <p class="hint">{t('dams.flood.unavailable')}</p> : null}
                  <Button kind="ghost" onClick={clearDamFlood} testId="dam-flood-clear">
                    {t('dams.flood.hide')}
                  </Button>
                </div>
              ) : (
                <Button kind="ghost" onClick={() => void whatIfDamFails(dam)} testId={`dam-whatif-${index}`}>
                  {t('dams.whatIf')}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {list.length > SHOWN ? <p class="hint">{t('infra.more', { count: list.length - SHOWN })}</p> : null}
      <p class="hint">{t('dams.hint')}</p>
    </div>
  );
}
