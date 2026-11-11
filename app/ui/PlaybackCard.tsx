// "Watch it happen": plays the detonation back in time on the map, in real time or
// slow motion, with the moments worth knowing listed against the clock.

import { t } from '../i18n';
import { formatHeight, formatNumber } from '../lib/format';
import {
  blastActive,
  blastClock,
  blastFrame,
  blastPlaying,
  blastPreparing,
  BLAST_RATES,
  blastRate,
  endBlastPlayback,
  pauseBlast,
  playBlast,
  seekBlast,
  timeline,
} from '../state/blastPlayback';
import { settings } from '../state/settings';
import { explaining } from '../state/simulation';
import { Button, HowButton, Segmented } from './controls';

/** Seconds with one decimal below ten, whole seconds to a minute, then minutes and seconds. */
export function formatSeconds(seconds: number): string {
  const s = Math.max(0, seconds);
  if (s < 10) return `${formatNumber(Math.round(s * 10) / 10, 2)} s`;
  if (s < 60) return `${Math.round(s)} s`;
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60) % 60).padStart(2, '0')} min`;
}

export function PlaybackCard() {
  void settings.value;
  const line = timeline.value;
  if (!line) return null;
  const active = blastActive.value;
  const frame = blastFrame.value;
  const now = blastClock.value;
  // The slider is stretched so the first seconds, where most happens, take half of it.
  const toSlider = (seconds: number): number => Math.round(1000 * Math.sqrt(Math.max(0, seconds) / line.durationS));
  const fromSlider = (value: number): number => line.durationS * (value / 1000) ** 2;

  return (
    <div class="card" data-testid="playback-blast">
      <div class="card-head">
        <h3>{t('playback.title')}</h3>
        <span class="card-head-actions">
          <span class="clock" data-testid="blast-clock">
            T+ {formatSeconds(active ? now : 0)}
          </span>
          <HowButton onClick={() => (explaining.value = 'timeline')} testId="how-timeline" />
        </span>
      </div>
      <input
        class="slider"
        type="range"
        min={0}
        max={1000}
        step={1}
        value={active ? toSlider(now) : 0}
        onInput={(event) => {
          pauseBlast();
          seekBlast(fromSlider(Number(event.currentTarget.value)));
        }}
        aria-label={t('playback.title')}
        data-testid="blast-slider"
      />
      <div class="playback-row">
        <Button kind="primary" onClick={() => (blastPlaying.value ? pauseBlast() : playBlast())} testId="blast-toggle">
          {blastPreparing.value ? t('playback.preparing') : blastPlaying.value ? t('missiles.pause') : t('missiles.play')}
        </Button>
        <Segmented<string>
          label={t('missiles.speed')}
          value={String(blastRate.value)}
          onChange={(value) => (blastRate.value = Number(value))}
          options={BLAST_RATES.map((rate) => ({ value: String(rate), label: `×${rate}` }))}
          testId="blast-rate"
        />
      </div>
      <ul class="events" data-testid="blast-events">
        {line.events.map((event) => (
          <li key={event.id} class={active && now >= event.timeS ? 'is-past' : ''}>
            <button type="button" class="event-time" onClick={() => seekBlast(event.timeS)} title={t('playback.jump')}>
              {formatSeconds(event.timeS)}
            </button>
            <span>{t(`playback.event.${event.id}`)}</span>
          </li>
        ))}
      </ul>
      {frame ? (
        <p class="hint" data-testid="blast-cloud">
          {t('playback.cloud', { height: formatHeight(frame.cloudTopM) })}
        </p>
      ) : (
        <p class="hint">{t('playback.hint')}</p>
      )}
      {active ? (
        <Button kind="ghost" onClick={endBlastPlayback} testId="blast-end">
          {t('playback.end')}
        </Button>
      ) : null}
    </div>
  );
}
