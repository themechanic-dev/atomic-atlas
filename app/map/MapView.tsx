// The map: MapLibre GL with a globe at low zoom and 3D buildings in cities.

import { effect } from '@preact/signals';
import type { FeatureCollection } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap, Marker, Popup } from 'maplibre-gl';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { useEffect, useRef } from 'preact/hooks';
import { accumulatedDose } from '@physics/fallout/wseg10';
import { t } from '../i18n';
import { formatDistance, formatDoseRate, formatExposure, formatLatLon, formatPressure, formatDose } from '../lib/format';
import { distanceM, type LngLat } from '../lib/geo';
import { settings } from '../state/settings';
import { beginBusy, detonation, groundZero } from '../state/simulation';
import {
  buildingColorExpression,
  falloutFeatures,
  resultBounds,
  ringFeatures,
  ringLabelFeatures,
} from './overlays';
import { panelOpen, WIDE_LAYOUT } from '../state/ui';
import { LABEL_FONT, skyFor, styleFor, TERRAIN_TILES, tuneStyle } from './style';

maplibregl.setWorkerUrl(new URL(workerUrl, document.baseURI).href);

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
const BUILDING_LAYER = 'building-3d';
const TERRAIN_SOURCE = 'aa-terrain';

/** Handle for tests and for other panels that need to move the camera. */
export const mapHandle: { map: MapLibreMap | null } = { map: null };

function normalise(lngLat: { lng: number; lat: number }): LngLat {
  return { lng: ((((lngLat.lng + 180) % 360) + 360) % 360) - 180, lat: Math.max(-85, Math.min(85, lngLat.lat)) };
}

/**
 * The layer our shapes go under: the first label layer that follows all the map's own
 * areas, roads and borders. (Some styles put a water label early in the list, so the
 * first symbol layer is not the right place.)
 */
function labelStartLayer(map: MapLibreMap): string | undefined {
  const layers = map.getStyle().layers;
  let lastDrawn = -1;
  layers.forEach((layer, index) => {
    if (layer.type !== 'symbol') lastDrawn = index;
  });
  return layers[lastDrawn + 1]?.id;
}

/** Adds our sources and layers to a freshly loaded style. */
function addOverlays(map: MapLibreMap): void {
  const theme = settings.value.theme;

  // 3D buildings: the light online style has them; the dark one only has footprints.
  if (map.getSource('openmaptiles') && !map.getLayer(BUILDING_LAYER)) {
    map.addLayer(
      {
        id: BUILDING_LAYER,
        type: 'fill-extrusion',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 13,
        filter: ['!=', ['get', 'hide_3d'], true],
        paint: {
          'fill-extrusion-color': theme === 'dark' ? '#3a4047' : '#d9d3c7',
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.92,
        },
      },
      labelStartLayer(map),
    );
  }

  const below = map.getLayer(BUILDING_LAYER) ? BUILDING_LAYER : labelStartLayer(map);

  map.addSource('aa-fallout', { type: 'geojson', data: EMPTY });
  map.addSource('aa-rings', { type: 'geojson', data: EMPTY });
  map.addSource('aa-ring-labels', { type: 'geojson', data: EMPTY });

  map.addLayer(
    {
      id: 'aa-fallout-fill',
      type: 'fill',
      source: 'aa-fallout',
      paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.28 },
    },
    below,
  );
  map.addLayer(
    {
      id: 'aa-fallout-line',
      type: 'line',
      source: 'aa-fallout',
      paint: { 'line-color': ['get', 'color'], 'line-width': 1.2, 'line-opacity': 0.9 },
    },
    below,
  );
  map.addLayer(
    {
      id: 'aa-rings-fill',
      type: 'fill',
      source: 'aa-rings',
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': ['match', ['get', 'kind'], 'fireball', 0.55, 'blast', 0.1, 'thermal', 0.06, 0.08],
      },
    },
    below,
  );
  // Blast rings are solid, thermal rings dashed, the radiation ring dotted.
  map.addLayer({
    id: 'aa-rings-line',
    type: 'line',
    source: 'aa-rings',
    filter: ['in', ['get', 'kind'], ['literal', ['blast', 'fireball']]],
    paint: { 'line-color': ['get', 'color'], 'line-width': 2.2 },
  });
  map.addLayer({
    id: 'aa-rings-line-thermal',
    type: 'line',
    source: 'aa-rings',
    filter: ['==', ['get', 'kind'], 'thermal'],
    paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [3, 2] },
  });
  map.addLayer({
    id: 'aa-rings-line-radiation',
    type: 'line',
    source: 'aa-rings',
    filter: ['==', ['get', 'kind'], 'radiation'],
    paint: { 'line-color': ['get', 'color'], 'line-width': 2.4, 'line-dasharray': [0.6, 1.6] },
  });
  map.addLayer({
    id: 'aa-ring-labels',
    type: 'symbol',
    source: 'aa-ring-labels',
    layout: {
      'text-field': ['get', 'label'],
      'text-font': LABEL_FONT,
      'text-size': 12.5,
      'text-anchor': 'left',
      'text-offset': [0.5, 0],
      'text-allow-overlap': false,
      'text-max-width': 14,
    },
    paint: {
      'text-color': theme === 'dark' ? '#f4efe6' : '#1f2124',
      'text-halo-color': theme === 'dark' ? '#101214' : '#ffffff',
      'text-halo-width': 1.6,
    },
  });
}

