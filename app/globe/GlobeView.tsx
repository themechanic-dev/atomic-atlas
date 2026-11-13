// The globe: Cesium, seen from space, for ranges and trajectories.
// Loaded only when the missile simulator is opened.

import {
  ArcType,
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  DistanceDisplayCondition,
  HeadingPitchRange,
  Math as CesiumMath,
  NearFarScalar,
} from '@cesium/core';
import {
  CallbackPositionProperty,
  CallbackProperty,
  CesiumWidget,
  Credit,
  HorizontalOrigin,
  ImageryLayer,
  Ion,
  LabelStyle,
  PolylineDashMaterialProperty,
  PolylineGlowMaterialProperty,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  TileMapServiceImageryProvider,
  UrlTemplateImageryProvider,
  VerticalOrigin,
  buildModuleUrl,
  type Entity,
} from '@cesium/engine';
import '@cesium/engine/Source/Widget/CesiumWidget.css';
import { effect, untracked } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { positionAt, type FlightPlan } from '@physics/ballistics/flight';
import { t } from '../i18n';
import { formatDistance } from '../lib/format';
import { alongGreatCircle, beyondHorizon, circleRing, initialBearing, sideViewHeading, type LngLat } from '../lib/geo';
import {
  cinematic,
  clock,
  flights,
  launcherProgress,
  launchPoint,
  liftoffProgress,
  leadIndex,
  missile,
  placePoint,
  playing,
  reach,
  stage,
  timeline,
} from '../state/missiles';
import { settings } from '../state/settings';
import { beginBusy } from '../state/simulation';
import { salvos, warClock, warFlights } from '../state/war';
import { launcherKind } from './director';
import { createLaunchScene } from './launchScene';

