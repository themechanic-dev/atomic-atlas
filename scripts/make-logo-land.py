#!/usr/bin/env python3
"""Project Natural Earth 110m land onto an orthographic globe (unit circle) and print SVG path data.

usage: make_land.py <geojson> <lon0> <lat0>   -> prints path 'd' in coordinates where the globe is radius 1 at (0,0)
"""
import json
import math
import sys

src, lon0, lat0 = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
L0, P0 = math.radians(lon0), math.radians(lat0)


def proj(lon, lat):
    lam, phi = math.radians(lon), math.radians(lat)
    cosc = math.sin(P0) * math.sin(phi) + math.cos(P0) * math.cos(phi) * math.cos(lam - L0)
    x = math.cos(phi) * math.sin(lam - L0)
    y = math.cos(P0) * math.sin(phi) - math.sin(P0) * math.cos(phi) * math.cos(lam - L0)
    if cosc < 0:  # far side: push onto the limb so shapes stay closed along the edge
        n = math.hypot(x, y) or 1.0
        x, y = x / n, y / n
    return x, -y, cosc >= 0


def ring_path(ring):
    pts = [proj(lon, lat) for lon, lat in ring]
    if not any(v for _, _, v in pts):
        return ""
    out, last = [], None
    for x, y, _ in pts:
        p = (round(x, 3), round(y, 3))
        if p != last:
            out.append(p)
            last = p
    if len(out) < 3:
        return ""
    return "M" + "L".join(f"{x} {y}" for x, y in out) + "Z"


d = []
for f in json.load(open(src))["features"]:
    g = f["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    for poly in polys:
        for ring in poly:
            d.append(ring_path(ring))
print("".join(d))