function applyTerrain(map: MapLibreMap): void {
  const wanted = settings.value.terrain3d;
  if (wanted && !map.getSource(TERRAIN_SOURCE)) {
    map.addSource(TERRAIN_SOURCE, {
      type: 'raster-dem',
      tiles: [TERRAIN_TILES],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 14,
      attribution: 'Terrain: Mapzen / AWS Terrain Tiles',
    });
  }
  map.setTerrain(wanted ? { source: TERRAIN_SOURCE, exaggeration: 1 } : null);
}

function applyBuildings(map: MapLibreMap): void {
  if (!map.getLayer(BUILDING_LAYER)) return;
  const current = detonation.value;
  map.setLayoutProperty(BUILDING_LAYER, 'visibility', settings.value.buildings3d ? 'visible' : 'none');
  map.setPaintProperty(
    BUILDING_LAYER,
    'fill-extrusion-color',
    buildingColorExpression(current?.at ?? null, current?.result ?? null, settings.value.theme) as never,
  );
}

function applyDetonation(map: MapLibreMap): void {
  const current = detonation.value;
  const rings = map.getSource('aa-rings') as GeoJSONSource | undefined;
  const labels = map.getSource('aa-ring-labels') as GeoJSONSource | undefined;
  const fallout = map.getSource('aa-fallout') as GeoJSONSource | undefined;
  if (!rings || !labels || !fallout) return;
  if (!current) {
    rings.setData(EMPTY);
    labels.setData(EMPTY);
    fallout.setData(EMPTY);
  } else {
    rings.setData(ringFeatures(current.at, current.result));
    labels.setData(
      ringLabelFeatures(current.at, current.result.rings, (ring) => `${t(`effect.${ring.id}.short`)} · ${formatDistance(ring.radiusM)}`),
    );
    fallout.setData(falloutFeatures(current.at, current.result));
  }
  applyBuildings(map);
}

