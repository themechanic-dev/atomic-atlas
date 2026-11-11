// The map: MapLibre GL with a globe at low zoom and 3D buildings in cities.

import { effect, signal, untracked } from '@preact/signals';
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
import { ensureSites, sites } from '../state/infrastructure';
import { settings } from '../state/settings';
import { blastClock, blastFrame, blastPlaying, blastPrepared, blastPreparing, flashCount } from '../state/blastPlayback';
import { beginBusy, detonation, groundZero } from '../state/simulation';
import {
  buildingBands,
  falloutFeatures,
  resultBounds,
  ringFeatures,
  ringLabelFeatures,
  ringsAt,
  siteFeatures,
} from './overlays';
import { closeupRange, panelOpen, WIDE_LAYOUT } from '../state/ui';
import { createBuildingDamage, DAMAGE_LAYER } from './buildingDamage';
import { LABEL_FONT, skyFor, styleFor, TERRAIN_TILES, tuneStyle } from './style';

maplibregl.setWorkerUrl(new URL(workerUrl, document.baseURI).href);

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
const BUILDING_LAYER = 'building-3d';
const TERRAIN_SOURCE = 'aa-terrain';

/** True when the map could not start on this device (no WebGL 2). */
export const mapFailed = signal(false);

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
        // Below zoom 14 the tiles hold the buildings of a whole area merged into a few
        // shapes, which cannot be coloured one by one.
        minzoom: 14,
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

  // Our own single buildings, drawn in place of the map's while a detonation is shown.
  if (map.getLayer(BUILDING_LAYER)) buildingDamage?.addTo(theme, labelStartLayer(map));

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
        'fill-opacity': ['match', ['get', 'kind'], 'fireball', 0.55, 'blast', 0.1, 'thermal', ['coalesce', ['get', 'glow'], 0.06], 'front', 0, 0.08],
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
  // Airports (squares would need an icon; a ringed dot does) and power stations, by fuel.
  map.addSource('aa-sites', { type: 'geojson', data: siteFeatures(sites.value) });
  map.addLayer({
    id: 'aa-sites',
    type: 'circle',
    source: 'aa-sites',
    minzoom: 5,
    filter: ['any', ['get', 'major'], ['>=', ['zoom'], 7]],
    layout: { visibility: settings.value.infrastructure ? 'visible' : 'none' },
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 2.5, 10, 5, 14, 7],
      'circle-color': ['get', 'color'],
      'circle-stroke-color': theme === 'dark' ? '#101214' : '#ffffff',
      'circle-stroke-width': ['match', ['get', 'kind'], 'airport', 2, 1],
      'circle-opacity': 0.95,
    },
  });
  map.addLayer({
    id: 'aa-sites-labels',
    type: 'symbol',
    source: 'aa-sites',
    minzoom: 9,
    layout: {
      visibility: settings.value.infrastructure ? 'visible' : 'none',
      'text-field': ['get', 'name'],
      'text-font': LABEL_FONT,
      'text-size': 11,
      'text-anchor': 'top',
      'text-offset': [0, 0.7],
      'text-max-width': 10,
      'text-optional': true,
    },
    paint: {
      'text-color': theme === 'dark' ? '#d9d5cc' : '#2a2c2f',
      'text-halo-color': theme === 'dark' ? '#101214' : '#ffffff',
      'text-halo-width': 1.4,
    },
  });

  // The blast front during playback: a bright line that sweeps outwards.
  map.addLayer({
    id: 'aa-rings-line-front',
    type: 'line',
    source: 'aa-rings',
    filter: ['==', ['get', 'kind'], 'front'],
    paint: { 'line-color': '#ffffff', 'line-width': 3.5, 'line-blur': 2, 'line-opacity': 0.95 },
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

/** Splits buildings into single ones and shows their damage; made with the map. */
let buildingDamage: ReturnType<typeof createBuildingDamage> | null = null;

/** During playback: the buildings the blast front has reached show their damage. */
function applyReach(exact = false): void {
  const frame = blastFrame.value;
  buildingDamage?.setFront(frame ? frame.frontM : null, exact);
}

/** Shows the map's own buildings, or ours with their damage while a detonation is on the map. */
function applyBuildings(map: MapLibreMap): void {
  if (!map.getLayer(BUILDING_LAYER)) return;
  const current = detonation.value;
  const wanted = settings.value.buildings3d;
  buildingDamage?.setResult(current?.at ?? null, buildingBands(current?.result ?? null));
  applyReach();
  const ours = wanted && current !== null && map.getLayer(DAMAGE_LAYER) !== undefined;
  map.setLayoutProperty(BUILDING_LAYER, 'visibility', wanted && !ours ? 'visible' : 'none');
  if (map.getLayer(DAMAGE_LAYER)) map.setLayoutProperty(DAMAGE_LAYER, 'visibility', ours ? 'visible' : 'none');
}

function applyDetonation(map: MapLibreMap, playbackOnly = false): void {
  const current = detonation.value;
  const rings = map.getSource('aa-rings') as GeoJSONSource | undefined;
  const labels = map.getSource('aa-ring-labels') as GeoJSONSource | undefined;
  const fallout = map.getSource('aa-fallout') as GeoJSONSource | undefined;
  if (!rings || !labels || !fallout) return;
  const frame = blastFrame.value;
  if (playbackOnly && frame) {
    // The rings follow the clock about five times a second. Measured: with the 3D buildings
    // on screen, fifteen updates a second bring the map down to two frames a second.
    const now = performance.now();
    if (now - ringsAppliedAt < 180) return;
    ringsAppliedAt = now;
    applyReach();
  }
  if (!current) {
    rings.setData(EMPTY);
    labels.setData(EMPTY);
    fallout.setData(EMPTY);
  } else {
    rings.setData(ringFeatures(current.at, current.result, frame));
    labels.setData(
      ringLabelFeatures(current.at, ringsAt(current.result, frame), (ring) => `${t(`effect.${ring.id}.short`)} · ${formatDistance(ring.radiusM)}`),
    );
    const showFallout = !frame || frame.falloutShown;
    if (showFallout !== falloutDrawn || !playbackOnly) {
      falloutDrawn = showFallout;
      fallout.setData(showFallout ? falloutFeatures(current.at, current.result) : EMPTY);
    }
  }
  if (playbackOnly) applyReach();
  else applyBuildings(map);
}

let falloutDrawn = true;
let ringsAppliedAt = 0;

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
    '</dl>' +
    (current ? `<button type="button" class="btn btn-secondary probe-closeup" data-closeup data-testid="probe-closeup">${escape(t('closeup.open'))}</button>` : '') +
    '</div>'
  );
}

