#!/usr/bin/env python3
"""
zones_1_2_by_roads.py
Build “Zone 1” and “Zone 2” inside the City of Laredo limits by
splitting the city polygon with actual road centerlines + your routed west edge.

Zone 1:
  South of Saunders, North of *La Pita Mangana Road* (no Mangana-Hein),
  EAST of the routed path: (Saunders×N Meadow) → (S Meadow×US‑83) → (US‑83×La Pita).

Zone 2:
  NORTH of Saunders and SOUTH of Del Mar; east/west = city limits.

Robustness:
  - Splits are buffered progressively to ensure a cut.
  - Empty/tiny parts are ignored safely.
  - Polygons are cleaned with make_valid.
  - No single-sided buffers for the core logic.

Python ≥3.9
"""

import sys
import pandas as pd
import folium
import geopandas as gpd
import osmnx as ox
import networkx as nx
from shapely.geometry import LineString, MultiLineString, Polygon, MultiPolygon, Point
from shapely.ops import linemerge, split, unary_union

# make_valid across Shapely versions
try:
    from shapely import make_valid
except Exception:
    try:
        from shapely.validation import make_valid as _make_valid
        def make_valid(g): return _make_valid(g)
    except Exception:
        def make_valid(g): return g.buffer(0)

# ──────────────────────────────────────────────────────────────────────────
# Paths
PLACE_ZIP = r"C:\Users\arodriguez\Documents\Projects\sousan\Production\ssZoning\Files\Zone-1\tl_2024_48_place.zip"
OUT_HTML  = "zones_1_2.html"

# Intersection coordinates (lat, lon)
PT_A = (27.530779282871507, -99.48037473206035)  # Saunders × North Meadow
PT_B = (27.47788390205838,  -99.47433697439031)  # South Meadow × US‑83
PT_C = (27.4515853359407,   -99.47750508437692)  # US‑83 × La Pita Mangana (updated)

# Tuning knobs
ROUTE_SIMPLIFY_TOL_M  = 0.0      # simplify west route (m); 0 to keep exact
MIN_KEEP_AREA_M2      = 500.0    # ignore tiny slivers below this area
KEEP_LARGEST_ZONE_PART = True    # keep only the largest polygon per zone

# ──────────────────────────────────────────────────────────────────────────
# Utilities

def union_all_safe(geo_series: gpd.GeoSeries):
    if not isinstance(geo_series, gpd.GeoSeries):
        return geo_series
    try:
        return geo_series.union_all()
    except Exception:
        return geo_series.unary_union

def to_str(x):
    if isinstance(x, list):
        return x[0] if x else None
    return x

def to_single_line(geom):
    if geom is None:
        return None
    if geom.geom_type == "LineString":
        return geom
    merged = linemerge(geom)
    if merged.geom_type == "MultiLineString":
        return max(list(merged.geoms), key=lambda g: g.length)
    return merged

def reverse_line(geom):
    if geom is None:
        return None
    if geom.geom_type == "LineString":
        return LineString(list(geom.coords)[::-1])
    elif geom.geom_type == "MultiLineString":
        return MultiLineString([LineString(list(g.coords)[::-1]) for g in geom.geoms])
    return geom

def orient_west_to_east(line_single):
    c0x, _ = line_single.coords[0]
    c1x, _ = line_single.coords[-1]
    return line_single if c1x >= c0x else reverse_line(line_single)

def orient_north_to_south(line_single):
    _, c0y = line_single.coords[0]
    _, c1y = line_single.coords[-1]
    return line_single if c1y <= c0y else reverse_line(line_single)

