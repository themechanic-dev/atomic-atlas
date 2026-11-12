// Web-map tiles of an area (the usual z/x/y scheme): which tiles cover it, and how many,
// without listing them when there are too many to list.

/** Tiles are stored down to street level. */
export const MAX_ZOOM = 14;

/** West, south, east, north, in degrees. */
export type Bounds = [number, number, number, number];

const lngToX = (lng: number, z: number): number => Math.floor(((lng + 180) / 360) * 2 ** z);
const latToY = (lat: number, z: number): number => {
  const r = (Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/**
 * The first and last tile column and row of an area at one zoom, inside the world. A map
 * turned past the date line can report longitudes beyond ±180°; they are cut at the edge.
 */
function tileRange(bounds: Bounds, z: number): [number, number, number, number] {
  const [w, s, e, n] = bounds;
  const last = 2 ** z - 1;
  const inside = (i: number): number => Math.min(last, Math.max(0, i));
  return [inside(lngToX(Math.max(-180, w), z)), inside(lngToX(Math.min(180, e), z)), inside(latToY(n, z)), inside(latToY(s, z))];
}

/** How many tiles cover an area at every zoom up to MAX_ZOOM; counted, not listed. */
export function countTiles(bounds: Bounds): number {
  let total = 0;
  for (let z = 0; z <= MAX_ZOOM; z++) {
    const [x0, x1, y0, y1] = tileRange(bounds, z);
    total += Math.max(0, x1 - x0 + 1) * Math.max(0, y1 - y0 + 1);
  }
  return total;
}

/** The tiles of an area at every zoom up to MAX_ZOOM, as [z, x, y]. Count them first: a large area has hundreds of millions. */
export function tilesFor(bounds: Bounds): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (let z = 0; z <= MAX_ZOOM; z++) {
    const [x0, x1, y0, y1] = tileRange(bounds, z);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([z, x, y]);
  }
  return out;
}

/**
 * Is a vector tile (protobuf) whole? A tile is a run of fields; each length-delimited field
 * says how long it is, so a body cut short overruns its last length, and a body that is still
 * compressed does not read as fields at all. Used before a tile is kept for offline use.
 */
export function completeVectorTile(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  let i = 0;
  const varint = (): number => {
    let value = 0;
    let scale = 1;
    for (let n = 0; n < 10; n++) {
      if (i >= bytes.length) return -1;
      const b = bytes[i++]!;
      value += (b & 0x7f) * scale;
      if (b < 0x80) return value;
      scale *= 128;
    }
    return -1;
  };
  while (i < bytes.length) {
    const tag = varint();
    if (tag <= 0) return false;
    const wire = tag % 8;
    if (wire === 2) {
      const length = varint();
      if (length < 0 || i + length > bytes.length) return false;
      i += length;
    } else if (wire === 0) {
      if (varint() < 0) return false;
    } else if (wire === 5) i += 4;
    else if (wire === 1) i += 8;
    else return false;
  }
  return i === bytes.length;
}