// Cesium fetches its workers and textures from here (copied by the build, see vite.config.ts).
(globalThis as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = new URL('./cesium/', document.baseURI).href;
// No Cesium ion account is used: the imagery below needs no key.
Ion.defaultAccessToken = '';

const SATELLITE_TILES = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg';

const AMBER = Color.fromCssColorString('#f5a524');
const RED = Color.fromCssColorString('#ff4d3d');
const WHITE = Color.fromCssColorString('#f4efe6');
const HALO = Color.fromCssColorString('#101214');
/** One colour per launch of a war scenario. */
const SALVO_COLORS = ['#f5a524', '#4dd0e1', '#c77dff', '#7cd67c', '#ff8a65', '#f06292', '#90caf9', '#e6ee9c'].map((c) => Color.fromCssColorString(c));

/** The range ring is drawn a little above the ground so it does not sink into the surface. */
const MIN_DRAW_HEIGHT = 3000;
/** Flight paths start close to the ground, so the path meets the launcher in the close view. */
const PATH_MIN_HEIGHT = 150;

function cartesian(point: LngLat, heightM = 0): Cartesian3 {
  return Cartesian3.fromDegrees(point.lng, point.lat, heightM);
}

/** 3D positions of a flight from launch to target. */
function flightPositions(from: LngLat, to: LngLat, plan: FlightPlan): Cartesian3[] {
  return plan.points.map((p) => cartesian(alongGreatCircle(from, to, p.downrangeM / plan.rangeM), Math.max(p.altitudeM, PATH_MIN_HEIGHT)));
}

/**
 * Height of the camera from which the whole Earth fills most of the view, whatever its shape.
 * Cesium's field of view spans the longer side, so a tall phone screen needs the camera closer.
 */
function wholeEarthHeight(element: HTMLElement): number {
  const radius = 6_378_137;
  const shorter = Math.min(element.clientWidth, element.clientHeight) || 1;
  const longer = Math.max(element.clientWidth, element.clientHeight) || 1;
  // The globe's edge at 43 % of the shorter side from the centre; the view is 60 degrees wide.
  const edgeAngle = Math.atan((Math.tan(CesiumMath.toRadians(30)) * 0.43 * shorter) / (longer / 2));
  return radius / Math.sin(edgeAngle) - radius;
}

/** A phone-sized view: fewer names and more room around what is shown. */
function isNarrow(element: HTMLElement): boolean {
  return Math.min(element.clientWidth, element.clientHeight) < 600;
}

function labelStyle(text: string, color: Color = WHITE) {
  return {
    text,
    font: '600 14px system-ui, sans-serif',
    fillColor: color,
    outlineColor: HALO,
    outlineWidth: 3,
    style: LabelStyle.FILL_AND_OUTLINE,
    horizontalOrigin: HorizontalOrigin.LEFT,
    verticalOrigin: VerticalOrigin.CENTER,
    pixelOffset: new Cartesian2(14, 0),
    // A dark plate behind the text keeps it readable on top of country names.
    showBackground: true,
    backgroundColor: HALO.withAlpha(0.78),
    backgroundPadding: new Cartesian2(6, 4),
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
  };
}

export default function GlobeView({ active }: { active: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const credits = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<CesiumWidget | null>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const endLoading = beginBusy('busy.globe');

    let widget: CesiumWidget;
    try {
      widget = new CesiumWidget(element, {
        // The world image shipped with Cesium: always there, also without internet.
        baseLayer: ImageryLayer.fromProviderAsync(TileMapServiceImageryProvider.fromUrl(buildModuleUrl('Assets/Textures/NaturalEarthII'))),
        scene3DOnly: true,
        requestRenderMode: true,
        maximumRenderTimeChange: Number.POSITIVE_INFINITY,
        creditContainer: credits.current ?? undefined,
        showRenderLoopErrors: false,
      });
    } catch (error) {
      console.error('globe could not start', error);
      endLoading();
      return;
    }
    widgetRef.current = widget;
    // A handle for diagnostics from the developer tools.
    (globalThis as { __atomicAtlasGlobe?: CesiumWidget }).__atomicAtlasGlobe = widget;
    const { scene, camera, entities } = widget;
    scene.globe.enableLighting = false;
    scene.globe.baseColor = Color.fromCssColorString('#0e1317');
    widget.creditDisplay.addStaticCredit(new Credit('CesiumJS', true));
    widget.creditDisplay.addStaticCredit(new Credit('Natural Earth', true));
    camera.setView({ destination: Cartesian3.fromDegrees(18, 34, wholeEarthHeight(element)) });
    // The first complete frame ends the "loading" indicator.
    const removeLoaded = scene.globe.tileLoadProgressEvent.addEventListener((queued: number) => {
      if (queued === 0) {
        endLoading();
        removeLoaded();
      }
    });
    const loadingTimeout = setTimeout(endLoading, 8000);

    // Satellite imagery on top when the settings allow an online map.
    let satellite: ImageryLayer | null = null;
    const applyImagery = (): void => {
      const wanted = settings.value.mapSource !== 'builtin';
      if (wanted && !satellite) {
        satellite = widget.imageryLayers.addImageryProvider(
          new UrlTemplateImageryProvider({
            url: SATELLITE_TILES,
            maximumLevel: 13,
            credit: new Credit('Sentinel-2 cloudless 2024 by EOX (contains modified Copernicus Sentinel data)', true),
          }),
        );
      } else if (!wanted && satellite) {
        widget.imageryLayers.remove(satellite, true);
        satellite = null;
      }
      scene.requestRender();
    };

    // Country names, for orientation.
    const nameEntities: Entity[] = [];
    const namePositions = new Map<Entity, Cartesian3>();
    const cullNames = (): void => {
      const eye = camera.positionWC;
      for (const entity of nameEntities) {
        const at = namePositions.get(entity);
        if (at) entity.show = !beyondHorizon(eye, at);
      }
    };
    camera.percentageChanged = 0.02;
    const removeCameraChanged = camera.changed.addEventListener(cullNames);
    const removeCameraMoved = camera.moveEnd.addEventListener(cullNames);
    let countryData: Array<{ name: string; name_el: string; rank: number; lng: number; lat: number }> | null = null;
    const drawNames = (): void => {
      nameEntities.splice(0).forEach((entity) => entities.remove(entity));
      namePositions.clear();
      if (!countryData) return;
      const greek = settings.value.language === 'el';
      const maxRank = isNarrow(element) ? 2 : 4;
      for (const c of countryData) {
        if (c.rank > maxRank) continue;
        const at = Cartesian3.fromDegrees(c.lng, c.lat, 0);
        const entity = entities.add({
          position: at,
          label: {
            text: (greek ? c.name_el : c.name).toUpperCase(),
            font: '500 12px system-ui, sans-serif',
            fillColor: WHITE.withAlpha(0.85),
            outlineColor: HALO,
            outlineWidth: 3,
            style: LabelStyle.FILL_AND_OUTLINE,
            scaleByDistance: new NearFarScalar(2e6, 1.1, 2.5e7, 0.75),
            // Fewer names from far away, so they do not pile up on each other.
            distanceDisplayCondition: new DistanceDisplayCondition(0, c.rank <= 2 ? 4e7 : c.rank === 3 ? 1.3e7 : 6e6),
          },
        });
        namePositions.set(entity, at);
        nameEntities.push(entity);
      }
      cullNames();
      scene.requestRender();
    };
    fetch('./data/basemap/countries.json')
      .then((response) => response.json())
      .then((json: { features: Array<{ properties: { name: string; name_el: string; rank: number }; geometry: { coordinates: [number, number] } }> }) => {
        countryData = json.features.map((f) => ({ ...f.properties, lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
        drawNames();
      })
      .catch(() => undefined);

    // Everything that belongs to the current launch is rebuilt when it changes.
    const launchEntities: Entity[] = [];
    // In the close view of the launch the launcher and missile are drawn instead of marks.
    const notCloseUp = new CallbackProperty(() => !(cinematic.value && (stage.value === 'launcher' || stage.value === 'boost')), false);
    const drawLaunch = (): void => {
      launchEntities.splice(0).forEach((entity) => entities.remove(entity));
      const from = launchPoint.value;
      const weapon = missile.value;
      if (from) {
        launchEntities.push(
          entities.add({
            position: cartesian(from),
            point: { show: notCloseUp, pixelSize: 12, color: AMBER, outlineColor: HALO, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
            // Above its mark, so it stays clear of a target close by (those read to the right).
            label: {
              ...labelStyle(t('missiles.launchPoint'), AMBER),
              show: notCloseUp,
              horizontalOrigin: HorizontalOrigin.CENTER,
              verticalOrigin: VerticalOrigin.BOTTOM,
              pixelOffset: new Cartesian2(0, -14),
            },
          }),
        );
        if (weapon && reach.value > 0) {
          const ring = circleRing(from, reach.value, 360).map(([lng, lat]) => Cartesian3.fromDegrees(lng, lat, MIN_DRAW_HEIGHT));
          launchEntities.push(
            entities.add({
              polyline: {
                positions: ring,
                width: 2,
                arcType: ArcType.NONE,
                material: new PolylineDashMaterialProperty({ color: AMBER.withAlpha(0.9), dashLength: 14 }),
              },
            }),
          );
        }
      }
      const all: Cartesian3[] = from ? [cartesian(from)] : [];
      flights.value.forEach((flight, index) => {
        const color = flight.inRange ? WHITE : RED;
        launchEntities.push(
          entities.add({
            position: cartesian(flight.target),
            point: { pixelSize: 11, color: RED, outlineColor: HALO, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
            label: labelStyle(`${index + 1} · ${formatDistance(flight.distanceM, 3)}`, color),
          }),
        );
        all.push(cartesian(flight.target));
        if (!from || !flight.plan) return;
        const plan = flight.plan;
        const path = flightPositions(from, flight.target, plan);
        all.push(...path);
        launchEntities.push(
          entities.add({
            polyline: {
              positions: path,
              width: 6,
              arcType: ArcType.NONE,
              material: new PolylineGlowMaterialProperty({ color: flight.inRange ? AMBER : RED, glowPower: 0.22 }),
            },
          }),
        );
        // The warhead: where it is at the time shown by the clock.
        launchEntities.push(
          entities.add({
            position: new CallbackPositionProperty(() => {
              const p = positionAt(plan, clock.value);
              return cartesian(alongGreatCircle(from, flight.target, p.downrangeM / plan.rangeM), Math.max(p.altitudeM, PATH_MIN_HEIGHT));
            }, false),
            point: {
              // In the close view of the launch the missile itself is drawn instead.
              show: notCloseUp,
              pixelSize: 9,
              color: Color.WHITE,
              outlineColor: RED,
              outlineWidth: 3,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          }),
        );
        // The impact: a bright mark at the target from the moment the warhead arrives.
        launchEntities.push(
          entities.add({
            position: cartesian(flight.target),
            point: {
              show: new CallbackProperty(() => clock.value > 0 && clock.value >= plan.flightTimeS, false),
              pixelSize: 26,               color: AMBER.withAlpha(0.55),
              outlineColor: Color.WHITE.withAlpha(0.9),
              outlineWidth: 2,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          }),
        );
      });
      // The highest point of the flight the view follows, and where its warheads part.
      const lead = flights.value[leadIndex.value];
      if (from && lead?.plan && lead.plan.kind === 'ballistic') {
        const plan = lead.plan;
        launchEntities.push(
          entities.add({
            position: cartesian(alongGreatCircle(from, lead.target, 0.5), plan.apogeeM),
            point: { pixelSize: 5, color: AMBER, disableDepthTestDistance: Number.POSITIVE_INFINITY },
            label: {
              ...labelStyle(`${t('quantity.apogee')} · ${formatDistance(plan.apogeeM, 3)}`, AMBER),
              horizontalOrigin: HorizontalOrigin.CENTER,
              verticalOrigin: VerticalOrigin.BOTTOM,
              pixelOffset: new Cartesian2(0, -10),
              show: new CallbackProperty(() => !(stage.value === 'launcher' || stage.value === 'boost' || stage.value === 'terminal'), false),
            },
          }),
        );
        if (flights.value.filter((flight) => flight.plan).length > 1) {
          const until = plan.flightTimeS * 0.16;
          launchEntities.push(
            entities.add({
              position: new CallbackPositionProperty(() => {
                const p = positionAt(plan, clock.value);
                return cartesian(alongGreatCircle(from, lead.target, p.downrangeM / plan.rangeM), p.altitudeM);
              }, false),
              label: {
                ...labelStyle(t('missiles.label.separation')),
                show: new CallbackProperty(() => stage.value === 'midcourse' && clock.value < until, false),
              },
            }),
          );
        }
      }
      // A glider: the height it glides at, halfway along.
      if (from && lead?.plan && lead.plan.kind === 'glide') {
        const plan = lead.plan;
        const half = plan.points.reduce((best, p) => (Math.abs(p.downrangeM - plan.rangeM / 2) < Math.abs(best.downrangeM - plan.rangeM / 2) ? p : best));
        launchEntities.push(
          entities.add({
            position: cartesian(alongGreatCircle(from, lead.target, half.downrangeM / plan.rangeM), half.altitudeM),
            point: { pixelSize: 5, color: AMBER, disableDepthTestDistance: Number.POSITIVE_INFINITY },
            label: {
              ...labelStyle(`${t('quantity.glideHeight')} · ${formatDistance(half.altitudeM, 2)}`, AMBER),
              horizontalOrigin: HorizontalOrigin.CENTER,
              verticalOrigin: VerticalOrigin.BOTTOM,
              pixelOffset: new Cartesian2(0, -10),
              show: new CallbackProperty(() => !(stage.value === 'launcher' || stage.value === 'boost' || stage.value === 'terminal'), false),
            },
          }),
        );
      }
      framed = all;
      launch.build(
        from && weapon && lead?.plan ? { from, target: lead.target, kind: launcherKind(weapon.platform) } : null,
      );
      // While a flight is being played the director holds the camera.
      if (!untracked(() => playing.value)) frameFlights(settings.value.reduceMotion ? 0 : 1.4);
      scene.requestRender();
    };

    // The war scenario: every launch added to it, on its own clock.
    const warEntities: Entity[] = [];
    let framedSalvos: unknown = null;
    const drawWar = (): void => {
      warEntities.splice(0).forEach((entity) => entities.remove(entity));
      const flightsNow = warFlights.value;
      const launched = new Set<number>();
      const points: Cartesian3[] = [];
      for (const f of flightsNow) {
        const color = SALVO_COLORS[f.salvoIndex % SALVO_COLORS.length]!;
        const from = f.salvo.from;
        if (!launched.has(f.salvoIndex)) {
          launched.add(f.salvoIndex);
          warEntities.push(
            entities.add({
              position: cartesian(from),
              point: { pixelSize: 10, color, outlineColor: HALO, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
              label: { ...labelStyle(`${f.salvoIndex + 1}`, color), horizontalOrigin: HorizontalOrigin.CENTER, verticalOrigin: VerticalOrigin.BOTTOM, pixelOffset: new Cartesian2(0, -12) },
            }),
          );
          points.push(cartesian(from));
        }
        const plan = f.plan;
        const path = flightPositions(from, f.target, plan);
        points.push(cartesian(f.target));
        warEntities.push(
          entities.add({
            polyline: { positions: path, width: 4, arcType: ArcType.NONE, material: new PolylineGlowMaterialProperty({ color: color.withAlpha(0.85), glowPower: 0.18 }) },
          }),
          entities.add({
            position: cartesian(f.target),
            point: { pixelSize: 8, color: RED, outlineColor: HALO, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
          }),
          // The warhead: at the launch point during the powered climb, then along its path.
          entities.add({
            position: new CallbackPositionProperty(() => {
              const t = warClock.value - f.freeFlightStartS;
              if (t <= 0) return cartesian(from, MIN_DRAW_HEIGHT);
              const p = positionAt(plan, t);
              return cartesian(alongGreatCircle(from, f.target, p.downrangeM / plan.rangeM), Math.max(p.altitudeM, PATH_MIN_HEIGHT));
            }, false),
            point: {
              show: new CallbackProperty(() => warClock.value >= f.salvo.launchAtS && warClock.value < f.impactS, false),
              pixelSize: 8,
              color: Color.WHITE,
              outlineColor: color,
              outlineWidth: 3,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          }),
          // Where it comes down, from the moment it arrives; fainter the less likely it gets through.
          entities.add({
            position: cartesian(f.target),
            point: {
              show: new CallbackProperty(() => warClock.value > 0 && warClock.value >= f.impactS, false),
              pixelSize: 22,
              color: AMBER.withAlpha(0.2 + 0.5 * f.leak),
              outlineColor: Color.WHITE.withAlpha(0.4 + 0.5 * f.leak),
              outlineWidth: 2,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          }),
        );
      }
      // The camera moves only when launches are added or removed, not when the defence changes.
      const changed = framedSalvos !== salvos.value;
      framedSalvos = salvos.value;
      if (changed && points.length > 1 && !untracked(() => playing.value)) {
        const sphere = BoundingSphere.fromPoints(points);
        sphere.radius = Math.max(sphere.radius, 6e5);
        camera.flyToBoundingSphere(sphere, { duration: settings.value.reduceMotion ? 0 : 1.2, offset: new HeadingPitchRange(0, CesiumMath.toRadians(-60), sphere.radius * 3.2) });
      }
      scene.requestRender();
    };

    // Looks at everything placed from the side and from well back: the arcs show their
    // height, and nothing ends up behind the panel.
    let framed: Cartesian3[] = [];
    const frameFlights = (duration: number): void => {
      if (framed.length < 2) return;
      const sphere = BoundingSphere.fromPoints(framed);
      sphere.radius = Math.max(sphere.radius, 4e5);
      const from = launchPoint.value;
      const first = flights.value[0];
      camera.flyToBoundingSphere(sphere, {
        duration,
        offset: new HeadingPitchRange(
          CesiumMath.toRadians(from && first ? sideViewHeading(initialBearing(from, first.target)) : 0),
          CesiumMath.toRadians(-38),
          // A small screen needs more room around the flight for the labels.
          sphere.radius * (isNarrow(element) ? 4.3 : 3.4),
        ),
      });
    };

    // The close view of the launch: launcher, missile, and the camera that follows them.
    const launch = createLaunchScene(widget, {
      progress: () => launcherProgress.value,
      liftoff: () => liftoffProgress.value,
      stage: () => stage.value,
    });
    const removeDirector = scene.preUpdate.addEventListener(() => {
      if (cinematic.value && playing.value) launch.directCamera();
    });
    let shownStage = stage.value;
    const onStage = (): void => {
      const now = stage.value;
      const before = shownStage;
      shownStage = now;
      if (now === before) return;
      const instant = settings.value.reduceMotion;
      if (!cinematic.value) return;
      if (now === 'midcourse' && playing.value && (before === 'boost' || before === 'launcher')) frameFlights(instant ? 0 : 2.4);
      else if (now === 'terminal' && playing.value) {
        const from = launchPoint.value;
        const lead = flights.value[leadIndex.value];
        if (from && lead) launch.showArrival(lead.target, from, instant);
      } else if (now === 'idle' && (before === 'launcher' || before === 'boost')) frameFlights(instant ? 0 : 1);
    };

    // A click on the globe places the launch point or a target.
    const handler = new ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((click: { position: Cartesian2 }) => {
      const hit = camera.pickEllipsoid(click.position, scene.globe.ellipsoid);
      if (!hit) return;
      const where = Cartographic.fromCartesian(hit);
      placePoint({ lng: CesiumMath.toDegrees(where.longitude), lat: CesiumMath.toDegrees(where.latitude) });
    }, ScreenSpaceEventType.LEFT_CLICK);

    const disposers = [
      effect(() => {
        void settings.value.mapSource;
        applyImagery();
      }),
      effect(() => {
        void settings.value.language;
        drawNames();
      }),
      effect(() => {
        void launchPoint.value;
        void flights.value;
        void reach.value;
        void missile.value;
        void settings.value.language;
        void settings.value.distance;
        void leadIndex.value;
        void timeline.value;
        drawLaunch();
      }),
      effect(() => {
        void salvos.value;
        void warFlights.value;
        void settings.value.language;
        drawWar();
      }),
      effect(() => {
        void warClock.value;
        scene.requestRender();
      }),
      effect(() => {
        void clock.value;
        void launcherProgress.value;
        void liftoffProgress.value;
        scene.requestRender();
      }),
      effect(() => {
        void stage.value;
        onStage();
      }),
    ];

    const resize = new ResizeObserver(() => {
      widget.resize();
      scene.requestRender();
    });
    resize.observe(element);

    return () => {
      clearTimeout(loadingTimeout);
      endLoading();
      resize.disconnect();
      disposers.forEach((dispose) => dispose());
      removeCameraChanged();
      removeCameraMoved();
      removeDirector();
      launch.destroy();
      handler.destroy();
      widget.destroy();
      widgetRef.current = null;
    };
  }, []);

  // A hidden globe does not draw.
  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget) return;
    widget.useDefaultRenderLoop = active;
    if (active) {
      widget.resize();
      widget.scene.requestRender();
    }
  }, [active]);

  return (
    <div class="globe" data-testid="globe">
      <div class="globe-canvas" ref={container} />
      <div class="globe-credits" ref={credits} />
    </div>
  );
}
