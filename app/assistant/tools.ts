// The tools the assistant may use: functions of the app, nothing else (ΣΧΕΔΙΟ §8).
// It can set the yield and type of burst, run the simulation where the user has placed
// ground zero, compare yields, look up the public catalog and read the app's explanations.
// It cannot place ground zero: the user does that on the map.

import { detonate, DEFAULT_SCENARIO, type DetonationResult } from '@physics/detonation';
import { WEAPONS } from '../data/catalog';
import { dictionaryFor, t } from '../i18n';
import { formatDistance } from '../lib/format';
import { casualties, detonation, form, groundZero, runDetonation, updateForm } from '../state/simulation';
import { mode } from '../state/ui';
import { water } from '../state/water';

export interface ToolDefinition {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

const EFFECTS = ['fireball', 'blast20', 'blast5', 'blast2', 'blast1', 'burn3', 'burn2', 'burn1', 'radiation450', 'fallout', 'casualties', 'water'] as const;

export const TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'set_detonation',
      description: 'Set the yield and the type of burst for the detonation at the ground zero the user has placed on the map.',
      parameters: {
        type: 'object',
        properties: {
          yield_kt: { type: 'number', description: 'Yield in kilotons (0.01 to 100000)' },
          burst: { type: 'string', enum: ['air', 'surface'], description: 'Air burst at the height that maximises damage to houses, or a burst at the surface' },
        },
        required: ['yield_kt'],
      },
    },
  },
  {
    type: 'function',
    function: { name: 'run_simulation', description: 'Run the simulation again with the current settings, after set_detonation changed them, and return the main results. Not needed to read the result already on screen.', parameters: { type: 'object', properties: {} } },
  },
  {
    type: 'function',
    function: { name: 'get_results', description: 'Return the results of the simulation now on screen. Use it for every question about the result the user sees.', parameters: { type: 'object', properties: {} } },
  },
  {
    type: 'function',
    function: {
      name: 'compare_yields',
      description: 'Only when the user asks to compare different yields: the radius of the main effects for up to five yields, without changing the map. Not for the result on screen.',
      parameters: {
        type: 'object',
        properties: { yields_kt: { type: 'array', items: { type: 'number' } }, burst: { type: 'string', enum: ['air', 'surface'] } },
        required: ['yields_kt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'lookup_weapon',
      description: 'Look up weapons in the public catalog of the app by name or designation.',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'explain_effect',
      description: 'Return the app explanation of one effect: what it is, the formula and the published source.',
      parameters: { type: 'object', properties: { effect: { type: 'string', enum: [...EFFECTS] } }, required: ['effect'] },
    },
  },
];

const round = (value: number, digits = 2): number => Number(value.toPrecision(digits + 1));
const km = (metres: number): number => round(metres / 1000, 2);

function summarise(result: DetonationResult): Record<string, unknown> {
  // An effect that does not reach the ground at this yield and height is said so in words,
  // so the model does not read a missing number as zero.
  const radius = (id: string): number | string => {
    const ring = result.rings.find((r) => r.id === id);
    return ring && ring.radiusM > 0 ? km(ring.radiusM) : 'not reached on the ground';
  };
  return {
    yield_kt: result.scenario.yieldKt,
    burst: result.heightM > 0 ? 'air' : 'surface',
    burst_height_m: Math.round(result.heightM),
    radius_km: {
      fireball: radius('fireball'),
      blast_20psi_concrete_buildings_destroyed: radius('blast20'),
      blast_5psi_most_houses_collapse: radius('blast5'),
      blast_2psi: radius('blast2'),
      blast_1psi_windows_break: radius('blast1'),
      burns_third_degree: radius('burn3'),
      burns_first_degree: radius('burn1'),
      radiation_450rad: radius('radiation450'),
    },
    significant_local_fallout: result.fallout.significant,
  };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function currentResults(): Promise<Record<string, unknown>> {
  const current = detonation.value;
  if (!current) return { error: 'No simulation on screen yet.' };
  // Casualties follow once the population data has been read.
  for (let i = 0; i < 40 && casualties.value.state === 'loading'; i++) await sleep(250);
  const c = casualties.value;
  const w = water.value;
  return {
    ...summarise(current.result),
    casualties:
      c.state === 'ready' && c.estimate
        ? { killed_low: c.estimate.killed.low, killed_high: c.estimate.killed.high, injured_low: c.estimate.injured.low, injured_high: c.estimate.injured.high }
        : 'not available',
    water:
      w && w.id === current.id && w.state === 'ready' && w.summary
        ? { depth_m: w.depthM, waves_3m_out_to_km: km(w.summary.rangeTo3mM), waves_1m_out_to_km: km(w.summary.rangeTo1mM), burst_in_water: w.inWater }
        : undefined,
  };
}

function explanation(effect: string): Record<string, unknown> {
  const en = dictionaryFor('en');
  const current = detonation.value?.result;
  const ring = current?.rings.find((r) => r.id === effect);
  const id =
    ring?.explanation?.id ??
    (effect === 'water' ? 'water.height' : effect.startsWith('burn') ? 'thermal' : effect.startsWith('blast') ? 'blast' : effect.startsWith('radiation') ? 'radiation' : effect);
  const text = (key: string): string | undefined => en[key as keyof typeof en] as string | undefined;
  return {
    effect,
    text: text(`how.${id}.body`) ?? null,
    formula: ring?.explanation?.formula,
    where: ring?.explanation?.where,
    uncertainty: ring?.explanation?.uncertainty,
    sources: ring?.explanation?.sources,
  };
}

/** Runs one tool call and returns what the model should read. */
export async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'set_detonation': {
      const yieldKt = Math.min(100_000, Math.max(0.01, Number(args.yield_kt)));
      if (!Number.isFinite(yieldKt)) return { error: 'yield_kt must be a number' };
      updateForm({ yieldKt, burstMode: args.burst === 'surface' ? 'surface' : 'airburst', weaponId: null, fissionAuto: true });
      mode.value = 'detonation';
      return { ok: true, yield_kt: yieldKt, burst: args.burst === 'surface' ? 'surface' : 'air', ground_zero_placed: groundZero.value !== null };
    }
    case 'run_simulation': {
      if (!groundZero.value) return { error: 'Ground zero is not placed. Ask the user to click the map where the burst should be.' };
      mode.value = 'detonation';
      await runDetonation();
      return currentResults();
    }
    case 'get_results':
      return currentResults();
    case 'compare_yields': {
      const list = Array.isArray(args.yields_kt) ? args.yields_kt.map(Number).filter((y) => Number.isFinite(y) && y > 0).slice(0, 5) : [];
      if (list.length === 0) return { error: 'yields_kt must be a list of numbers' };
      return list.map((y) => summarise(detonate({ ...DEFAULT_SCENARIO, yieldKt: Math.min(100_000, Math.max(0.01, y)), burstMode: args.burst === 'surface' ? 'surface' : 'airburst' })));
    }
    case 'lookup_weapon': {
      const q = String(args.query ?? '').toLowerCase().trim();
      if (!q) return [];
      return WEAPONS.filter((w) => w.name.toLowerCase().includes(q) || w.designations.some((d) => d.toLowerCase().includes(q)))
        .slice(0, 5)
        .map((w) => ({
          name: w.name,
          country: w.country,
          category: w.category,
          yields_kt: w.yieldsKt,
          range_km: w.rangeKm,
          warheads: w.warheadsMax,
          status: w.status,
          year: w.year,
          estimate: w.estimate,
          source: w.sources[0]?.title,
        }));
    }
    case 'explain_effect':
      return explanation(String(args.effect ?? ''));
    default:
      return { error: `unknown tool ${name}` };
  }
}

