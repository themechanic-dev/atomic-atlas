// The close view of a launch on the globe: a launcher for each kind of platform, the
// missile leaving it, and the camera that follows.
//
// Everything here is a generic low-poly shape built from boxes, cylinders and ellipsoids:
// one silo, one vehicle, one submarine, one ship, one aircraft. They stand for a type of
// platform, not for a particular weapon, and are drawn ten times life size so they can be
// seen against satellite pictures.

import { BoundingSphere, Cartesian3, Color, HeadingPitchRange, Math as CesiumMath, Matrix3, Matrix4, Quaternion } from '@cesium/core';
import { CallbackPositionProperty, CallbackProperty, type CesiumWidget, type Entity } from '@cesium/engine';
import { initialBearing, sideViewHeading, type LngLat } from '../lib/geo';
import { ease, LIFTOFF_MS, type LauncherKind, type Stage } from './director';

/** Models are drawn this many times life size. */
const SCALE = 10;
const FULL_LENGTH = 20 * SCALE;
const FULL_RADIUS = 1.7 * SCALE;
/** Height at which an aircraft releases its weapon, metres. */
export const RELEASE_ALTITUDE = 9000;
const AIRCRAFT_SPEED = 240;
/** How high the missile is followed in the close view before the view opens to the whole flight, metres. */
const CLIMB = 5_500;
/** How far ahead of the aircraft its missile is followed, metres. */
const DASH = 6_000;

const HULL = Color.fromCssColorString('#22313a');
const STEEL = Color.fromCssColorString('#6f777d');
const CONCRETE = Color.fromCssColorString('#8d9296');
const DARK = Color.fromCssColorString('#0d0f11');
const OLIVE = Color.fromCssColorString('#5d6549');
const OLIVE_DARK = Color.fromCssColorString('#454b36');
const BODY = Color.fromCssColorString('#ece8df');
const NOSE = Color.fromCssColorString('#f5a524');
const FLAME = Color.fromCssColorString('#ffb347').withAlpha(0.9);
const FLAME_CORE = Color.fromCssColorString('#fff4d6').withAlpha(0.95);
const SMOKE = Color.fromCssColorString('#e9e6df').withAlpha(0.45);
const SPRAY = Color.WHITE.withAlpha(0.55);

export interface LaunchInput {
  from: LngLat;
  target: LngLat;
  kind: LauncherKind;
}

export interface LaunchReadout {
  /** 0 to 1 while the launcher gets ready. */
  progress(): number;
  /** 0 to 1 through the lift-off. */
  liftoff(): number;
  stage(): Stage;
}

interface Frame {
  origin: Cartesian3;
  east: Cartesian3;
  north: Cartesian3;
  up: Cartesian3;
  /** Along the ground towards the target. */
  ahead: Cartesian3;
}

/** East, north and up at a place, as directions in the Earth-fixed frame. */
function frameAt(point: LngLat, heightM: number, bearingDeg: number): Frame {
  const lambda = CesiumMath.toRadians(point.lng);
  const phi = CesiumMath.toRadians(point.lat);
  const east = new Cartesian3(-Math.sin(lambda), Math.cos(lambda), 0);
  const north = new Cartesian3(-Math.sin(phi) * Math.cos(lambda), -Math.sin(phi) * Math.sin(lambda), Math.cos(phi));
  const up = new Cartesian3(Math.cos(phi) * Math.cos(lambda), Math.cos(phi) * Math.sin(lambda), Math.sin(phi));
  const b = CesiumMath.toRadians(bearingDeg);
  const ahead = combine(north, Math.cos(b), east, Math.sin(b));
  return { origin: Cartesian3.fromDegrees(point.lng, point.lat, heightM), east, north, up, ahead };
}

function combine(a: Cartesian3, ka: number, b: Cartesian3, kb: number): Cartesian3 {
  return new Cartesian3(a.x * ka + b.x * kb, a.y * ka + b.y * kb, a.z * ka + b.z * kb);
}

