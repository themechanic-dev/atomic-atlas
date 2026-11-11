// Map styles: where the base map comes from.
//
//   openfreemap  detailed vector map with building heights (online, no key)
//   builtin      the small world map shipped with the app (works offline)
//   satellite    Sentinel-2 cloudless imagery by EOX (online, no key), with built-in labels

import type { StyleSpecification } from 'maplibre-gl';
import type { Language, MapSourceId, Theme } from '../state/settings';

export const OPENFREEMAP_STYLES: Record<Theme, string> = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/liberty',
};

const SATELLITE_TILES = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg';
export const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

export const LABEL_FONT = ['Noto Sans Regular'];

/** Absolute address of a file shipped with the app (MapLibre needs absolute URLs). */
function asset(path: string): string {
  const base = document.baseURI.replace(/[^/]*$/, '');
  return base + path;
}

interface Palette {
  ocean: string;
  land: string;
  lake: string;
  border: string;
  label: string;
  labelDim: string;
  halo: string;
}

const PALETTE: Record<Theme, Palette> = {
  dark: {
    ocean: '#0e1317',
    land: '#252a30',
    lake: '#0e1317',
    border: '#59616b',
    label: '#d9d4cb',
    labelDim: '#9a9da0',
    halo: '#14171a',
  },
  light: {
    ocean: '#c9dbe6',
    land: '#f2efe8',
    lake: '#c9dbe6',
    border: '#9c968c',
    label: '#2b2e33',
    labelDim: '#5d6066',
    halo: '#ffffff',
  },
};

function labelLayers(theme: Theme, language: Language, overImagery: boolean): StyleSpecification['layers'] {
  const p = overImagery ? { ...PALETTE.dark, halo: '#000000', label: '#ffffff', labelDim: '#e6e2da' } : PALETTE[theme];
  const countryName = language === 'el' ? ['coalesce', ['get', 'name_el'], ['get', 'name']] : ['get', 'name'];
  return [
    {
      id: 'country-labels',
      type: 'symbol',
      source: 'countries',
      minzoom: 1.5,
      maxzoom: 7,
      filter: ['<=', ['get', 'rank'], ['+', ['zoom'], 1.5]],
      layout: {
        'text-field': countryName as never,
        'text-font': LABEL_FONT,
        'text-size': ['interpolate', ['linear'], ['zoom'], 2, 11, 6, 16],
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.08,
        'text-max-width': 8,
      },
      paint: { 'text-color': p.labelDim, 'text-halo-color': p.halo, 'text-halo-width': 1.2 },
    },
    {
      id: 'place-labels',
      type: 'symbol',
      source: 'places',
      minzoom: 3,
      filter: ['<=', ['get', 'rank'], ['-', ['zoom'], 1.5]],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': LABEL_FONT,
        'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 8, 14],
        'text-anchor': 'top',
        'text-offset': [0, 0.35],
        'icon-allow-overlap': false,
        'symbol-sort-key': ['get', 'rank'],
      },
      paint: { 'text-color': p.label, 'text-halo-color': p.halo, 'text-halo-width': 1.2 },
    },
  ];
}

const LABEL_SOURCES = (): StyleSpecification['sources'] => ({
  countries: { type: 'geojson', data: asset('data/basemap/countries.json') },
  places: { type: 'geojson', data: asset('data/basemap/places.json') },
});

/** The world map that ships with the app: Natural Earth 1:50m. */
export function builtinStyle(theme: Theme, language: Language): StyleSpecification {
  const p = PALETTE[theme];
  return {
    version: 8,
    name: 'Atomic Atlas built-in',
    glyphs: asset('fonts/{fontstack}/{range}.pbf'),
    sources: {
      land: { type: 'geojson', data: asset('data/basemap/land.json'), attribution: 'Natural Earth' },
      lakes: { type: 'geojson', data: asset('data/basemap/lakes.json') },
      borders: { type: 'geojson', data: asset('data/basemap/borders.json') },
      ...LABEL_SOURCES(),
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': p.ocean } },
      { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': p.land } },
      { id: 'lakes', type: 'fill', source: 'lakes', paint: { 'fill-color': p.lake } },
      {
        id: 'borders',
        type: 'line',
        source: 'borders',
        paint: { 'line-color': p.border, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.4, 6, 1.2] },
      },
      {
        id: 'place-dots',
        type: 'circle',
        source: 'places',
        minzoom: 3,
        filter: ['<=', ['get', 'rank'], ['-', ['zoom'], 1.5]],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 1.6, 8, 3.5],
          'circle-color': p.label,
          'circle-stroke-color': p.halo,
          'circle-stroke-width': 1,
        },
      },
      ...labelLayers(theme, language, false),
    ],
  };
}