def polygons_only(geom, keep_largest=True):
    """Make valid and return polygonal parts (optionally keep only largest)."""
    if geom is None or geom.is_empty:
        return geom
    g = make_valid(geom)
    polys = []
    def collect(h):
        if h.is_empty: return
        t = h.geom_type
        if t == "Polygon":
            if h.area > MIN_KEEP_AREA_M2: polys.append(h)
        elif t == "MultiPolygon":
            for s in h.geoms:
                if s.area > MIN_KEEP_AREA_M2: polys.append(s)
        elif t == "GeometryCollection":
            for s in h.geoms: collect(s)
    collect(g)
    if not polys:
        return g  # return as-is; caller can decide
    if keep_largest:
        return max(polys, key=lambda p: p.area)
    return unary_union(polys)

def describe(geom, name):
    t = "None" if geom is None else geom.geom_type
    empty = True if geom is None else geom.is_empty
    area_km2 = 0.0 if (geom is None or not hasattr(geom, "area")) else geom.area/1e6
    print(f"• {name}: type={t}, empty={empty}, area≈{area_km2:.3f} km²")

# OSMnx helpers
def nearest_node(G, lon, lat):
    try:
        return ox.distance.nearest_nodes(G, X=lon, Y=lat)
    except Exception:
        return ox.nearest_nodes(G, X=lon, Y=lat)

def route_line_geometry(G, node_list):
    """LineString following edge geometries along a node path."""
    if len(node_list) < 2:
        return None
    pieces = []
    nodes = G.nodes
    for u, v in zip(node_list[:-1], node_list[1:]):
        data = G.get_edge_data(u, v) or G.get_edge_data(v, u)
        if data is None:
            raise RuntimeError(f"No edge between nodes {u} and {v}")
        _, best = min(data.items(), key=lambda kv: kv[1].get("length", float("inf")))
        geom = best.get("geometry")
        if geom is None:
            x0, y0 = nodes[u]["x"], nodes[u]["y"]
            x1, y1 = nodes[v]["x"], nodes[v]["y"]
            geom = LineString([(x0, y0), (x1, y1)])
        pieces.append(geom)
    return to_single_line(linemerge(MultiLineString(pieces)))

# splitting + side tests
def split_geom_by_line(geom, line, widths=(0, 2, 5, 8, 12)):
    """
    Split a (Multi)Polygon geometry by a line; try progressively thicker buffers.
    Returns list of Polygons (non-empty, area >= MIN_KEEP_AREA_M2).
    """
    # Flatten to polygons
    polys = []
    base = polygons_only(geom, keep_largest=False)
    if base is None or base.is_empty:
        return polys
    parts = list(base.geoms) if isinstance(base, MultiPolygon) else [base]
    for poly in parts:
        if poly.is_empty or poly.area < MIN_KEEP_AREA_M2:
            continue
        split_done = False
        for w in widths:
            try:
                splitter = line if w == 0 else line.buffer(w)
                pieces = split(poly, splitter)
                new_polys = [g for g in pieces.geoms
                             if isinstance(g, Polygon) and (not g.is_empty) and (g.area >= MIN_KEEP_AREA_M2)]
                if new_polys:
                    polys.extend(new_polys)
                    split_done = True
                    break
            except Exception:
                continue
        if not split_done:
            polys.append(poly)  # keep original if not split
    return polys

def rep_point_safe(geom: Polygon) -> Point | None:
    """Representative point with guards for empties."""
    if geom is None or geom.is_empty:
        return None
    try:
        p = geom.representative_point()
        if p.is_empty:
            p = geom.centroid
        return None if p.is_empty else p
    except Exception:
        try:
            p = geom.centroid
            return None if p.is_empty else p
        except Exception:
            return None

def is_south_of_line(line_east, point: Point):
    t = line_east.project(point)
    lp = line_east.interpolate(t)
    return point.y < lp.y

def is_north_of_line(line_east, point: Point):
    t = line_east.project(point)
    lp = line_east.interpolate(t)
    return point.y > lp.y

def is_east_of_line(line_ns, point: Point):
    t = line_ns.project(point)
    lp = line_ns.interpolate(t)
    return point.x > lp.x

