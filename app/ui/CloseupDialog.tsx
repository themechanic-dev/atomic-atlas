// "From close up": what the effects at one distance do to ordinary things, shown in a
// small 3D scene and played against the clock, with the numbers of that point beside it.

import { useEffect, useRef, useState } from 'preact/hooks';
import { closeupState, tinderIgnitionCal, type CloseupState } from '@physics/damage/closeup';
import type { Moment, SceneHandle, SceneKind } from '../closeup/scene';
import { t } from '../i18n';
import { formatDistance, formatExposure, formatPressure, formatSpeed } from '../lib/format';
import { timeline } from '../state/blastPlayback';
import { settings } from '../state/settings';
import { detonation } from '../state/simulation';
import { closeupRange } from '../state/ui';
import { Button, Dialog, Segmented } from './controls';
import { formatSeconds } from './PlaybackCard';

const KINDS: readonly SceneKind[] = ['street', 'airport', 'power', 'refinery', 'harbour'];
/** Seconds shown before the burst and after the blast wave has passed. */
const LEAD_S = 1;
const TAIL_S = 7;

/** What the scene shows at a time after the burst. */
export function momentAt(timeS: number, arrivalS: number, heatPeakS: number, heatEndS: number, firesStart: boolean): Moment {
  if (timeS < 0) return { flash: 0, heat: 0, blast: 0, fire: 0 };
  const flash = Math.max(0, 1 - timeS / 0.5);
  const heat = timeS < heatPeakS ? timeS / heatPeakS : Math.max(0, 1 - (timeS - heatPeakS) / Math.max(heatEndS - heatPeakS, 1e-6));
  const blast = Math.min(1, Math.max(0, (timeS - arrivalS) / 1.4));
  const fire = firesStart ? Math.min(1, Math.max(0, (timeS - heatPeakS) / 3)) : 0;
  return { flash, heat, blast, fire };
}

