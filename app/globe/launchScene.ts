// The close view of a launch on the globe: a launcher for each kind of platform, the
// missile leaving it, its flame and smoke, and the camera that follows.
//
// The launchers and missiles are generic models built in code (app/models/launchers.ts):
// one silo, one launch pad, one road vehicle, one submarine, one ship, one aircraft. They
// stand for a type of platform, not for a particular weapon, and are drawn ten times life
// size so they can be seen against satellite pictures. Flame, smoke, dust and spray are
// particles that stay where they were left, so the climb draws its own trail.

import { BoundingSphere, Cartesian2, Cartesian3, Color, HeadingPitchRange, Math as CesiumMath, Matrix3, Matrix4, Quaternion } from '@cesium/core';
import {
  CallbackPositionProperty,
  CallbackProperty,
  ClippingPlane,
  ClippingPlaneCollection,
  ConeEmitter,
  DirectionalLight,
  ParticleSystem,
  ShadowMode,
  SunLight,
  type CesiumWidget,
  type Entity,
} from '@cesium/engine';
import { initialBearing, sideViewHeading, type LngLat } from '../lib/geo';
import { modelUrl } from '../models/glb';
import { glow, puff } from './sprites';
import {
  aircraft,
  ballisticMissile,
  cruiseMissile,
  launcherErector,
  launcherTruck,
  launchPad,
  MISSILE_LENGTH_M,
  siloBase,
  siloLid,
  submarine,
  TRUCK_PIVOT,
  warship,
} from '../models/launchers';
import { ease, LIFTOFF_MS, type LauncherKind, type Stage } from './director';

/** Models are drawn this many times life size. */
const SCALE = 10;
/** Height at which an aircraft releases its weapon, metres. */
export const RELEASE_ALTITUDE = 9000;
const AIRCRAFT_SPEED = 240;
/** How high the missile is followed in the close view before the view opens to the whole flight, metres. */
const CLIMB = 5_500;
/** How far ahead of the aircraft its missile is followed, metres. */
const DASH = 6_000;

const FLAME_CORE = Color.fromCssColorString('#fff6dc');

export type MissileShape = 'ballistic' | 'cruise';

export interface LaunchInput {
  from: LngLat;
  target: LngLat;
  kind: LauncherKind;
  /** A cruise missile has wings; everything else is drawn as a ballistic missile. */
  shape: MissileShape;
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
  /** Along the ground to the right of `ahead`. */
  side: Cartesian3;
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
  const side = Cartesian3.cross(ahead, up, new Cartesian3());
  return { origin: Cartesian3.fromDegrees(point.lng, point.lat, heightM), east, north, up, ahead, side };
}

function combine(a: Cartesian3, ka: number, b: Cartesian3, kb: number): Cartesian3 {
  return new Cartesian3(a.x * ka + b.x * kb, a.y * ka + b.y * kb, a.z * ka + b.z * kb);
}

/** A point given by distances ahead, up and to the right from the frame's origin. */
function offset(frame: Frame, aheadM: number, upM: number, sideM = 0): Cartesian3 {
  const { origin: o, ahead: a, up: u, side: s } = frame;
  return new Cartesian3(o.x + a.x * aheadM + u.x * upM + s.x * sideM, o.y + a.y * aheadM + u.y * upM + s.y * sideM, o.z + a.z * aheadM + u.z * upM + s.z * sideM);
}

function along(point: Cartesian3, direction: Cartesian3, distance: number): Cartesian3 {
  return new Cartesian3(point.x + direction.x * distance, point.y + direction.y * distance, point.z + direction.z * distance);
}

/**
 * The rotation that puts a model's own x axis along `xAxis` and its up axis along `upAxis`.
 * (Cesium turns a glTF model's y-up into z-up, so the model's y is the local z here.)
 */
function orient(xAxis: Cartesian3, upAxis: Cartesian3): Quaternion {
  const z = Cartesian3.normalize(upAxis, new Cartesian3());
  const dot = Cartesian3.dot(xAxis, z);
  let x = new Cartesian3(xAxis.x - z.x * dot, xAxis.y - z.y * dot, xAxis.z - z.z * dot);
  if (Cartesian3.magnitudeSquared(x) < 1e-12) x = Cartesian3.mostOrthogonalAxis(z, new Cartesian3());
  x = Cartesian3.normalize(x, x);
  const y = Cartesian3.cross(z, x, new Cartesian3());
  return Quaternion.fromRotationMatrix(new Matrix3(x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z));
}