/** A line about the app's state for the model: what is set and what is on screen. */
export function stateNote(): string {
  const f = form.value;
  const shown = detonation.value?.result;
  // The distances on screen go into the note itself, named as the app names them in the
  // user's language: a small model then answers about the result without choosing a tool.
  const distances = shown?.rings
    .filter((r) => r.radiusM > 0)
    .map((r) => {
      // The long name says what happens, the short one the threshold (5 psi): the user asks by either.
      const name = t(`effect.${r.id}`);
      const short = t(`effect.${r.id}.short`);
      return `${name}${short && short !== name && !short.startsWith('effect.') ? ` (${short})` : ''}: ${formatDistance(r.radiusM)}`;
    })
    .join('; ');
  const onScreen = shown
    ? `a result is on screen (${shown.scenario.yieldKt} kt, ${shown.heightM > 0 ? `burst at ${Math.round(shown.heightM)} m above the ground` : 'burst at the surface'}). Distances from ground zero on screen, as the app names them: ${distances}. Answer questions about these distances from this list; for casualties, fallout or water waves, call get_results`
    : 'no result yet';
  return `App state: yield ${f.yieldKt} kt, ${f.burstMode === 'surface' ? 'surface burst' : f.burstMode === 'custom' ? `burst at ${f.heightM} m` : 'air burst'}; ground zero ${groundZero.value ? 'placed' : 'not placed'}; ${onScreen}.`;
}