# ──────────────────────────────────────────────────────────────────────────
# 1) City limits (4326 + projected)
places = gpd.read_file(f"zip://{PLACE_ZIP}")
laredo = places[(places.STATEFP == "48") & (places.NAME.str.lower() == "laredo")]
if laredo.empty:
    sys.exit("✘ City of Laredo not found in place shapefile")

city_ll   = union_all_safe(laredo.to_crs(4326).geometry)     # WGS84
city_proj = union_all_safe(laredo.to_crs(32614).geometry)    # UTM 14N (meters)

# ──────────────────────────────────────────────────────────────────────────
# 2) OSM network + edges
print("🛣️  Downloading OSM streets within City of Laredo…")
G = ox.graph_from_polygon(city_ll, network_type="drive")
edges = ox.graph_to_gdfs(G, nodes=False, edges=True, fill_edge_geometry=True)
if "name" not in edges.columns:
    edges["name"] = None
edges["name"] = edges["name"].apply(to_str)
if "ref" in edges.columns:
    edges["ref"] = edges["ref"].apply(to_str)
else:
    edges["ref"] = None
edges["name_lc"] = edges["name"].astype("string").str.lower()
edges_p = edges.to_crs(32614)

def dissolve_edges(names_exact=None, names_contains=None, refs_exact=None):
    names_exact    = [n.lower() for n in (names_exact or [])]
    names_contains = [s.lower() for s in (names_contains or [])]
    refs_exact     = refs_exact or []
    sel = pd.Series(False, index=edges_p.index)
    if names_exact:
        sel = sel | edges_p["name_lc"].isin(names_exact)
    for sub in names_contains:
        sel = sel | edges_p["name_lc"].str.contains(sub, na=False)
    if refs_exact and "ref" in edges_p.columns:
        sel = sel | edges_p["ref"].isin(refs_exact)
    part = edges_p.loc[sel]
    if part.empty:
        return None
    return union_all_safe(part.geometry)

# ──────────────────────────────────────────────────────────────────────────
# 3) Boundary lines (strict La Pita)
saunders = dissolve_edges(
    names_exact=[
        "Saunders Street","East Saunders Street","West Saunders Street",
        "Saunders Road","E Saunders Street","W Saunders Street",
        "Lloyd Bentsen Highway","Lloyd Bentsen Hwy"
    ],
    names_contains=["saunders","lloyd bentsen"],
    refs_exact=["US 59", "I 69W;US 59;Loop 20", "US 59;Loop 20"]
)
saunders = to_single_line(saunders)
if saunders is None: sys.exit("✘ Saunders not found.")
saunders = orient_west_to_east(saunders)

lapita = dissolve_edges(
    names_exact=["La Pita Mangana Road","La Pita Mangana Rd"],
    names_contains=["la pita mangana"]
)
lapita = to_single_line(lapita)
if lapita is None: sys.exit("✘ La Pita Mangana Road not found.")
lapita = orient_west_to_east(lapita)

delmar = dissolve_edges(
    names_exact=[
        "Del Mar Boulevard","East Del Mar Boulevard","West Del Mar Boulevard",
        "E Del Mar Boulevard","W Del Mar Boulevard",
        "Del Mar Blvd","E Del Mar Blvd","W Del Mar Blvd"
    ],
    names_contains=["del mar blvd","del mar boulevard","del mar"]
)
delmar = to_single_line(delmar)
if delmar is None: sys.exit("✘ Del Mar Boulevard not found.")
delmar = orient_west_to_east(delmar)

