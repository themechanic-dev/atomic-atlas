// The accident simulator: a release of radioactive material into the air at a place the
// user chooses, with a wind, and the dose it gives downwind.
//
// The size of the release is that of a historical accident, or a share of one. Nothing here
// says how a release could come about; it starts from the activity in the air.

import { computed, signal } from '@preact/signals';
import accidentsJson from '@data/accidents.json';
import type { StabilityClass } from '@physics/dispersion/plume';
import { assessRelease, doseAt, type PointDose, type Release, type ReleaseResult } from '@physics/dispersion/release';
import type { SourceId } from '@physics/sources';
import type { LngLat } from '../lib/geo';

export interface Accident {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: string;
  nuclides: Array<{ nuclide: string; activityBq: number }>;
  source: SourceId;
  note: string;
  /** How long the release lasted, minutes, where the source says. */
  durationMin?: number;
  /** How high the material rose, metres, where the source says. */
  releaseHeightM?: number;
}

export const ACCIDENTS = accidentsJson as Accident[];

/** Shares of a historical release that can be chosen for "what if". */
export const SCALES = [0.001, 0.01, 0.1, 1] as const;

export interface AccidentForm {
  accidentId: string;
  /** Share of the historical release, 0 to 1. */
  scale: number;
  stability: StabilityClass;
  /** Wind speed at 10 m, m/s. */
  wind10Ms: number;
  /** Direction the wind blows from, degrees clockwise from north. */
  windFromDeg: number;
  releaseHeightM: number;
  durationMin: number;
}

export const DEFAULT_ACCIDENT_FORM: AccidentForm = {
  accidentId: 'fukushima-2011',
  scale: 0.01,
  stability: 'D',
  wind10Ms: 4,
  windFromDeg: 270,
  releaseHeightM: 50,
  durationMin: 60,
};

export const accidentForm = signal<AccidentForm>({ ...DEFAULT_ACCIDENT_FORM });
/** Where the release happens; null until the user clicks the map or loads a historical place. */
export const accidentSite = signal<LngLat | null>(null);

export function updateAccidentForm(patch: Partial<AccidentForm>): void {
  accidentForm.value = { ...accidentForm.value, ...patch };
}

export const chosenAccident = computed<Accident>(() => ACCIDENTS.find((a) => a.id === accidentForm.value.accidentId) ?? ACCIDENTS[0]!);

/** The release described by the form. */
export function buildRelease(form: AccidentForm): Release {
  const accident = ACCIDENTS.find((a) => a.id === form.accidentId) ?? ACCIDENTS[0]!;
  return {
    nuclides: accident.nuclides.map((entry) => ({ nuclide: entry.nuclide, activityBq: entry.activityBq * form.scale })),
    conditions: { stability: form.stability, wind10Ms: form.wind10Ms, releaseHeightM: form.releaseHeightM, durationMin: form.durationMin },
  };
}

export interface AccidentRun {
  id: number;
  at: LngLat;
  form: AccidentForm;
  accident: Accident;
  result: ReleaseResult;
  /** Direction the plume travels towards, degrees clockwise from north. */
  towardsDeg: number;
  /** Doses on the centreline at fixed distances, for the table. */
  table: Array<{ rangeM: number; dose: PointDose }>;
}

export const TABLE_RANGES_M = [1_000, 3_000, 10_000, 30_000, 100_000] as const;

export const accidentRun = signal<AccidentRun | null>(null);
let runCounter = 0;

export function runAccident(): void {
  const at = accidentSite.value;
  if (!at) return;
  const form = { ...accidentForm.value };
  const release = buildRelease(form);
  accidentRun.value = {
    id: ++runCounter,
    at,
    form,
    accident: ACCIDENTS.find((a) => a.id === form.accidentId) ?? ACCIDENTS[0]!,
    result: assessRelease(release),
    towardsDeg: (form.windFromDeg + 180) % 360,
    table: TABLE_RANGES_M.map((rangeM) => ({ rangeM, dose: doseAt(release, rangeM) })),
  };
}

export function clearAccident(): void {
  accidentRun.value = null;
  accidentSite.value = null;
}

/** Puts the release at the place of the chosen historical accident. */
export function useHistoricalPlace(): void {
  const accident = chosenAccident.value;
  accidentSite.value = { lat: accident.lat, lng: accident.lng };
  // With the place come the duration and height the source reports, where it does.
  const patch: Partial<AccidentForm> = {};
  if (accident.durationMin !== undefined) patch.durationMin = accident.durationMin;
  if (accident.releaseHeightM !== undefined) patch.releaseHeightM = accident.releaseHeightM;
  updateAccidentForm(patch);
}
