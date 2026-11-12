// The frame of the app: top bar, map, side panel, dialogs.

import { lazy, Suspense } from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';
import { t } from '../i18n';
import { syncNativeTheme } from '../lib/platform';
import { MapView } from '../map/MapView';
import { settings } from '../state/settings';
import { detonation } from '../state/simulation';
import { mode, panelOpen, type Mode } from '../state/ui';
import { AccidentPanel } from './AccidentPanel';
import { BusyIndicator } from './BusyIndicator';
import { CatalogDialog } from './CatalogDialog';
import { CloseupDialog } from './CloseupDialog';
import { IconButton, Segmented } from './controls';
import { HowDialog } from './HowDialog';
import { assistantSupported } from '../state/assistant';
import { assistantQuestion } from '../state/ui';
import { AssistantDialog } from './AssistantDialog';
import { Logo } from './Logo';
import { MissilePanel } from './MissilePanel';
import { ResultsPanel } from './ResultsPanel';
import { ScenarioPanel } from './ScenarioPanel';
import { SettingsDialog } from './SettingsDialog';

type DialogName = 'settings' | 'catalog' | 'assistant' | null;

// The globe brings a large library with it, so it is loaded when first needed.
const GlobeView = lazy(() => import('../globe/GlobeView'));

export function App() {
  const [dialog, setDialog] = useState<DialogName>(null);
  // A question asked from a result opens the assistant.
  if (assistantQuestion.value && dialog !== 'assistant') queueMicrotask(() => setDialog('assistant'));
  const open = panelOpen.value;
  const current = mode.value;
  // Once opened, the globe stays loaded; it is only hidden while the map is in front.
  const [globeLoaded, setGlobeLoaded] = useState(false);
  useEffect(() => {
    if (current === 'missiles') setGlobeLoaded(true);
  }, [current]);
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
        <div class="topbar-modes">
          <Segmented<Mode>
            label={t('app.mode')}
            value={current}
            onChange={(value) => (mode.value = value)}
            options={[
              { value: 'detonation', label: t('app.mode.detonation') },
              { value: 'missiles', label: t('app.mode.missiles') },
              { value: 'accident', label: t('app.mode.accident') },
            ]}
            testId="mode"
          />
        </div>
        <div class="topbar-actions">
          <IconButton icon="panel" label={t(open ? 'app.panel.hide' : 'app.panel.show')} onClick={() => (panelOpen.value = !open)} active={open} testId="toggle-panel" />
          {assistantSupported() ? <IconButton icon="assistant" label={t('assistant.title')} onClick={() => setDialog('assistant')} testId="open-assistant" /> : null}
          <IconButton icon="list" label={t('catalog.title')} onClick={() => setDialog('catalog')} testId="open-catalog-top" />
          <IconButton icon="settings" label={t('settings.title')} onClick={() => setDialog('settings')} testId="open-settings" />
        </div>
      </header>
      <div class="hazard-stripe" aria-hidden="true" />

      <main class={`stage${open ? ' panel-open' : ''}`}>
        <div class={`view${current !== 'missiles' ? '' : ' is-hidden'}`}>
          <MapView />
        </div>
        {globeLoaded ? (
          <div class={`view view-globe${current === 'missiles' ? '' : ' is-hidden'}`}>
            <Suspense fallback={null}>
              <GlobeView active={current === 'missiles'} />
            </Suspense>
          </div>
        ) : null}
        <aside class={`panel${open ? '' : ' is-closed'}`} aria-label={t('scenario.title')} data-testid="panel">
          <div class="panel-scroll">
            {current === 'detonation' ? (
              <>
                <ScenarioPanel onOpenCatalog={() => setDialog('catalog')} />
                <ResultsPanel />
              </>
            ) : current === 'missiles' ? (
              <MissilePanel />
            ) : (
              <AccidentPanel />
            )}
            <p class="panel-foot">{t('app.disclaimer')}</p>
          </div>
        </aside>
        <div class="map-hint" data-testid="map-hint">
          {t(current === 'detonation' ? 'map.hint' : current === 'missiles' ? 'globe.hint' : 'accident.map.hint')}
        </div>
      </main>

      {dialog === 'settings' ? <SettingsDialog onClose={() => setDialog(null)} /> : null}
      {dialog === 'catalog' ? <CatalogDialog onClose={() => setDialog(null)} /> : null}
      {dialog === 'assistant' ? <AssistantDialog onClose={() => setDialog(null)} /> : null}
      <CloseupDialog />
      <HowDialog />
      <BusyIndicator />
    </div>
  );
}