# ──────────────────────────────────────────────────────────────────────────
# 4) WEST boundary via routing your points (WGS84 → 32614)
a = nearest_node(G, PT_A[1], PT_A[0])
b = nearest_node(G, PT_B[1], PT_B[0])
c = nearest_node(G, PT_C[1], PT_C[0])
route_ab = nx.shortest_path(G, a, b, weight="length")
route_bc = nx.shortest_path(G, b, c, weight="length")
route_nodes = route_ab + route_bc[1:]
route_ll = route_line_geometry(G, route_nodes)
if route_ll is None: sys.exit("✘ Failed to build routed west boundary.")
west_route_proj = gpd.GeoSeries([route_ll], crs=4326).to_crs(32614).iloc[0]
if ROUTE_SIMPLIFY_TOL_M and ROUTE_SIMPLIFY_TOL_M > 0:
    west_route_proj = west_route_proj.simplify(ROUTE_SIMPLIFY_TOL_M, preserve_topology=True)
west_route_proj = orient_north_to_south(west_route_proj)

# ──────────────────────────────────────────────────────────────────────────
# 5) Zone 1 by splitting: (city → south of Saunders) → north of La Pita → east of west route
# 5.1 cut by Saunders → keep SOUTH pieces
parts_sau = split_geom_by_line(city_proj, saunders, widths=(0, 2, 5, 8, 12))
south_parts = []
for p in parts_sau:
    rp = rep_point_safe(p)
    if rp is None: continue
    if is_south_of_line(saunders, rp):
        south_parts.append(p)
south_region = polygons_only(unary_union(south_parts), keep_largest=False)

# 5.2 cut by La Pita → keep NORTH pieces
parts_lapita = split_geom_by_line(south_region, lapita, widths=(0, 2, 5, 8, 12, 20))
between_parts = []
for p in parts_lapita:
    rp = rep_point_safe(p)
    if rp is None: continue
    if is_north_of_line(lapita, rp):
        between_parts.append(p)
between_region = polygons_only(unary_union(between_parts), keep_largest=False)

# 5.3 cut by WEST route → keep EAST pieces
parts_route = split_geom_by_line(between_region, west_route_proj, widths=(0, 1, 2, 3, 5, 8))
east_parts = []
for p in parts_route:
    rp = rep_point_safe(p)
    if rp is None: continue
    if is_east_of_line(west_route_proj, rp):
        east_parts.append(p)

zone1_proj = polygons_only(unary_union(east_parts), keep_largest=KEEP_LARGEST_ZONE_PART)

# ──────────────────────────────────────────────────────────────────────────
# 6) Zone 2 by splitting: north of Saunders, then south of Del Mar
parts_sau2 = split_geom_by_line(city_proj, saunders, widths=(0, 2, 5, 8, 12))
north_parts = []
for p in parts_sau2:
    rp = rep_point_safe(p)
    if rp is None: continue
    if is_north_of_line(saunders, rp):
        north_parts.append(p)
north_region = polygons_only(unary_union(north_parts), keep_largest=False)

parts_delmar = split_geom_by_line(north_region, delmar, widths=(0, 2, 5, 8, 12, 20))
z2_parts = []
for p in parts_delmar:
    rp = rep_point_safe(p)
    if rp is None: continue
    if is_south_of_line(delmar, rp):
        z2_parts.append(p)
zone2_proj = polygons_only(unary_union(z2_parts), keep_largest=KEEP_LARGEST_ZONE_PART)

# Diagnostics
describe(south_region,   "After Saunders cut (south)")
describe(between_region, "Between Saunders & La Pita")
describe(zone1_proj,     "Zone 1 (final)")
describe(zone2_proj,     "Zone 2 (final)")

# ──────────────────────────────────────────────────────────────────────────
# 7) Export GeoJSON + HTML
zone1 = gpd.GeoSeries([zone1_proj], crs=32614).to_crs(4326).iloc[0]
zone2 = gpd.GeoSeries([zone2_proj], crs=32614).to_crs(4326).iloc[0]

gdf1 = gpd.GeoDataFrame({"zone": ["Zone 1"]}, geometry=[zone1], crs=4326)
gdf2 = gpd.GeoDataFrame({"zone": ["Zone 2"]}, geometry=[zone2], crs=4326)
gdf1.to_file("zone1.geojson", driver="GeoJSON")
gdf2.to_file("zone2.geojson", driver="GeoJSON")
print("✓ Wrote zone1.geojson and zone2.geojson")