/** Text of the read-out for a point: what the detonation does there. */
function probeHtml(point: LngLat): string {
  const current = detonation.value;
  const rows: Array<[string, string]> = [[t('probe.position'), formatLatLon(point.lat, point.lng)]];
  if (current) {
    const range = distanceM(current.at, point);
    const e = current.result.effects;
    rows.push([t('probe.distance'), formatDistance(range)]);
    rows.push([t('quantity.overpressure'), formatPressure(e.overpressurePsi(range))]);
    rows.push([t('quantity.radiantExposure'), formatExposure(e.radiantExposure(range))]);
    const low = e.initialDose(range, false);
    const high = e.initialDose(range, true);
    rows.push([t('quantity.dose'), high / Math.max(low, 1e-12) > 1.05 ? `${formatDose(low)} – ${formatDose(high)}` : formatDose(low)]);
    const model = current.result.fallout.model;
    if (model) {
      // Position of the point in wind coordinates.
      const towards = (current.result.fallout.wind.towardsDeg * Math.PI) / 180;
      const north = ((point.lat - current.at.lat) * Math.PI) / 180;
      const east = (((point.lng - current.at.lng) * Math.PI) / 180) * Math.cos((current.at.lat * Math.PI) / 180);
      const R = 6371008.8;
      const x = (east * Math.sin(towards) + north * Math.cos(towards)) * R;
      const y = (-east * Math.cos(towards) + north * Math.sin(towards)) * R;
      const rate = model.doseRateH1(x, y);
      if (rate >= 0.01) {
        const arrival = model.arrivalTimeH(x);
        rows.push([t('probe.falloutRate'), formatDoseRate(rate)]);
        rows.push([t('probe.falloutDose48'), formatDose(accumulatedDose(rate, arrival, arrival + 48))]);
      }
    }
  }
  const escape = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  return (
    `<div class="probe"><div class="probe-title">${escape(t('probe.title'))}</div><dl>` +
    rows.map(([k, v]) => `<dt>${escape(k)}</dt><dd>${escape(v)}</dd>`).join('') +
    '</dl></div>'
  );
}

