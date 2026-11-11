// The "working" indicator: the mark in the middle of the screen, ring turning,
// electrons circling, with a line saying what the app is doing.

import { t } from '../i18n';
import { busyReasons } from '../state/simulation';
import { Logo } from './Logo';

export function BusyIndicator() {
  const reasons = busyReasons.value;
  if (reasons.length === 0) return null;
  // The most recent reason is the one the user is waiting for.
  const reason = reasons[reasons.length - 1]!;
  return (
    <div class="busy" role="status" aria-live="polite" data-testid="busy">
      <div class="busy-card">
        <Logo size={168} animated variant="full" label={t('busy.label')} />
        <div class="busy-caption">{t(reason)}</div>
      </div>
    </div>
  );
}
