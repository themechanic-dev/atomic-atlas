// The frame of the app: top bar, map, side panel, dialogs.

import { useEffect, useState } from 'preact/hooks';
import { t } from '../i18n';
import { syncNativeTheme } from '../lib/platform';
import { MapView } from '../map/MapView';
import { settings } from '../state/settings';
import { detonation } from '../state/simulation';
import { panelOpen } from '../state/ui';
import { BusyIndicator } from './BusyIndicator';
import { CatalogDialog } from './CatalogDialog';
import { IconButton } from './controls';
import { HowDialog } from './HowDialog';
import { Logo } from './Logo';
import { ResultsPanel } from './ResultsPanel';
import { ScenarioPanel } from './ScenarioPanel';
import { SettingsDialog } from './SettingsDialog';

type DialogName = 'settings' | 'catalog' | null;

export function App() {
  const [dialog, setDialog] = useState<DialogName>(null);
  const open = panelOpen.value;
  const theme = settings.value.theme;

  useEffect(() => {
    syncNativeTheme(theme);
  }, [theme]);

  // A new result opens the panel, so the numbers are never hidden.
  const resultId = detonation.value?.id;
  useEffect(() => {
    if (resultId !== undefined) panelOpen.value = true;
  }, [resultId]);

  return (
    <div class="app" data-testid="app">
      <header class="topbar">
        <div class="brand">
          <Logo size={34} variant="simple" />
          <div class="brand-text">
            <span class="brand-name">Atomic Atlas</span>
            <span class="brand-by">by The Mechanic</span>
          </div>
        </div>
        <div class="topbar-title">{t('app.mode.detonation')}</div>
        <div class="topbar-actions">
          <IconButton icon="panel" label={t(open ? 'app.panel.hide' : 'app.panel.show')} onClick={() => (panelOpen.value = !open)} active={open} testId="toggle-panel" />
          <IconButton icon="list" label={t('catalog.title')} onClick={() => setDialog('catalog')} testId="open-catalog-top" />
          <IconButton icon="settings" label={t('settings.title')} onClick={() => setDialog('settings')} testId="open-settings" />
        </div>
      </header>
      <div class="hazard-stripe" aria-hidden="true" />

      <main class="stage">
        <MapView />
        <aside class={`panel${open ? '' : ' is-closed'}`} aria-label={t('scenario.title')} data-testid="panel">
          <div class="panel-scroll">
            <ScenarioPanel onOpenCatalog={() => setDialog('catalog')} />
            <ResultsPanel />
            <p class="panel-foot">{t('app.disclaimer')}</p>
          </div>
        </aside>
        <div class="map-hint" data-testid="map-hint">
          {t('map.hint')}
        </div>
      </main>

      {dialog === 'settings' ? <SettingsDialog onClose={() => setDialog(null)} /> : null}
      {dialog === 'catalog' ? <CatalogDialog onClose={() => setDialog(null)} /> : null}
      <HowDialog />
      <BusyIndicator />
    </div>
  );
}