export function MapView() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return;

    const s = settings.value;
    let appliedStyleKey = `${s.mapSource}|${s.theme}|${s.mapStyleUrl}|${s.mapSource === 'openfreemap' ? '' : s.language}`;
    let endLoading: (() => void) | null = beginBusy('busy.map');
    const finishLoading = (): void => {
      endLoading?.();
      endLoading = null;
    };

    const applyStyle = (): void => {
      const v = settings.value;
      map.setStyle(styleFor(v.mapSource, v.theme, v.language, v.mapStyleUrl), {
        transformStyle: (_previous, next) => tuneStyle(next, v.mapSource, v.theme, v.mapStyleUrl),
      });
    };

    const map = new maplibregl.Map({
      container: element,
      center: [18, 34],
      zoom: 1.7,
      maxPitch: 78,
      attributionControl: { compact: true },
    });
    mapHandle.map = map;
    // For diagnosis from the developer tools: __atomicAtlas.map is the MapLibre map.
    (globalThis as { __atomicAtlas?: unknown }).__atomicAtlas = mapHandle;
    applyStyle();

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true, showZoom: true }), 'top-right');

    // A button to tilt the view, for people who do not know the ctrl-drag or two-finger gesture.
    const tiltButton = document.createElement('button');
    tiltButton.type = 'button';
    tiltButton.className = 'tilt-btn';
    tiltButton.dataset.testid = 'tilt';
    const tiltHolder = document.createElement('div');
    tiltHolder.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    tiltHolder.appendChild(tiltButton);
    const syncTilt = (): void => {
      const tilted = map.getPitch() > 5;
      tiltButton.textContent = tilted ? '2D' : '3D';
      tiltButton.title = t(tilted ? 'map.flat' : 'map.tilt');
      tiltButton.setAttribute('aria-label', tiltButton.title);
    };
    tiltButton.addEventListener('click', () => {
      const tilted = map.getPitch() > 5;
      map.easeTo({ pitch: tilted ? 0 : 58, bearing: tilted ? 0 : map.getBearing(), duration: settings.value.reduceMotion ? 0 : 700 });
    });
    map.on('pitchend', syncTilt);
    map.addControl({ onAdd: () => tiltHolder, onRemove: () => tiltHolder.remove() }, 'top-right');
    let scale = new maplibregl.ScaleControl({ unit: s.distance === 'mi' ? 'imperial' : 'metric', maxWidth: 140 });
    map.addControl(scale, 'bottom-right');

    const markerElement = document.createElement('div');
    markerElement.className = 'gz-marker';
    markerElement.setAttribute('role', 'img');
    const marker: Marker = new maplibregl.Marker({ element: markerElement, draggable: true });
    let popup: Popup | null = null;

    let styleReady = false;
    map.on('style.load', () => {
      styleReady = true;
      try {
        map.setProjection({ type: 'globe' });
        map.setSky(skyFor(settings.value.theme) as never);
      } catch {
        // Older WebViews without the features the globe needs fall back to the flat map.
      }
      addOverlays(map);
      applyTerrain(map);
      applyDetonation(map);
    });
    map.on('idle', finishLoading);
    map.on('error', (event) => {
      // A failed tile or font must not leave the working indicator up.
      console.warn('map:', event.error?.message ?? event);
      finishLoading();
    });

    map.on('click', (event) => {
      popup?.remove();
      groundZero.value = normalise(event.lngLat);
    });
    map.on('contextmenu', (event) => {
      const point = normalise(event.lngLat);
      popup?.remove();
      popup = new maplibregl.Popup({ closeButton: true, maxWidth: '320px', className: 'probe-popup' })
        .setLngLat(event.lngLat)
        .setHTML(probeHtml(point))
        .addTo(map);
    });
    marker.on('dragend', () => {
      groundZero.value = normalise(marker.getLngLat());
    });

    const disposers = [
      // Ground zero marker follows the state.
      effect(() => {
        const at = groundZero.value;
        markerElement.title = t('map.groundZero');
        syncTilt();
        if (at) marker.setLngLat([at.lng, at.lat]).addTo(map);
        else marker.remove();
      }),
      // Style follows the settings.
      effect(() => {
        const v = settings.value;
        const key = `${v.mapSource}|${v.theme}|${v.mapStyleUrl}|${v.mapSource === 'openfreemap' ? '' : v.language}`;
        if (key === appliedStyleKey) return;
        appliedStyleKey = key;
        styleReady = false;
        endLoading ??= beginBusy('busy.map');
        applyStyle();
      }),
      // The panel covers the left of the map on wide windows: keep the view centred in what is left.
      effect(() => {
        const left = panelOpen.value && window.innerWidth >= WIDE_LAYOUT ? 412 : 0;
        map.easeTo({ padding: { left, top: 0, right: 0, bottom: 0 }, duration: settings.value.reduceMotion ? 0 : 300 });
      }),
      // Overlays follow the result, the language and the units.
      effect(() => {
        void detonation.value;
        void settings.value.language;
        void settings.value.distance;
        void settings.value.buildings3d;
        if (styleReady) applyDetonation(map);
      }),
      effect(() => {
        void settings.value.terrain3d;
        if (styleReady) applyTerrain(map);
      }),
      effect(() => {
        const unit = settings.value.distance === 'mi' ? 'imperial' : 'metric';
        map.removeControl(scale);
        scale = new maplibregl.ScaleControl({ unit, maxWidth: 140 });
        map.addControl(scale, 'bottom-right');
      }),
      // A new detonation brings everything it draws into view.
      effect(() => {
        const current = detonation.value;
        if (!current) return;
        popup?.remove();
        const wide = window.innerWidth >= WIDE_LAYOUT;
        const bounds = resultBounds(current.at, current.result, false);
        map.fitBounds(
          [
            [bounds[0], bounds[1]],
            [bounds[2], bounds[3]],
          ],
          {
            // On wide windows the map already keeps clear of the panel (its own padding).
            padding: wide
              ? { top: 70, bottom: 70, left: 50, right: 90 }
              : { top: 60, bottom: Math.round(window.innerHeight * 0.46) + 20, left: 30, right: 30 },
            duration: settings.value.reduceMotion ? 0 : 1600,
            maxZoom: 16,
          },
        );
      }),
    ];

    const resize = new ResizeObserver(() => map.resize());
    resize.observe(element);

    return () => {
      resize.disconnect();
      disposers.forEach((dispose) => dispose());
      finishLoading();
      popup?.remove();
      marker.remove();
      map.remove();
      if (mapHandle.map === map) mapHandle.map = null;
    };
  }, []);

  // MapLibre sets its own positioning on the element it is given, so it gets an inner one.
  return (
    <div class="map" data-testid="map">
      <div class="map-canvas" ref={container} />
    </div>
  );
}
