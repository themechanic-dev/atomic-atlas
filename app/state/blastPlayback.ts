// Playing one detonation back in time on the city map: the clock since the burst,
// slow motion, and what is on screen at each moment.

import { batch, computed, effect, signal } from '@preact/signals';
import { CLOUD_RISE_S } from '@physics/timeline/events';
import { blastTimeline, fireballRadiusAtM, type BlastTimeline } from '@physics/timeline/playback';
import { detonation } from './simulation';

/** Seconds since the detonation shown on the map. */
export const blastClock = signal(0);
export const blastPlaying = signal(false);
/** True while the map shows a moment in time instead of the finished picture. */
export const blastActive = signal(false);
/** Seconds of the event per second of watching: real time, slow motion, or fast for the cloud. */
export const BLAST_RATES = [0.1, 0.25, 1, 10] as const;
export const blastRate = signal<number>(1);
let frame = 0;
let lastTick = 0;

/** Counts the flashes, so the map can show each one once. */
export const flashCount = signal(0);
/**
 * True from the moment Play is pressed until the map has put the buildings back as they
 * stood before the burst; the clock waits for it. Released by the map (or by a time limit).
 */
export const blastPreparing = signal(false);
let prepareTimer: ReturnType<typeof setTimeout> | undefined;

/** Called by the map when the picture before the burst is on screen. */
export function blastPrepared(): void {
  if (!blastPreparing.value) return;
  clearTimeout(prepareTimer);
  batch(() => {
    blastPreparing.value = false;
    flashCount.value += 1;
  });
  lastTick = performance.now();
}

export const timeline = computed<BlastTimeline | null>(() => {
  const current = detonation.value;
  return current ? blastTimeline(current.result) : null;
});

export interface BlastFrame {
  timeS: number;
  /** Ground range the blast front has reached, metres. */
  frontM: number;
  fireballM: number;
  /** Strength of the heat pulse now, 0 to 1. */
  heat: number;
  cloudTopM: number;
  /** True once the cloud has risen and fallout begins to come down. */
  falloutShown: boolean;
}

/** What the map draws now, or null for the finished picture. */
export const blastFrame = computed<BlastFrame | null>(() => {
  const line = timeline.value;
  if (!line || !blastActive.value) return null;
  const t = blastClock.value;
  const { peakS, mostEmittedS } = line.heat;
  const heat = t <= 0 ? 0 : t < peakS ? t / peakS : Math.max(0, 1 - (t - peakS) / (mostEmittedS - peakS));
  return {
    timeS: t,
    frontM: line.arrival.rangeAtM(t),
    fireballM: fireballRadiusAtM(line.fireballMaxM, line.heat, t),
    heat,
    cloudTopM: line.cloudTopM(t),
    falloutShown: t >= CLOUD_RISE_S,
  };
});


function tick(now: number): void {
  if (!blastPlaying.value) return;
  const line = timeline.value;
  if (!line) {
    blastPlaying.value = false;
    return;
  }
  if (blastPreparing.value) {
    frame = requestAnimationFrame(tick);
    return;
  }
  const elapsed = Math.min(now - lastTick, 1000) / 1000;
  lastTick = now;
  const next = blastClock.value + elapsed * blastRate.value;
  if (next >= line.durationS) {
    batch(() => {
      blastClock.value = line.durationS;
      blastPlaying.value = false;
    });
    return;
  }
  blastClock.value = next;
  frame = requestAnimationFrame(tick);
}

export function playBlast(): void {
  const line = timeline.value;
  if (!line) return;
  batch(() => {
    if (!blastActive.value || blastClock.value >= line.durationS) {
      blastClock.value = 0;
      blastPreparing.value = true;
      clearTimeout(prepareTimer);
      prepareTimer = setTimeout(blastPrepared, 6000);
    }
    blastActive.value = true;
    blastPlaying.value = true;
  });
  lastTick = performance.now();
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(tick);
}

export function pauseBlast(): void {
  clearTimeout(prepareTimer);
  blastPreparing.value = false;
  blastPlaying.value = false;
  cancelAnimationFrame(frame);
}

export function seekBlast(seconds: number): void {
  const line = timeline.value;
  if (!line) return;
  batch(() => {
    blastActive.value = true;
    blastClock.value = Math.max(0, Math.min(line.durationS, seconds));
  });
}

/** Back to the finished picture with every ring drawn. */
export function endBlastPlayback(): void {
  pauseBlast();
  batch(() => {
    blastActive.value = false;
    blastClock.value = 0;
  });
}

// A new result starts as the finished picture.
effect(() => {
  void detonation.value;
  endBlastPlayback();
});
