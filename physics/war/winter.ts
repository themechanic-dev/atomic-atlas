// Nuclear winter as published, not calculated: the war scenarios of Xia et al. (2022),
// Table 1, with the soot each puts into the stratosphere, the people killed directly and
// the people without food at the end of the second year. The app does not work out soot
// from the user's scenario: how much burns depends on what is hit, which it does not model.
// It only points to the published case closest in the number and yield of weapons.

export interface WinterCase {
  sootTg: number;
  weapons: number;
  yieldKt: number;
  directDeaths: number;
  /** People who would starve by the end of year 2 (no international trade, partial livestock case). */
  withoutFoodYear2: number;
}

export const XIA_2022: readonly WinterCase[] = [
  { sootTg: 5, weapons: 100, yieldKt: 15, directDeaths: 27e6, withoutFoodYear2: 255e6 },
  { sootTg: 16, weapons: 250, yieldKt: 15, directDeaths: 52e6, withoutFoodYear2: 926e6 },
  { sootTg: 27, weapons: 250, yieldKt: 50, directDeaths: 97e6, withoutFoodYear2: 1_426e6 },
  { sootTg: 37, weapons: 250, yieldKt: 100, directDeaths: 127e6, withoutFoodYear2: 2_081e6 },
  { sootTg: 47, weapons: 500, yieldKt: 100, directDeaths: 164e6, withoutFoodYear2: 2_512e6 },
  { sootTg: 150, weapons: 4_400, yieldKt: 100, directDeaths: 360e6, withoutFoodYear2: 5_341e6 },
];

/** Largest drop of the average 2 m air temperature over crop regions, °C (Xia et al. 2022, Results). */
export const XIA_2022_COOLING_C = { at5Tg: 1.5, at150Tg: 14.8 } as const;

/**
 * Index of the published case closest to a scenario, comparing the total yield on the
 * logarithm (the soot of the study grows with the yield on cities); -1 for no weapons.
 */
export function closestCase(totalYieldKt: number): number {
  if (!(totalYieldKt > 0)) return -1;
  let best = 0;
  let bestDistance = Infinity;
  XIA_2022.forEach((c, i) => {
    const distance = Math.abs(Math.log(totalYieldKt / (c.weapons * c.yieldKt)));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  });
  return best;
}
