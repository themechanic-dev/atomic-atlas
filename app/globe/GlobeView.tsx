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
import { effect } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { positionAt, type FlightPlan } from '@physics/ballistics/flight';
import { t } from '../i18n';
import { formatDistance } from '../lib/format';
import { alongGreatCircle, circleRing, initialBearing, type LngLat } from '../lib/geo';
import { clock, flights, launchPoint, missile, placePoint, reach } from '../state/missiles';
import { settings } from '../state/settings';
import { beginBusy } from '../state/simulation';

// Cesium fetches its workers and textures from here (copied by the build, see vite.config.ts).
(globalThis as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = new URL('./cesium/', document.baseURI).href;
// No Cesium ion account is used: the imagery below needs no key.
Ion.defaultAccessToken = '';

const SATELLITE_TILES = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg';

const AMBER = Color.fromCssColorString('#f5a524');
const RED = Color.fromCssColorString('#ff4d3d');
const WHITE = Color.fromCssColorString('#f4efe6');
const HALO = Color.fromCssColorString('#101214');

/** Heights are drawn a little above the true value near the ground so lines do not sink into the surface. */
const MIN_DRAW_HEIGHT = 3000;

function cartesian(point: LngLat, heightM = 0): Cartesian3 {
  return Cartesian3.fromDegrees(point.lng, point.lat, heightM);
}

/** 3D positions of a flight from launch to target. */
function flightPositions(from: LngLat, to: LngLat, plan: FlightPlan): Cartesian3[] {
  return plan.points.map((p) => cartesian(alongGreatCircle(from, to, p.downrangeM / plan.rangeM), Math.max(p.altitudeM, MIN_DRAW_HEIGHT)));
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
    const { scene, camera, entities } = widget;
    scene.globe.enableLighting = false;
    scene.globe.baseColor = Color.fromCssColorString('#0e1317');
    camera.setView({ destination: Cartesian3.fromDegrees(18, 34, 2.2e7) });
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
    let countryData: Array<{ name: string; name_el: string; rank: number; lng: number; lat: number }> | null = null;
    const drawNames = (): void => {
      nameEntities.splice(0).forEach((entity) => entities.remove(entity));
      if (!countryData) return;
      const greek = settings.value.language === 'el';
      for (const c of countryData) {
        if (c.rank > 4) continue;
        nameEntities.push(
          entities.add({
            position: Cartesian3.fromDegrees(c.lng, c.lat, 0),
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
          }),
        );
      }
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
    const drawLaunch = (): void => {
      launchEntities.splice(0).forEach((entity) => entities.remove(entity));
      const from = launchPoint.value;
      const weapon = missile.value;
      if (from) {
        launchEntities.push(
          entities.add({
            position: cartesian(from),
            point: { pixelSize: 12, color: AMBER, outlineColor: HALO, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
            label: labelStyle(t('missiles.launchPoint'), AMBER),
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
              return cartesian(alongGreatCircle(from, flight.target, p.downrangeM / plan.rangeM), Math.max(p.altitudeM, MIN_DRAW_HEIGHT));
            }, false),
            point: { pixelSize: 9, color: Color.WHITE, outlineColor: RED, outlineWidth: 3, disableDepthTestDistance: Number.POSITIVE_INFINITY },
          }),
        );
      });
      if (all.length >= 2) {
        const sphere = BoundingSphere.fromPoints(all);
        sphere.radius = Math.max(sphere.radius, 4e5);
        // Look at the flight from the side and from well back: the arc shows its height,
        // and nothing ends up behind the panel.
        const first = flights.value[0];
        const heading = from && first ? CesiumMath.toRadians(initialBearing(from, first.target) + 90) : 0;
        camera.flyToBoundingSphere(sphere, {
          duration: settings.value.reduceMotion ? 0 : 1.4,
          offset: new HeadingPitchRange(heading, CesiumMath.toRadians(-38), sphere.radius * 3.4),
        });
      }
      scene.requestRender();
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
        drawLaunch();
      }),
      effect(() => {
        void clock.value;
        scene.requestRender();
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