/** Sentinel-2 cloudless imagery with the built-in labels on top. */
export function satelliteStyle(theme: Theme, language: Language): StyleSpecification {
  return {
    version: 8,
    name: 'Atomic Atlas satellite',
    glyphs: asset('fonts/{fontstack}/{range}.pbf'),
    sources: {
      imagery: {
        type: 'raster',
        tiles: [SATELLITE_TILES],
        tileSize: 256,
        maxzoom: 14,
        attribution: 'Sentinel-2 cloudless 2024 by EOX IT Services GmbH (contains modified Copernicus Sentinel data)',
      },
      borders: { type: 'geojson', data: asset('data/basemap/borders.json') },
      ...LABEL_SOURCES(),
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#05080b' } },
      { id: 'imagery', type: 'raster', source: 'imagery' },
      {
        id: 'borders',
        type: 'line',
        source: 'borders',
        paint: { 'line-color': '#ffffff', 'line-opacity': 0.55, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.4, 6, 1.2] },
      },
      ...labelLayers(theme, language, true),
    ],
  };
}

// The online dark style is close to black. These colours bring it into the app's own
// greys and blues, so land, water and roads can be told apart on the globe and in a city.
const DARK_TUNING: Record<string, Record<string, string>> = {
  background: { 'background-color': '#262b31' },
  water: { 'fill-color': '#111922' },
  waterway: { 'line-color': '#111922' },
  landcover_ice_shelf: { 'fill-color': '#2c3238' },
  landcover_glacier: { 'fill-color': '#2f353c' },
  landuse_residential: { 'fill-color': '#2a2f36' },
  landcover_wood: { 'fill-color': '#232b29' },
  landuse_park: { 'fill-color': '#232b29' },
  building: { 'fill-color': '#353b43' },
  'aeroway-area': { 'fill-color': '#30363d' },
  'aeroway-runway': { 'line-color': '#3d444c' },
  'aeroway-taxiway': { 'line-color': '#353b43' },
  highway_path: { 'line-color': '#30363d' },
  highway_minor: { 'line-color': '#363c44' },
  highway_major_inner: { 'line-color': '#474e57' },
  highway_major_subtle: { 'line-color': '#474e57' },
  highway_major_casing: { 'line-color': '#2b3036' },
  highway_motorway_casing: { 'line-color': '#2b3036' },
  highway_motorway_inner: { 'line-color': '#6a727b' },
  highway_motorway_subtle: { 'line-color': '#59616b' },
  railway: { 'line-color': '#414850' },
  railway_minor: { 'line-color': '#414850' },
  railway_transit: { 'line-color': '#414850' },
  boundary_state: { 'line-color': '#4d555f' },
  'boundary_country_z0-4': { 'line-color': '#737d89' },
  'boundary_country_z5-': { 'line-color': '#737d89' },
  water_name: { 'text-color': '#62798f' },
};
const DARK_LABEL = '#c2beb6';
const DARK_HALO = '#15181b';

/** Adjusts an online style after it is fetched: only the dark OpenFreeMap style is changed. */
export function tuneStyle(style: StyleSpecification, source: MapSourceId, theme: Theme, customUrl: string): StyleSpecification {
  if (source !== 'openfreemap' || theme !== 'dark' || /^https:\/\//i.test(customUrl.trim())) return style;
  return {
    ...style,
    layers: style.layers.map((layer) => {
      const tuning = DARK_TUNING[layer.id];
      if (tuning) {
        // The style names a fill pattern its sprite does not contain; plain colour replaces it.
        const paint: Record<string, unknown> = { ...(layer as { paint?: object }).paint, ...tuning };
        delete paint['fill-pattern'];
        return { ...layer, paint } as typeof layer;
      }
      if (layer.type === 'symbol' && layer.id.startsWith('place_')) {
        return { ...layer, paint: { ...layer.paint, 'text-color': DARK_LABEL, 'text-halo-color': DARK_HALO, 'text-halo-width': 1.2 } };
      }
      if (layer.type === 'symbol' && layer.id.startsWith('highway_name')) {
        return { ...layer, paint: { ...layer.paint, 'text-color': '#8f9499', 'text-halo-color': DARK_HALO, 'text-halo-width': 1 } };
      }
      return layer;
    }),
  };
}

/** Glow around the globe when seen from far away. */
export function skyFor(theme: Theme): Record<string, unknown> {
  return {
    'sky-color': theme === 'dark' ? '#0b1118' : '#a9c7e0',
    'horizon-color': theme === 'dark' ? '#3a4a5c' : '#e8f0f6',
    'fog-color': theme === 'dark' ? '#1b222a' : '#f2efe8',
    'sky-horizon-blend': 0.6,
    'horizon-fog-blend': 0.6,
    'fog-ground-blend': 0.4,
    'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 4, 0.9, 7, 0],
  };
}

/** The style to hand to MapLibre for the current settings: an address or a style object. */
export function styleFor(source: MapSourceId, theme: Theme, language: Language, customUrl: string): string | StyleSpecification {
  switch (source) {
    case 'builtin':
      return builtinStyle(theme, language);
    case 'satellite':
      return satelliteStyle(theme, language);
    case 'openfreemap':
      return /^https:\/\//i.test(customUrl.trim()) ? customUrl.trim() : OPENFREEMAP_STYLES[theme];
  }
}
