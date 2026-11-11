// The weapons catalog: public figures, each with its source. Choosing an entry
// puts its yield into the scenario.

import { useMemo, useState } from 'preact/hooks';
import {
  assumedFissionFraction,
  CATEGORIES,
  COUNTRIES,
  WEAPONS,
  type CountryCode,
  type Weapon,
  type WeaponCategory,
  type WeaponStatus,
} from '../data/catalog';
import { t } from '../i18n';
import { formatDistance, formatYield } from '../lib/format';
import { openExternal } from '../lib/platform';
import { settings } from '../state/settings';
import { form, updateForm } from '../state/simulation';
import { Button, Dialog, Icon } from './controls';

type StatusFilter = 'all' | 'active' | 'historical';

function matchesStatus(status: WeaponStatus, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return status === 'active' || status === 'development';
  return status === 'retired' || status === 'test';
}

export function CatalogDialog({ onClose }: { onClose: () => void }) {
  void settings.value;
  const [country, setCountry] = useState<CountryCode | 'all'>('all');
  const [category, setCategory] = useState<WeaponCategory | 'all'>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return WEAPONS.filter(
      (w) =>
        (country === 'all' || w.country === country) &&
        (category === 'all' || w.category === category) &&
        matchesStatus(w.status, status) &&
        (needle === '' || w.name.toLowerCase().includes(needle) || w.designations.some((d) => d.toLowerCase().includes(needle))),
    ).sort((a, b) => a.country.localeCompare(b.country) || a.year - b.year);
  }, [country, category, status, query]);

  const use = (weapon: Weapon, yieldKt: number): void => {
    updateForm({ yieldKt, weaponId: weapon.id, fissionFraction: assumedFissionFraction(weapon, yieldKt) });
    onClose();
  };

  return (
    <Dialog title={t('catalog.title')} onClose={onClose} wide testId="catalog-dialog">
      <p class="hint">{t('catalog.intro')}</p>
      <div class="filters">
        <input
          class="text-input"
          type="search"
          placeholder={t('catalog.search')}
          value={query}
          onInput={(event) => setQuery(event.currentTarget.value)}
          aria-label={t('catalog.search')}
          data-testid="catalog-search"
        />
        <select class="select" value={country} onChange={(e) => setCountry(e.currentTarget.value as CountryCode | 'all')} aria-label={t('catalog.country')} data-testid="catalog-country">
          <option value="all">{t('catalog.country.all')}</option>
          {COUNTRIES.filter((c) => WEAPONS.some((w) => w.country === c)).map((c) => (
            <option key={c} value={c}>
              {t(`country.${c}`)}
            </option>
          ))}
        </select>
        <select class="select" value={category} onChange={(e) => setCategory(e.currentTarget.value as WeaponCategory | 'all')} aria-label={t('catalog.category')} data-testid="catalog-category">
          <option value="all">{t('catalog.category.all')}</option>
          {CATEGORIES.filter((c) => WEAPONS.some((w) => w.category === c)).map((c) => (
            <option key={c} value={c}>
              {t(`category.${c}`)}
            </option>
          ))}
        </select>
        <select class="select" value={status} onChange={(e) => setStatus(e.currentTarget.value as StatusFilter)} aria-label={t('catalog.status')} data-testid="catalog-status">
          <option value="all">{t('catalog.status.all')}</option>
          <option value="active">{t('catalog.status.active')}</option>
          <option value="historical">{t('catalog.status.historical')}</option>
        </select>
      </div>
      <p class="hint" data-testid="catalog-count">
        {t('catalog.count', { shown: list.length, total: WEAPONS.length })}
      </p>

      <ul class="catalog" data-testid="catalog-list">
        {list.map((w) => {
          const expanded = open === w.id;
          return (
            <li key={w.id} class={`catalog-item${form.value.weaponId === w.id ? ' is-current' : ''}`} data-testid={`weapon-${w.id}`}>
              <button type="button" class="catalog-head" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : w.id)}>
                <span class="catalog-name">
                  <strong>{w.name}</strong>
                  {w.designations.length ? <small>{w.designations.join(' · ')}</small> : null}
                </span>
                <span class="tags">
                  <span class="tag">{t(`country.${w.country}`)}</span>
                  <span class="tag">{t(`category.${w.category}`)}</span>
                  <span class={`tag tag-${w.status}`}>{t(`status.${w.status}`)}</span>
                  {w.estimate ? <span class="tag tag-estimate">{t('catalog.estimate')}</span> : null}
                </span>
                <span class={`chevron${expanded ? ' is-open' : ''}`}>
                  <Icon name="chevron" size={16} />
                </span>
              </button>
              {expanded ? (
                <div class="catalog-body">
                  <dl class="facts">
                    <dt>{t('catalog.field.year')}</dt>
                    <dd>{w.year}</dd>
                    <dt>{t('catalog.field.platform')}</dt>
                    <dd>
                      {w.platform.map((p) => t(`platform.${p}`)).join(', ')}
                      {w.carrier ? ` (${w.carrier})` : ''}
                    </dd>
                    {w.rangeKm !== null ? (
                      <>
                        <dt>{t('catalog.field.range')}</dt>
                        <dd>{formatDistance(w.rangeKm * 1000, 3)}</dd>
                      </>
                    ) : null}
                    <dt>{t('catalog.field.warheads')}</dt>
                    <dd>
                      {w.warheadsMax}
                      {w.mirv ? ` (${t('catalog.mirv')})` : ''}
                    </dd>
                    <dt>{t('catalog.field.yield')}</dt>
                    <dd>{w.yieldsKt.map((y) => formatYield(y)).join(' · ')}</dd>
                  </dl>
                  {w.note ? <p class="hint">{w.note}</p> : null}
                  {w.estimate ? <p class="hint warn">{t('catalog.estimate.hint')}</p> : null}
                  <ul class="sources">
                    {w.sources.map((source) => (
                      <li key={source.url}>
                        {source.title}. {source.publisher}, {source.date}.{' '}
                        <button type="button" class="link" onClick={() => openExternal(source.url)}>
                          {t('how.openSource')} <Icon name="external" size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div class="use-row">
                    <span>{t('catalog.use')}</span>
                    {w.yieldsKt.map((y) => (
                      <Button key={y} kind="primary" onClick={() => use(w, y)} testId={`use-${w.id}-${y}`}>
                        {formatYield(y)}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {list.length === 0 ? <p class="hint center">{t('catalog.empty')}</p> : null}
    </Dialog>
  );
}