/** Turns an emitter's own +z (where a ConeEmitter sends its particles) to point down the model's -y. */
const BACKWARDS = Matrix4.fromRotationTranslation(Matrix3.fromRotationX(Math.PI), Cartesian3.ZERO);

export function createLaunchScene(widget: CesiumWidget, read: LaunchReadout) {
  const { entities, camera, scene } = widget;
  // Particles move on the scene's clock, which must run for them.
  widget.clock.shouldAnimate = true;
  let built: Entity[] = [];
  let particles: ParticleSystem[] = [];
  let input: LaunchInput | null = null;
  let frame: Frame | null = null;
  let viewHeading = 0;
  /** Missile size for this launch: what an aircraft carries is half as big. */
  let missileScale = SCALE;
  let missileLength = MISSILE_LENGTH_M * SCALE;
  let base: Cartesian3 | null = null;
  /** The ground (or water) under the missile's base, where dust and steam roll out. */
  let foot: Cartesian3 | null = null;
  const sunLight = scene.light;
  let closeLight: DirectionalLight | null = null;
  const depthTestBefore = scene.globe.depthTestAgainstTerrain;

  const add = (options: NonNullable<ConstructorParameters<typeof Entity>[0]>): Entity => {
    const entity = entities.add(options);
    built.push(entity);
    return entity;
  };

  const clear = (): void => {
    built.forEach((entity) => entities.remove(entity));
    built = [];
    particles.forEach((system) => scene.primitives.remove(system));
    particles = [];
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

  /** How far the missile has come up out of its tube, 0 (all inside) to 1 (standing on its base). */
  const raised = (): number => (read.liftoff() > 0 ? 1 : ease((read.progress() - 0.45) / 0.55));

  /** The missile: where its tail is and which way it points. */
  const missile = (): { tail: Cartesian3; axis: Cartesian3 } => {
    const f = frame!;
    const kind = input!.kind;
    const progress = read.progress();
    const lift = read.liftoff();
    if (kind === 'aircraft') {
      const hang = -3.4 * SCALE;
      if (lift <= 0) return { tail: offset(f, aircraftOffset() - missileLength / 2, hang), axis: f.ahead };
      // Released: it falls clear of the aircraft, then its engine starts and it pulls ahead.
      const fall = 60 * SCALE * ease(lift / 0.3);
      const dash = DASH * Math.max(0, (lift - 0.3) / 0.7) ** 2;
      const releasedAt = (AIRCRAFT_SPEED * LIFTOFF_MS) / 1000;
      return { tail: offset(f, releasedAt * lift + dash - missileLength / 2, hang - fall), axis: f.ahead };
    }
    const b = base!;
    if (lift <= 0) {
      if (kind === 'vehicle') {
        // Raised from lying on the vehicle to standing on its tail.
        const angle = ease(progress) * (Math.PI / 2);
        return { tail: b, axis: combine(f.ahead, Math.cos(angle), f.up, Math.sin(angle)) };
      }
      if (kind === 'pad') return { tail: b, axis: f.up };
      // Silo, submarine, ship: it comes up out of its tube in the second half of the wait.
      return { tail: along(b, f.up, -missileLength * (1 - raised())), axis: f.up };
    }
    // Lift-off: straight up, faster and faster, leaning over towards the target as it goes.
    const height = CLIMB * lift * lift;
    const lean = 0.45 * ease(lift);
    const axis = Cartesian3.normalize(combine(f.up, 1, f.ahead, lean), new Cartesian3());
    return { tail: along(along(b, f.up, height), f.ahead, height * lean * 0.5), axis };
  };

  /** The missile's orientation: its back (-x) towards the sky as it leans over. */
  const missileOrientation = (axis: Cartesian3): Quaternion => orient(Cartesian3.cross(axis, frame!.side, new Cartesian3()), axis);

  const burning = (): boolean => {
    if (input!.kind === 'aircraft') return read.liftoff() > 0.3;
    return read.stage() === 'boost' && read.liftoff() > 0.02;
  };

  // CesiumJS starts loading a model only once it is shown. So the models are always shown,
  // shrunk to nothing outside the close view: they load as soon as the flight is set up, and
  // a slow computer has them ready when the launcher comes on screen.
  const model = (name: string, build: () => import('three').Object3D, scale = SCALE) => ({
    uri: modelUrl(name, build),
    scale: new CallbackProperty(() => (closeUp() ? scale : scale * 1e-5), false),
    shadows: ShadowMode.DISABLED,
  });

  /**
   * Where a missile waiting in a silo or tube is cut off: the part below this height (the
   * opening of the silo, the deck of the submarine or ship) is not drawn. The globe hides
   * what is below the ground too, but not on every graphics chip (not in a Windows virtual
   * machine without a GPU), so the model itself is cut.
   */
  let cut: Cartesian3 | null = null;
  let clipping: ClippingPlaneCollection | null = null;

  /** Moves the cutting plane with the missile: it lies in the missile's own frame. */
  function updateCut(): void {
    if (!clipping || !cut || !frame) return;
    const m = missile();
    const rotation = Matrix3.fromQuaternion(missileOrientation(m.axis));
    const plane = clipping.get(0);
    plane.normal = Matrix3.multiplyByVector(Matrix3.transpose(rotation, new Matrix3()), frame.up, new Cartesian3());
    plane.distance = Cartesian3.dot(Cartesian3.subtract(m.tail, cut, new Cartesian3()), frame.up);
  }

  function buildMissile(): void {
    const shape = input!.shape;
    clipping = null;
    if (cut) clipping = new ClippingPlaneCollection({ planes: [new ClippingPlane(Cartesian3.UNIT_Z, 0)], edgeWidth: 0 });
    add({
      position: new CallbackPositionProperty(() => missile().tail, false),
      orientation: new CallbackProperty(() => missileOrientation(missile().axis), false),
      model: {
        ...model(shape === 'cruise' ? 'missile-cruise' : 'missile-ballistic', shape === 'cruise' ? cruiseMissile : ballisticMissile, missileScale),
        ...(clipping ? { clippingPlanes: clipping } : {}),
      },
    });
    // A bright core at the nozzle; the rest of the flame is particles.
    add({
      position: new CallbackPositionProperty(() => {
        const m = missile();
        return along(m.tail, m.axis, -missileLength * 0.07);
      }, false),
      ellipsoid: {
        show: new CallbackProperty(() => closeUp() && burning(), false),
        radii: new CallbackProperty(() => {
          const r = missileLength * 0.045 * (0.9 + 0.15 * Math.sin(performance.now() / 37));
          return new Cartesian3(r, r, r);
        }, false),
        material: FLAME_CORE,
      },
    });
  }

  function buildLauncher(): void {
    const f = frame!;
    const level = orient(f.ahead, f.up);
    const fixed = (name: string, build: () => import('three').Object3D, at: Cartesian3, scale = SCALE): void => {
      add({ position: at, orientation: level, model: model(name, build, scale) });
    };
    switch (input!.kind) {
      case 'silo': {
        fixed('silo', siloBase, f.origin);
        // The lid slides aside on its rails in the first half of the wait.
        add({
          position: new CallbackPositionProperty(() => offset(f, 0, 2.65 * SCALE, ease(read.progress() / 0.5) * 11 * SCALE), false),
          orientation: level,
          model: model('silo-lid', siloLid),
        });
        break;
      }
      case 'pad':
        fixed('pad', launchPad, f.origin);
        break;
      case 'vehicle': {
        fixed('truck', launcherTruck, f.origin);
        // The erector turns with the missile and stays upright once it has gone.
        add({
          position: base!,
          orientation: new CallbackProperty(() => {
            const angle = read.liftoff() > 0 ? Math.PI / 2 : ease(read.progress()) * (Math.PI / 2);
            return missileOrientation(combine(f.ahead, Math.cos(angle), f.up, Math.sin(angle)));
          }, false),
          model: model('erector', launcherErector),
        });
        break;
      }
      case 'submarine':
        fixed('submarine', submarine, f.origin);
        break;
      case 'ship':
        fixed('ship', warship, f.origin);
        break;
      case 'aircraft':
        add({
          position: new CallbackPositionProperty(() => offset(f, aircraftOffset(), 0), false),
          orientation: level,
          model: model('aircraft', aircraft),
        });
        break;
    }
  }

  // ---------------------------------------------------------------- particles

  const water = (): boolean => input!.kind === 'submarine' || input!.kind === 'ship';
  // A new matrix each time: the system notices only when its matrix is set, not when it is changed in place.
  const placeAt = (system: ParticleSystem, at: Cartesian3, rotation: Quaternion): void => {
    system.modelMatrix = Matrix4.fromRotationTranslation(Matrix3.fromQuaternion(rotation), at);
  };

  function buildParticles(): void {
    const kind = input!.kind;
    const size = missileScale / SCALE;
    const system = (options: ConstructorParameters<typeof ParticleSystem>[0]): ParticleSystem => {
      const s = scene.primitives.add(new ParticleSystem({ sizeInMeters: true, emissionRate: 0, lifetime: Number.MAX_VALUE, ...options })) as ParticleSystem;
      particles.push(s);
      return s;
    };
    // The flame: short-lived bright particles pouring out of the nozzle.
    const flame = system({
      image: glow(),
      emitter: new ConeEmitter(CesiumMath.toRadians(7)),
      emitterModelMatrix: BACKWARDS,
      startColor: new Color(1, 0.96, 0.82, 0.95),
      endColor: new Color(1, 0.42, 0.08, 0),
      startScale: 0.9,
      endScale: 2.6,
      minimumParticleLife: 0.25,
      maximumParticleLife: 0.5,
      minimumSpeed: 420 * size,
      maximumSpeed: 620 * size,
      imageSize: new Cartesian2(46 * size, 46 * size),
    });
    // The smoke left behind: slow, long-lived, growing puffs.
    const smoke = system({
      image: puff(),
      emitter: new ConeEmitter(CesiumMath.toRadians(14)),
      emitterModelMatrix: BACKWARDS,
      startColor: new Color(0.97, 0.96, 0.94, 0.7),
      endColor: new Color(0.82, 0.82, 0.82, 0),
      startScale: 1,
      endScale: 5.5,
      minimumParticleLife: 6,
      maximumParticleLife: 10,
      minimumSpeed: 12 * size,
      maximumSpeed: 40 * size,
      imageSize: new Cartesian2(60 * size, 60 * size),
    });
    // Dust or steam rolling out sideways from the base at lift-off.
    const ground = kind === 'aircraft' ? null : system({
      image: puff(),
      emitter: new ConeEmitter(CesiumMath.toRadians(82)),
      startColor: water() ? new Color(0.95, 0.97, 0.98, 0.75) : new Color(0.83, 0.78, 0.7, 0.75),
      endColor: water() ? new Color(0.9, 0.93, 0.95, 0) : new Color(0.7, 0.66, 0.6, 0),
      startScale: 1,
      endScale: 4.5,
      minimumParticleLife: 3.5,
      maximumParticleLife: 6.5,
      minimumSpeed: 45,
      maximumSpeed: 110,
      imageSize: new Cartesian2(70, 70),
    });
    // Water thrown up where the missile breaks the surface, or the gas that pushes it out of its tube.
    const burst = kind === 'aircraft' || kind === 'pad' ? null : system({
      image: water() ? glow() : puff(),
      emitter: new ConeEmitter(CesiumMath.toRadians(water() ? 22 : 10)),
      startColor: new Color(0.97, 0.99, 1, 0.85),
      endColor: new Color(0.9, 0.95, 1, 0),
      startScale: 0.8,
      endScale: 3,
      minimumParticleLife: 1.2,
      maximumParticleLife: 2.6,
      minimumSpeed: water() ? 60 : 30,
      maximumSpeed: water() ? 140 : 70,
      imageSize: new Cartesian2(40, 40),
      updateCallback: (particle, dt) => {
        // Spray falls back down.
        if (water()) Cartesian3.add(particle.velocity, Cartesian3.multiplyByScalar(frame!.up, -9.8 * 3 * dt, new Cartesian3()), particle.velocity);
      },
    });

    const update = (): void => {
      if (!input || !frame) return;
      const on = closeUp();
      for (const s of particles) s.show = on || read.stage() === 'midcourse';
      if (!on) {
        for (const s of particles) s.emissionRate = 0;
        return;
      }
      updateCut();
      const m = missile();
      const rotation = missileOrientation(m.axis);
      const fire = burning();
      placeAt(flame, m.tail, rotation);
      flame.emissionRate = fire ? 220 : 0;
      placeAt(smoke, along(m.tail, m.axis, -missileLength * 0.35), rotation);
      smoke.emissionRate = fire ? 55 : 0;
      const lift = read.liftoff();
      const up = orient(frame.ahead, frame.up);
      if (ground && foot) {
        placeAt(ground, foot, up);
        ground.emissionRate = fire && lift < 0.45 ? 120 * (1 - lift / 0.45) : 0;
      }
      if (burst && base) {
        placeAt(burst, base, up);
        const rising = read.progress() > 0.5 && lift <= 0 && raised() < 1;
        burst.emissionRate = (water() && (rising || (lift > 0 && lift < 0.15))) || (!water() && lift > 0 && lift < 0.04) ? 160 : 0;
      }
    };
    removeUpdate?.();
    removeUpdate = scene.preUpdate.addEventListener(update);
  }

  let removeUpdate: (() => void) | null = null;

  /** The light during the close view: from high up behind the camera's shoulder, the same anywhere and any time. */
  function lightUp(on: boolean): void {
    if (on && frame) {
      const toward = combine(combine(frame.up, -1, frame.side, 0.45), 1, frame.ahead, 0.35);
      closeLight = new DirectionalLight({ direction: Cartesian3.normalize(toward, toward), intensity: 3.2 });
      scene.light = closeLight;
    } else {
      scene.light = sunLight ?? new SunLight();
    }
  }

  /**
   * A missile waiting in a silo or a tube is below the ground or the sea: the globe must hide
   * it. That is set when the launch is set up, not when the close view starts, so not even the
   * first frame shows the missile through the ground.
   */
  function hideBelowGround(on: boolean): void {
    scene.globe.depthTestAgainstTerrain = on || depthTestBefore;
  }

  /** Builds the launcher and missile for a flight, or removes them when there is none. */
  function build(next: LaunchInput | null): void {
    clear();
    removeUpdate?.();
    removeUpdate = null;
    input = next;
    frame = null;
    base = null;
    foot = null;
    cut = null;
    lightUp(false);
    hideBelowGround(false);
    if (!next) return;
    hideBelowGround(next.kind === 'silo' || next.kind === 'submarine' || next.kind === 'ship');
    const bearing = initialBearing(next.from, next.target);
    missileScale = SCALE * (next.kind === 'aircraft' ? 0.5 : 1);
    missileLength = MISSILE_LENGTH_M * missileScale;
    frame = frameAt(next.from, next.kind === 'aircraft' ? RELEASE_ALTITUDE : 0, bearing);
    viewHeading = CesiumMath.toRadians(sideViewHeading(bearing));
    // Where the missile's tail stands before it leaves.
    const f = frame;
    base =
      next.kind === 'vehicle'
        ? offset(f, TRUCK_PIVOT.x * SCALE, TRUCK_PIVOT.y * SCALE)
        : next.kind === 'ship'
          ? offset(f, 12.4 * SCALE, 5.05 * SCALE)
          : next.kind === 'submarine'
            ? offset(f, -12 * SCALE, 4.3 * SCALE, -1.6 * SCALE)
            : next.kind === 'pad'
              ? offset(f, 0, 3.3 * SCALE)
              : offset(f, 0, 1.6 * SCALE);
    // The height the missile comes up through: the floor of the silo's opening, the deck.
    cut =
      next.kind === 'silo'
        ? offset(f, 0, 0.7 * SCALE)
        : next.kind === 'submarine'
          ? offset(f, -12 * SCALE, 4.35 * SCALE, -1.6 * SCALE)
          : next.kind === 'ship'
            ? offset(f, 12.4 * SCALE, 5.1 * SCALE)
            : null;
    foot =
      next.kind === 'vehicle'
        ? offset(f, TRUCK_PIVOT.x * SCALE, 0)
        : next.kind === 'ship'
          ? offset(f, 12.4 * SCALE, 0)
          : next.kind === 'submarine'
            ? offset(f, -12 * SCALE, 0, -1.6 * SCALE)
            : f.origin;
    buildLauncher();
    buildMissile();
    buildParticles();
  }

  let lit = false;

  /** Points the camera for the close view. Called every frame while the launcher or the lift-off is on screen. */
  function directCamera(): void {
    const on = Boolean(input && frame && closeUp());
    if (on !== lit) {
      lit = on;
      lightUp(on);
    }
    if (!on || !input || !frame) return;
    const lift = read.liftoff();
    let target: Cartesian3;
    let range: number;
    let pitch: number;
    if (lift <= 0) {
      target = input.kind === 'aircraft' ? offset(frame, aircraftOffset(), 0) : offset(frame, 0, 8 * SCALE);
      // The camera closes in a little while the launcher gets ready.
      range = (input.kind === 'aircraft' || input.kind === 'submarine' || input.kind === 'ship' ? 170 - 45 * ease(read.progress()) : 120 - 35 * ease(read.progress())) * SCALE;
      pitch = input.kind === 'aircraft' ? -6 : -12;
    } else {
      const m = missile();
      target = m.tail;
      const travelled = Cartesian3.distance(target, offset(frame, 0, 0));
      range = 100 * SCALE + travelled * 0.55;
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

  function destroy(): void {
    clear();
    removeUpdate?.();
    removeUpdate = null;
    lightUp(false);
    hideBelowGround(false);
  }

  return { build, directCamera, showArrival, destroy };
}