/** Creates the MapLibre map. Throws when the device has no WebGL 2. */
function createMap(element: HTMLElement): MapLibreMap {
  return new maplibregl.Map({
    container: element,
    center: [18, 34],
    zoom: 1.7,
    maxPitch: 78,
    attributionControl: { compact: true },
  });
}

export function MapView() {
  const container = useRef<HTMLDivElement>(null);
  const flashElement = useRef<HTMLDivElement>(null);

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

    let map: MapLibreMap;
    try {
      map = createMap(element);
    } catch (error) {
      // No WebGL 2: the rest of the app still works, so say what is wrong instead of a blank area.
      console.error('map could not start', error);
      finishLoading();
      mapFailed.value = true;
      return;
    }
    mapFailed.value = false;
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
    buildingDamage = createBuildingDamage(map);
    ensureSites();
    map.on('idle', finishLoading);
    // Buildings that came in with new tiles are taken over when the map comes to rest.
    map.on('idle', () => {
      // Not during playback: looking through the tiles takes a tenth of a second.
      if (!blastPlaying.value) buildingDamage?.collect();
    });
    // Online styles sometimes name an icon their sprite does not have; an empty image
    // stands in for it, so the rest of the layer still draws.
    map.on('styleimagemissing', (event) => {
      if (!map.hasImage(event.id)) map.addImage(event.id, { width: 1, height: 1, data: new Uint8Array(4) });
    });
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
      // The read-out can open the close view for this point.
      const current = detonation.value;
      popup
        .getElement()
        ?.querySelector('[data-closeup]')
        ?.addEventListener('click', () => {
          if (current) closeupRange.value = Math.max(50, distanceM(current.at, point));
          popup?.remove();
        });
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
        // Not tied to the playback clock: that has its own, lighter update below.
        if (styleReady) untracked(() => applyDetonation(map));
      }),
      // Infrastructure: the data arrives a moment after the map; the setting shows or hides it.
      effect(() => {
        const list = sites.value;
        const visibility = settings.value.infrastructure ? 'visible' : 'none';
        if (!styleReady) return;
        (map.getSource('aa-sites') as GeoJSONSource | undefined)?.setData(siteFeatures(list));
        for (const id of ['aa-sites', 'aa-sites-labels']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility);
      }),
      // Playback: the picture follows the clock.
      effect(() => {
        const frame = blastFrame.value;
        if (!styleReady) return;
        applyDetonation(map, true);
        if (!frame) applyReach();
      }),
      // Play was pressed: once the buildings stand again as before the burst, the clock may start.
      effect(() => {
        if (!blastPreparing.value) return;
        // The buildings stand again at once; one frame is enough for the map to show it.
        requestAnimationFrame(() => blastPrepared());
      }),
      // When the clock stops (pause, end, a jump on the slider) the moment it stopped at is drawn exactly.
      effect(() => {
        if (blastPlaying.value || !styleReady) return;
        void blastClock.value;
        ringsAppliedAt = 0;
        applyDetonation(map, true);
        applyReach(true);
      }),
      effect(() => {
        const count = flashCount.value;
        const flash = flashElement.current;
        if (!flash || count === 0 || settings.value.reduceMotion) return;
        flash.classList.remove('is-on');
        void flash.offsetWidth;
        flash.classList.add('is-on');
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
      <div class="map-flash" ref={flashElement} aria-hidden="true" />
      {mapFailed.value ? (
        <div class="map-failed" role="alert" data-testid="map-failed">
          <strong>{t('map.failed.title')}</strong>
          <p>{t('map.failed.text')}</p>
        </div>
      ) : null}
    </div>
  );
}