# Debug layers
gpd.GeoDataFrame(geometry=[saunders],        crs=32614).to_crs(4326).to_file("dbg_saunders.geojson", driver="GeoJSON")
gpd.GeoDataFrame(geometry=[lapita],          crs=32614).to_crs(4326).to_file("dbg_lapita.geojson", driver="GeoJSON")
gpd.GeoDataFrame(geometry=[delmar],          crs=32614).to_crs(4326).to_file("dbg_delmar.geojson", driver="GeoJSON")
gpd.GeoDataFrame(geometry=[west_route_proj], crs=32614).to_crs(4326).to_file("dbg_west_route.geojson", driver="GeoJSON")
gpd.GeoDataFrame(geometry=[south_region],    crs=32614).to_crs(4326).to_file("dbg_after_saunders.geojson", driver="GeoJSON")
gpd.GeoDataFrame(geometry=[between_region],  crs=32614).to_crs(4326).to_file("dbg_between_saunders_lapita.geojson", driver="GeoJSON")
gpd.GeoDataFrame(geometry=[zone1_proj],      crs=32614).to_crs(4326).to_file("dbg_zone1_final.geojson", driver="GeoJSON")
gpd.GeoDataFrame(geometry=[zone2_proj],      crs=32614).to_crs(4326).to_file("dbg_zone2_final.geojson", driver="GeoJSON")
print("✓ Wrote debug GeoJSONs (dbg_*.geojson)")

# Folium map
center_proj = gpd.GeoSeries([city_proj], crs=32614).centroid.iloc[0]
center_ll   = gpd.GeoSeries([center_proj], crs=32614).to_crs(4326).iloc[0]
m = folium.Map(location=[center_ll.y, center_ll.x], zoom_start=12, tiles="cartodbpositron")

# city outline
folium.GeoJson(
    data=gpd.GeoSeries([city_ll], crs=4326).__geo_interface__,
    name="City Limits",
    style_function=lambda f: {"color": "#666", "weight": 2, "fillOpacity": 0.0}
).add_to(m)

# zones
folium.GeoJson(
    gdf1.__geo_interface__,
    name="Zone 1",
    style_function=lambda f: {"fillColor": "#FFA500", "color": "#FF4500", "weight": 2, "fillOpacity": 0.30},
    tooltip="Zone 1"
).add_to(m)
folium.GeoJson(
    gdf2.__geo_interface__,
    name="Zone 2",
    style_function=lambda f: {"fillColor": "#7FB3D5", "color": "#2E86C1", "weight": 2, "fillOpacity": 0.25},
    tooltip="Zone 2"
).add_to(m)

# debug overlays
def line_style(color):
    return lambda f: {"color": color, "weight": 3, "fillOpacity": 0.0}
folium.GeoJson(gpd.GeoSeries([saunders], crs=32614).to_crs(4326).__geo_interface__,
    name="DBG Saunders", style_function=line_style("#FF00FF")).add_to(m)
folium.GeoJson(gpd.GeoSeries([lapita], crs=32614).to_crs(4326).__geo_interface__,
    name="DBG La Pita", style_function=line_style("#00AA00")).add_to(m)
folium.GeoJson(gpd.GeoSeries([west_route_proj], crs=32614).to_crs(4326).__geo_interface__,
    name="DBG West Route", style_function=line_style("#AA5500")).add_to(m)
folium.GeoJson(gpd.GeoSeries([delmar], crs=32614).to_crs(4326).__geo_interface__,
    name="DBG Del Mar", style_function=line_style("#0000FF")).add_to(m)

folium.LayerControl().add_to(m)
m.save(OUT_HTML)
print(f"✓ {OUT_HTML} written")
