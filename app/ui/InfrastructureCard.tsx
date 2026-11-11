// Airports and power stations inside the blast rings, each with what the source says a
// blast of that strength does to that kind of installation.

import { t } from '../i18n';
import { formatDistance, formatPressure } from '../lib/format';
import { affected } from '../state/infrastructure';
import { settings } from '../state/settings';
import { explaining } from '../state/simulation';
import { HowButton } from './controls';

const SHOWN = 12;

export function InfrastructureCard() {
  void settings.value;
  if (!settings.value.infrastructure) return null;
  const list = affected.value;
  if (list.length === 0) return null;
  return (
    <div class="card" data-testid="infrastructure-card">
      <div class="card-head">
        <h3>{t('infra.title')}</h3>
        <HowButton onClick={() => (explaining.value = 'infrastructure')} testId="how-infrastructure" />
      </div>
      <ul class="sites">
        {list.slice(0, SHOWN).map(({ site, rangeM, overpressurePsi, finding }) => (
          <li key={`${site.kind}:${site.lng},${site.lat}`}>
            <div class="site-head">
              <strong>{site.name}</strong>
              <span class="site-range">{formatDistance(rangeM)}</span>
            </div>
            <div class="site-kind">
              {t(`infra.kind.${site.kind}`)}
              {site.kind === 'power' ? ` · ${t(`infra.fuel.${site.detail}`)}` : ''} · {formatPressure(overpressurePsi)}
            </div>
            <div class={`site-finding is-${finding.damage}`}>{t(`infra.${site.kind}.${finding.damage}`)}</div>
          </li>
        ))}
      </ul>
      {list.length > SHOWN ? <p class="hint">{t('infra.more', { count: list.length - SHOWN })}</p> : null}
      <p class="hint">{t('infra.hint')}</p>
    </div>
  );
}
