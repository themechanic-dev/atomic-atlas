// What happens downstream if a dam fails: the peak flow out of the breach and how it
// falls with distance down the valley.
//
// Peak outflow: Froehlich (1995), Qp = 0.607 Vw^0.295 Hw^1.24 (m3/s, Vw in m3, Hw in m),
// as quoted by Ackers, Pether & Tarrant (2006), who found it within about 0.1 to 7 times
// the peak flows of over 100 detailed dam-break studies. It was fitted to failures of
// earthfill dams; for other dams it is an order-of-magnitude figure.
// Fall with distance: the "attenuation length scale" La of CIRIA C542 and the UK Interim
// guide to quantitative risk assessment, the distance over which the peak falls to 37 %
// (Q = Qp e^(-x/La)). Ackers et al. found La between about 2 and 33 km for 20 dams, with
// no usable correlation; the middle of that range is used here.
//
// This is not a reason to think any particular dam would fail: whether a dam fails, and
// how, depends on its structure, which no public model of nuclear effects describes.

import type { Explanation } from '../sources';

/** The attenuation length scale used, metres (middle of Ackers et al. 2006, Figure 3). */
export const ATTENUATION_LENGTH_M = 10_000;
/** The range of the attenuation length scale in Ackers et al. 2006, Figure 3, metres. */
export const ATTENUATION_RANGE_M = [2_000, 33_000] as const;

export interface Reservoir {
  /** Volume of water behind the dam, m3. */
  volumeM3: number;
  /** Depth of water above the bottom of the breach, m (the height of the dam is the upper estimate). */
  headM: number;
}

/** Peak outflow through the breach, m3/s (Froehlich 1995). */
export function peakOutflowM3s(reservoir: Reservoir): number {
  if (!(reservoir.volumeM3 > 0) || !(reservoir.headM > 0)) return 0;
  return 0.607 * Math.pow(reservoir.volumeM3, 0.295) * Math.pow(reservoir.headM, 1.24);
}

/** Peak flow at a distance down the flood path, m3/s. */
export function peakFlowAt(peakM3s: number, distanceM: number, attenuationM = ATTENUATION_LENGTH_M): number {
  return peakM3s * Math.exp(-Math.max(0, distanceM) / attenuationM);
}

/** Distance down the flood path at which the peak has fallen to a given flow, metres. */
export function distanceToFlow(peakM3s: number, flowM3s: number, attenuationM = ATTENUATION_LENGTH_M): number {
  if (!(peakM3s > 0) || !(flowM3s > 0) || flowM3s >= peakM3s) return 0;
  return attenuationM * Math.log(peakM3s / flowM3s);
}

export function explainDamBreak(reservoir: Reservoir): Explanation[] {
  const qp = peakOutflowM3s(reservoir);
  return [
    {
      id: 'dam.outflow',
      formula: 'Qp = 0.607 Vw^0.295 Hw^1.24',
      inputs: [
        { symbol: 'Vw', labelKey: 'reservoirVolume', value: reservoir.volumeM3, quantity: 'volume' },
        { symbol: 'Hw', labelKey: 'damHead', value: reservoir.headM, quantity: 'height' },
      ],
      outputs: [{ symbol: 'Qp', labelKey: 'peakOutflow', value: qp, quantity: 'flow' }],
      sources: ['froehlich1995', 'ackers2006'],
      where: 'Froehlich (1995), as quoted by Ackers, Pether & Tarrant (2006)',
      uncertainty: 'about 0.1 to 7 times detailed studies (Ackers et al. 2006, Figure 2); fitted to earthfill dams',
    },
    {
      id: 'dam.attenuation',
      formula: 'Q(x) = Qp e^(−x / La),  La ≈ 10 km',
      inputs: [{ symbol: 'La', labelKey: 'attenuationLength', value: ATTENUATION_LENGTH_M, quantity: 'length' }],
      outputs: [],
      sources: ['ackers2006'],
      where: 'Ackers, Pether & Tarrant (2006), Figure 3 (attenuation length scale of CIRIA C542)',
      uncertainty: 'La between about 2 and 33 km in the 20 cases studied',
    },
  ];
}
