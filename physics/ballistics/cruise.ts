// Speed and height of a cruise missile, from what is published about it.
//
// A cruise missile flies through the air like an aircraft at a steady speed; its flight time
// is the distance over that speed. Where a source gives the speed, it is used:
//   - in km/h, as given
//   - as a Mach number, turned into km/h with the speed of sound of the U.S. Standard
//     Atmosphere 1976 where the missile flies: at its 100 m for a subsonic missile, which
//     follows the terrain, and in the stratosphere (11 to 20 km) for a supersonic one, whose
//     published speed and range are for flight at high altitude (for example the ASMP:
//     "Mach 3 at high altitude, Mach 2 at low altitude", range "300 km at high altitude").
//     In the stratosphere the speed of sound is the same at every height, 295 m/s, so the
//     exact height does not change the time.
// Where no speed is published, a typical subsonic speed is used.

import { standardAtmosphere } from './atmosphere';
import { SUBSONIC_CRUISE_SPEED } from './trajectory';

/** Height of a subsonic cruise missile: it follows the ground at tens of metres. */
export const CRUISE_LOW_ALTITUDE_M = 100;
/** Height at which a supersonic cruise missile is drawn: in the stratosphere, where sources put its fastest flight. */
export const CRUISE_HIGH_ALTITUDE_M = 15_000;

export interface PublishedCruiseSpeed {
  /** Published speed as a Mach number. */
  speedMach?: number | null;
  /** Published speed in km/h. */
  speedKmh?: number | null;
}

export interface CruiseSpeed {
  /** Speed over the ground, m/s. */
  speedMs: number;
  /** Height the missile flies at, metres. */
  altitudeM: number;
  /** The published Mach number, when the speed was given as one. */
  mach: number | null;
  /** Speed of sound used to turn the Mach number into a speed, m/s. */
  soundSpeedMs: number | null;
  /** False when no speed is published and the typical subsonic speed is used. */
  published: boolean;
  /** True for a supersonic missile flying high. */
  high: boolean;
}

const SEA_LEVEL_SOUND = standardAtmosphere(0).soundSpeedMs;

export function cruiseSpeed(published: PublishedCruiseSpeed | undefined): CruiseSpeed {
  const mach = published?.speedMach;
  if (mach && mach > 0) {
    const high = mach > 1;
    const altitudeM = high ? CRUISE_HIGH_ALTITUDE_M : CRUISE_LOW_ALTITUDE_M;
    const sound = standardAtmosphere(altitudeM).soundSpeedMs;
    return { speedMs: mach * sound, altitudeM, mach, soundSpeedMs: sound, published: true, high };
  }
  const kmh = published?.speedKmh;
  if (kmh && kmh > 0) {
    const speedMs = kmh / 3.6;
    const high = speedMs > SEA_LEVEL_SOUND;
    return { speedMs, altitudeM: high ? CRUISE_HIGH_ALTITUDE_M : CRUISE_LOW_ALTITUDE_M, mach: null, soundSpeedMs: null, published: true, high };
  }
  return {
    speedMs: SUBSONIC_CRUISE_SPEED,
    altitudeM: CRUISE_LOW_ALTITUDE_M,
    mach: null,
    soundSpeedMs: null,
    published: false,
    high: false,
  };
}