/** A point given by distances ahead, to the side and up from the frame's origin. */
function offset(frame: Frame, aheadM: number, upM: number, sideM = 0): Cartesian3 {
  const side = Cartesian3.cross(frame.ahead, frame.up, new Cartesian3());
  return new Cartesian3(
    frame.origin.x + frame.ahead.x * aheadM + frame.up.x * upM + side.x * sideM,
    frame.origin.y + frame.ahead.y * aheadM + frame.up.y * upM + side.y * sideM,
    frame.origin.z + frame.ahead.z * aheadM + frame.up.z * upM + side.z * sideM,
  );
}

/** The rotation that puts a shape's own x axis along `xAxis` and its z axis along `zAxis`. */
function orient(xAxis: Cartesian3, zAxis: Cartesian3): Quaternion {
  const z = Cartesian3.normalize(zAxis, new Cartesian3());
  const along = Cartesian3.dot(xAxis, z);
  let x = new Cartesian3(xAxis.x - z.x * along, xAxis.y - z.y * along, xAxis.z - z.z * along);
  if (Cartesian3.magnitudeSquared(x) < 1e-12) x = Cartesian3.mostOrthogonalAxis(z, new Cartesian3());
  x = Cartesian3.normalize(x, x);
  const y = Cartesian3.cross(z, x, new Cartesian3());
  return Quaternion.fromRotationMatrix(new Matrix3(x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z));
}