export function CloseupDialog() {
  void settings.value;
  const range = closeupRange.value;
  const current = detonation.value;
  const line = timeline.value;
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<SceneHandle | null>(null);
  const [kind, setKind] = useState<SceneKind>('street');
  const [failed, setFailed] = useState(false);
  const [time, setTime] = useState(-LEAD_S);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const open = range !== null && current !== null && line !== null;

  const arrivalS = open ? line.arrival.timeAtS(range) : 0;
  const endS = arrivalS + TAIL_S;
  const state: CloseupState | null = open
    ? closeupState({
        yieldKt: current.result.scenario.yieldKt,
        overpressurePsi: current.result.effects.overpressurePsi(range),
        exposureCal: current.result.effects.radiantExposure(range),
        arrivalS,
      })
    : null;

  // The scene is made when the dialog opens; its library is loaded only then.
  useEffect(() => {
    if (!open || !canvas.current) return;
    let cancelled = false;
    let made: SceneHandle | null = null;
    void import('../closeup/scene').then(({ createScene }) => {
      if (cancelled || !canvas.current) return;
      made = createScene(canvas.current, settings.value.theme);
      scene.current = made;
      setFailed(made === null);
      made?.setKind(kind);
    });
    const onResize = (): void => scene.current?.resize();
    window.addEventListener('resize', onResize);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', onResize);
      made?.dispose();
      scene.current = null;
    };
  }, [open]);

  useEffect(() => {
    scene.current?.setKind(kind);
  }, [kind]);

  // The clock.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const step = (now: number): void => {
      const elapsed = Math.min(now - last, 500) / 1000;
      last = now;
      setTime((value) => {
        const next = value + elapsed * rate;
        if (next >= endS) {
          setPlaying(false);
          return endS;
        }
        return next;
      });
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, rate, endS]);

  // The picture follows the state and the clock. Fires flicker, so they keep being redrawn.
  const moment = open && state ? momentAt(time, arrivalS, line.heat.peakS, line.heat.mostEmittedS, state.firesStart) : null;
  useEffect(() => {
    if (!scene.current || !state || !moment) return;
    scene.current.setState(state);
    scene.current.setMoment(moment);
  });

  // A new distance starts the story again.
  useEffect(() => {
    setTime(-LEAD_S);
    setPlaying(false);
  }, [range]);

  if (!open || !state) return null;

  const furthest = Math.max(current.result.maxRadiusM * 1.3, 500);
  const nearest = Math.max(50, furthest / 400);
  const toSlider = (metres: number): number => Math.round((1000 * Math.log(metres / nearest)) / Math.log(furthest / nearest));
  const fromSlider = (value: number): number => nearest * Math.pow(furthest / nearest, value / 1000);
  const psi = current.result.effects.overpressurePsi(range);
  const exposure = current.result.effects.radiantExposure(range);
  const findings: string[] = [
    t(`closeup.building.${state.building.id}`),
    t(state.windowsBroken ? 'closeup.windows.broken' : 'closeup.windows.whole'),
    t(state.vehiclesOverturned ? 'closeup.vehicles.overturned' : 'closeup.vehicles.standing'),
    t(state.firesStart ? 'closeup.fires.start' : 'closeup.fires.none', { exposure: formatExposure(tinderIgnitionCal(current.result.scenario.yieldKt)) }),
  ];
  if (kind === 'airport') findings.push(t(`infra.airport.${state.aircraft}`));
  if (kind === 'power') findings.push(t(`infra.power.${psi >= 5.5 ? 'beyond' : psi >= 5 ? 'moderate' : psi >= 1.7 ? 'light' : 'none'}`));

  return (
    <Dialog title={t('closeup.title')} onClose={() => (closeupRange.value = null)} wide testId="closeup-dialog">
      <div class="closeup">
        <div class="closeup-stage">
          <canvas ref={canvas} class="closeup-canvas" data-testid="closeup-canvas" />
          {failed ? <p class="closeup-failed">{t('closeup.failed')}</p> : null}
          <span class="closeup-clock" data-testid="closeup-clock">
            {time < 0 ? t('closeup.before') : `T+ ${formatSeconds(time)}`}
          </span>
          <span class="closeup-arrow">← {t('closeup.towardsBurst')}</span>
        </div>
        <Segmented<SceneKind>
          label={t('closeup.scene')}
          value={kind}
          onChange={setKind}
          options={KINDS.map((value) => ({ value, label: t(`closeup.scene.${value}`) }))}
          testId="closeup-kind"
        />
        <label class="closeup-range">
          <span>
            {t('closeup.distance')}: <strong data-testid="closeup-range">{formatDistance(range)}</strong>
          </span>
          <input
            class="slider"
            type="range"
            min={0}
            max={1000}
            value={toSlider(Math.min(Math.max(range, nearest), furthest))}
            onInput={(event) => (closeupRange.value = fromSlider(Number(event.currentTarget.value)))}
            data-testid="closeup-range-slider"
          />
        </label>
        <div class="playback-row">
          <Button
            kind="primary"
            onClick={() => {
              if (time >= endS) setTime(-LEAD_S);
              setPlaying(!playing);
            }}
            testId="closeup-toggle"
          >
            {playing ? t('missiles.pause') : t('missiles.play')}
          </Button>
          <input
            class="slider"
            type="range"
            min={-LEAD_S * 100}
            max={Math.ceil(endS * 100)}
            value={Math.round(time * 100)}
            onInput={(event) => {
              setPlaying(false);
              setTime(Number(event.currentTarget.value) / 100);
            }}
            aria-label={t('playback.title')}
            data-testid="closeup-time"
          />
          <Segmented<string>
            label={t('missiles.speed')}
            value={String(rate)}
            onChange={(value) => setRate(Number(value))}
            options={[0.25, 1].map((value) => ({ value: String(value), label: `×${value}` }))}
            testId="closeup-rate"
          />
        </div>
        <dl class="facts closeup-facts" data-testid="closeup-facts">
          <dt>{t('quantity.overpressure')}</dt>
          <dd>{formatPressure(psi)}</dd>
          <dt>{t('quantity.windSpeed')}</dt>
          <dd>{formatSpeed(state.windMs)}</dd>
          <dt>{t('quantity.radiantExposure')}</dt>
          <dd>{formatExposure(exposure)}</dd>
          <dt>{t('quantity.blastArrival')}</dt>
          <dd>{formatSeconds(arrivalS)}</dd>
        </dl>
        <ul class="closeup-findings" data-testid="closeup-findings">
          {findings.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
        <p class="hint">{t('closeup.hint')}</p>
      </div>
    </Dialog>
  );
}
