// Offline areas of the detailed map: download the area on screen, see what is stored, remove it.

import { useState } from 'preact/hooks';
import { t } from '../i18n';
import { formatNumber } from '../lib/format';
import { finePopulationSupported } from '../data/population100';
import { mapHandle } from '../map/MapView';
import { clearAreas, countTiles, downloadArea, MAX_TILES, offlineAreas } from '../map/offline';
import { settings } from '../state/settings';
import { Button } from './controls';

const OPENFREEMAP = { dark: 'https://tiles.openfreemap.org/styles/dark', light: 'https://tiles.openfreemap.org/styles/liberty' } as const;

export function OfflineAreas() {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, refresh] = useState(0);
  if (settings.value.mapSource !== 'openfreemap' || typeof caches === 'undefined') return null;
  const areas = offlineAreas();
  const map = mapHandle.map;
  const b = map?.getBounds();
  const bounds: [number, number, number, number] | null = b ? [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] : null;
  const count = bounds ? countTiles(bounds) : 0;
  const tooLarge = count > MAX_TILES;
  const megabytes = areas.reduce((sum, a) => sum + a.bytes + (a.population?.bytes ?? 0), 0) / 1e6;
  const allWithPopulation = areas.length > 0 && areas.every((a) => a.population);

  const download = async (): Promise<void> => {
    if (!bounds) return;
    setError(null);
    setProgress(0);
    try {
      await downloadArea(OPENFREEMAP[settings.value.theme], bounds, setProgress);
    } catch {
      setError(t('settings.offline.error'));
    } finally {
      setProgress(null);
      refresh((n) => n + 1);
    }
  };

  return (
    <div class="offline-areas" data-testid="offline-areas">
      <p class="hint">{t('settings.offline.hint')}</p>
      {finePopulationSupported() ? <p class="hint">{t('settings.offline.population')}</p> : null}
      {progress !== null ? (
        <p class="hint" data-testid="offline-progress">
          {t('settings.offline.downloading', { percent: Math.round(progress * 100) })}
        </p>
      ) : (
        <Button onClick={() => void download()} disabled={!bounds || tooLarge} testId="offline-download">
          {t('settings.offline.download', { tiles: formatNumber(count, 3) })}
        </Button>
      )}
      {tooLarge ? <p class="hint warn">{t('settings.offline.tooLarge')}</p> : null}
      {error ? <p class="hint warn">{error}</p> : null}
      {areas.length > 0 ? (
        <p class="hint" data-testid="offline-stored">
          {t(areas.length === 1 ? 'settings.offline.storedOne' : 'settings.offline.stored', { count: areas.length, mb: formatNumber(megabytes, 3) })}{' '}
          {allWithPopulation ? `${t('settings.offline.withPopulation')} ` : null}
          <button
            type="button"
            class="link"
            onClick={() => {
              void clearAreas().then(() => refresh((n) => n + 1));
            }}
            data-testid="offline-clear"
          >
            {t('settings.offline.clear')}
          </button>
        </p>
      ) : null}
    </div>
  );
}