export function createLaunchScene(widget: CesiumWidget, read: LaunchReadout) {
  // What an aircraft carries is much smaller than a missile that stands on the ground.
  let MISSILE_LENGTH = FULL_LENGTH;
  let MISSILE_RADIUS = FULL_RADIUS;
  const { entities, camera, scene } = widget;
  let built: Entity[] = [];
  let input: LaunchInput | null = null;
  let frame: Frame | null = null;
  let viewHeading = 0;

  const add = (options: NonNullable<ConstructorParameters<typeof Entity>[0]>): void => {
    built.push(entities.add(options));
  };

  const clear = (): void => {
    built.forEach((entity) => entities.remove(entity));
    built = [];
  };

  /** True while the launcher and the missile leaving it are on screen. */
  const closeUp = (): boolean => {
    const stage = read.stage();
    return stage === 'launcher' || stage === 'boost';
  };

  /** Where the aircraft is, along its course: it flies in during the wait and on after the release. */
  const aircraftOffset = (): number => {
    const sinceRelease = (read.liftoff() * LIFTOFF_MS) / 1000;
    return sinceRelease > 0 ? AIRCRAFT_SPEED * sinceRelease : -(1 - read.progress()) * 180 * SCALE;
  };

  /** The missile: where its tail is, which way it points and how much of it is out. */
  const missile = (): { tail: Cartesian3; axis: Cartesian3; length: number } => {
    const f = frame!;
    const kind = input!.kind;
    const progress = read.progress();
    const lift = read.liftoff();
    if (kind === 'aircraft') {
      if (lift <= 0) return { tail: offset(f, aircraftOffset() - MISSILE_LENGTH / 2, -3.6 * SCALE), axis: f.ahead, length: MISSILE_LENGTH };
      // Released: it falls clear of the aircraft, then its engine starts and it pulls ahead.
      const fall = 60 * SCALE * ease(lift / 0.3);
      const dash = DASH * Math.max(0, (lift - 0.3) / 0.7) ** 2;
      const releasedAt = (AIRCRAFT_SPEED * LIFTOFF_MS) / 1000;
      return { tail: offset(f, releasedAt * lift + dash - MISSILE_LENGTH / 2, -3.6 * SCALE - fall), axis: f.ahead, length: MISSILE_LENGTH };
    }
    // Where it stands on its launcher.
    const base =
      kind === 'vehicle'
        ? offset(f, -9 * SCALE, 2.6 * SCALE)
        : kind === 'ship'
          ? offset(f, 12 * SCALE, 5 * SCALE)
          : kind === 'submarine'
            ? offset(f, -12 * SCALE, 1)
            : kind === 'pad'
              ? offset(f, 0, 1.5 * SCALE)
              : offset(f, 0, 1);
    if (lift <= 0) {
      if (kind === 'vehicle') {
        // Raised from lying on the vehicle to standing on its tail.
        const angle = ease(progress) * (Math.PI / 2);
        return { tail: base, axis: combine(f.ahead, Math.cos(angle), f.up, Math.sin(angle)), length: MISSILE_LENGTH };
      }
      if (kind === 'pad') return { tail: base, axis: f.up, length: MISSILE_LENGTH };
      // Silo, submarine, ship: it comes up out of its tube in the second half of the wait.
      return { tail: base, axis: f.up, length: MISSILE_LENGTH * ease((progress - 0.45) / 0.55) };
    }
    // Lift-off: straight up, faster and faster, leaning over towards the target as it goes.
    const height = CLIMB * lift * lift;
    const lean = 0.45 * ease(lift);
    const axis = Cartesian3.normalize(combine(f.up, 1, f.ahead, lean), new Cartesian3());
    const drift = height * lean * 0.5;
    return {
      tail: new Cartesian3(base.x + f.up.x * height + f.ahead.x * drift, base.y + f.up.y * height + f.ahead.y * drift, base.z + f.up.z * height + f.ahead.z * drift),
      axis,
      length: MISSILE_LENGTH,
    };
  };

  const alongMissile = (fraction: number): Cartesian3 => {
    const m = missile();
    const d = m.length * fraction;
    return new Cartesian3(m.tail.x + m.axis.x * d, m.tail.y + m.axis.y * d, m.tail.z + m.axis.z * d);
  };
  const missileOrientation = new CallbackProperty(() => {
    const m = missile();
    return orient(frame!.ahead, m.axis);
  }, false);
  const burning = (): boolean => {
    if (input!.kind === 'aircraft') return read.liftoff() > 0.3;
    return read.stage() === 'boost' && read.liftoff() > 0.02;
  };

  function buildMissile(): void {
    add({
      position: new CallbackPositionProperty(() => alongMissile(0.4), false),
      orientation: missileOrientation,
      cylinder: {
        show: new CallbackProperty(() => closeUp() && missile().length > 1, false),
        length: new CallbackProperty(() => Math.max(1, missile().length * 0.8), false),
        topRadius: MISSILE_RADIUS,
        bottomRadius: MISSILE_RADIUS,
        material: BODY,
        slices: 12,
      },
    });
    add({
      position: new CallbackPositionProperty(() => alongMissile(0.9), false),
      orientation: missileOrientation,
      cylinder: {
        show: new CallbackProperty(() => closeUp() && missile().length > MISSILE_LENGTH * 0.5, false),
        length: MISSILE_LENGTH * 0.2,
        topRadius: 0,
        bottomRadius: MISSILE_RADIUS,
        material: NOSE,
        slices: 12,
      },
    });
    // The flame: a cone behind the tail, a little longer and shorter from frame to frame.
    // It grows with the first metres of the climb, so it never reaches down through the ground.
    const flameLength = (): number => {
      const full = MISSILE_LENGTH * (0.75 + 0.2 * Math.sin(performance.now() / 45));
      if (input!.kind === 'aircraft') return full;
      const climbed = CLIMB * read.liftoff() ** 2;
      return Math.max(1, Math.min(full, climbed));
    };
    const behind = (distance: number): Cartesian3 => {
      const m = missile();
      return new Cartesian3(m.tail.x - m.axis.x * distance, m.tail.y - m.axis.y * distance, m.tail.z - m.axis.z * distance);
    };
    add({
      position: new CallbackPositionProperty(() => behind(flameLength() / 2), false),
      orientation: missileOrientation,
      cylinder: {
        show: new CallbackProperty(burning, false),
        length: new CallbackProperty(flameLength, false),
        topRadius: MISSILE_RADIUS * 0.95,
        bottomRadius: 0,
        material: FLAME,
        slices: 10,
      },
    });
    add({
      position: new CallbackPositionProperty(() => behind(flameLength() / 5), false),
      orientation: missileOrientation,
      cylinder: {
        show: new CallbackProperty(burning, false),
        length: new CallbackProperty(() => flameLength() * 0.4, false),
        topRadius: MISSILE_RADIUS * 0.6,
        bottomRadius: 0,
        material: FLAME_CORE,
        slices: 8,
      },
    });
    // The smoke it leaves behind.
    let smokeStart: Cartesian3 | null = null;
    add({
      polyline: {
        show: new CallbackProperty(() => read.stage() === 'boost' && burning(), false),
        positions: new CallbackProperty(() => {
          const m = missile();
          if (!smokeStart || read.liftoff() < 0.02 || (input!.kind === 'aircraft' && read.liftoff() < 0.32)) smokeStart = Cartesian3.clone(m.tail);
          return [smokeStart, m.tail];
        }, false),
        width: 9,
        material: SMOKE,
      },
    });
  }

  function buildLauncher(): void {
    const f = frame!;
    const level = orient(f.ahead, f.up);
    const box = (aheadM: number, upM: number, size: [number, number, number], color: Color, sideM = 0): void => {
      add({
        position: offset(f, aheadM * SCALE, upM * SCALE, sideM * SCALE),
        orientation: level,
        box: { dimensions: new Cartesian3(size[0] * SCALE, size[1] * SCALE, size[2] * SCALE), material: color },
      });
    };
    switch (input!.kind) {
      case 'silo': {
        add({ position: f.origin, ellipse: { semiMajorAxis: 16 * SCALE, semiMinorAxis: 16 * SCALE, height: 2, material: CONCRETE } });
        add({ position: f.origin, ellipse: { semiMajorAxis: 3.2 * SCALE, semiMinorAxis: 3.2 * SCALE, height: 4, material: DARK } });
        // The lid slides aside in the first half of the wait.
        add({
          position: new CallbackPositionProperty(() => offset(f, 0, 0.8 * SCALE, ease(read.progress() / 0.5) * 9 * SCALE), false),
          orientation: level,
          box: { dimensions: new Cartesian3(8 * SCALE, 8 * SCALE, 1.4 * SCALE), material: STEEL },
        });
        break;
      }
      case 'pad': {
        add({ position: f.origin, ellipse: { semiMajorAxis: 18 * SCALE, semiMinorAxis: 18 * SCALE, height: 2, material: CONCRETE } });
        box(0, 0.8, [5, 5, 1.4], STEEL);
        // The service tower beside the missile.
        box(0, 9, [2.4, 2.4, 18], STEEL, 5);
        break;
      }
      case 'vehicle': {
        box(0, 1.5, [24, 3.8, 1.8], OLIVE);
        box(10, 3.4, [4.5, 3.8, 2.4], OLIVE_DARK);
        for (const along of [-9, -4, 3, 9]) {
          box(along, 0.6, [2.2, 4.2, 1.2], DARK);
        }
        break;
      }
      case 'submarine': {
        add({
          position: offset(f, 0, 1.2 * SCALE),
          orientation: level,
          ellipsoid: { radii: new Cartesian3(52 * SCALE, 5.5 * SCALE, 3.2 * SCALE), material: HULL },
        });
        box(14, 5, [9, 2.6, 5.5], HULL);
        // Spray where the missile breaks the surface.
        add({
          position: offset(f, -12 * SCALE, 0),
          ellipse: {
            show: new CallbackProperty(() => read.progress() > 0.4 && read.liftoff() < 0.5, false),
            semiMajorAxis: new CallbackProperty(() => (4 + 9 * ease((read.progress() - 0.4) / 0.6)) * SCALE, false),
            semiMinorAxis: new CallbackProperty(() => (4 + 9 * ease((read.progress() - 0.4) / 0.6)) * SCALE, false),
            height: 6,
            material: SPRAY,
          },
        });
        break;
      }
      case 'ship': {
        box(0, 2.4, [64, 8.5, 4.8], STEEL);
        box(-14, 8, [11, 6.5, 6.5], CONCRETE);
        box(-14, 13, [3, 3, 4], STEEL);
        break;
      }
      case 'aircraft': {
        const flying = (aheadM: number, upM: number): CallbackPositionProperty =>
          new CallbackPositionProperty(() => offset(f, aircraftOffset() + aheadM * SCALE, upM * SCALE), false);
        add({
          position: flying(0, 0),
          orientation: orient(f.up, f.ahead),
          cylinder: { length: 42 * SCALE, topRadius: 1.2 * SCALE, bottomRadius: 2.4 * SCALE, material: STEEL, slices: 12 },
        });
        add({ position: flying(1, 0), orientation: level, box: { dimensions: new Cartesian3(7 * SCALE, 44 * SCALE, 0.9 * SCALE), material: STEEL } });
        add({ position: flying(-19, 0.4), orientation: level, box: { dimensions: new Cartesian3(4 * SCALE, 14 * SCALE, 0.7 * SCALE), material: STEEL } });
        add({ position: flying(-19, 3.6), orientation: level, box: { dimensions: new Cartesian3(5 * SCALE, 0.7 * SCALE, 6.5 * SCALE), material: STEEL } });
        break;
      }
    }
  }

  /** Builds the launcher and missile for a flight, or removes them when there is none. */
  function build(next: LaunchInput | null): void {
    clear();
    input = next;
    frame = null;
    if (!next) return;
    const bearing = initialBearing(next.from, next.target);
    const size = next.kind === 'aircraft' ? 0.5 : 1;
    MISSILE_LENGTH = FULL_LENGTH * size;
    MISSILE_RADIUS = FULL_RADIUS * size;
    frame = frameAt(next.from, next.kind === 'aircraft' ? RELEASE_ALTITUDE : 0, bearing);
    viewHeading = CesiumMath.toRadians(sideViewHeading(bearing));
    buildLauncher();
    buildMissile();
    // The launcher itself is only worth showing from close by.
    const show = new CallbackProperty(closeUp, false);
    built.forEach((entity) => {
      for (const shape of [entity.box, entity.ellipse, entity.ellipsoid]) if (shape && shape.show === undefined) shape.show = show;
      if (entity.cylinder && entity.cylinder.show === undefined) entity.cylinder.show = show;
    });
  }

  /** Points the camera for the close view. Called every frame while the launcher or the lift-off is on screen. */
  function directCamera(): void {
    if (!input || !frame || !closeUp()) return;
    const lift = read.liftoff();
    let target: Cartesian3;
    let range: number;
    let pitch: number;
    if (lift <= 0) {
      target = input.kind === 'aircraft' ? offset(frame, aircraftOffset(), 0) : offset(frame, 0, 8 * SCALE);
      // The camera closes in a little while the launcher gets ready.
      range = (170 - 45 * ease(read.progress())) * SCALE;
      pitch = input.kind === 'aircraft' ? -6 : -12;
    } else {
      const m = missile();
      target = m.tail;
      const travelled = Cartesian3.distance(target, offset(frame, 0, 0));
      range = 125 * SCALE + travelled * 0.55;
      // On the way up the camera stays low and looks up after the missile.
      pitch = input.kind === 'aircraft' ? -6 - 6 * ease(lift) : -12 + 24 * ease(lift);
    }
    camera.lookAt(target, new HeadingPitchRange(viewHeading, CesiumMath.toRadians(pitch), range));
    // Free the camera again, so the user's mouse works the moment the close view ends.
    camera.lookAtTransform(Matrix4.IDENTITY);
    scene.requestRender();
  }

  /** Flies the camera to the last seconds above a target. */
  function showArrival(target: LngLat, from: LngLat, instant: boolean): void {
    const heading = CesiumMath.toRadians(sideViewHeading(initialBearing(from, target)));
    const sphere = new BoundingSphere(Cartesian3.fromDegrees(target.lng, target.lat, 40_000), 90_000);
    camera.flyToBoundingSphere(sphere, {
      duration: instant ? 0 : 1.6,
      offset: new HeadingPitchRange(heading, CesiumMath.toRadians(-20), 520_000),
    });
  }

  return { build, directCamera, showArrival, destroy: clear };
}
