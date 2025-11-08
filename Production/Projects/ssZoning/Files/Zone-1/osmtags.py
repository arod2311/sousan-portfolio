#!/usr/bin/env python3
"""
zone1_follow_roads.py  –  100 % coordinate‑driven Zone 1
────────────────────────────────────────────────────────────────────────────
Polygon definition
──────────────────
NW anchor : 27.530610, -99.480810  (Saunders × North Meadow)
North edge: east (straight) until Laredo city limit.
West chain: manual points south‑bound:
    27.490348, -99.481395
    27.475109, -99.477077
    27.475098, -99.478154
    27.462677, -99.485407
    27.450802, -99.493460
South edge: from 27.450802,‑99.493460 due‑east (straight) until city limit.
East edge : city‑limit boundary between south & north intersections.
"""

# ── Imports ──────────────────────────────────────────────────────────────
import csv, json, unicodedata, re
from pathlib import Path

import folium, geopandas as gpd
from shapely.geometry import Point, LineString, Polygon
from shapely.ops import substring
from geopy.geocoders import Nominatim
from geopy.extra.rate_limiter import RateLimiter
from branca.element import Element, MacroElement
from jinja2 import Template
from shapely.ops import linemerge

# ── I/O paths ────────────────────────────────────────────────────────────
BASE_DIR  = Path(r"C:\Users\arodriguez\Documents\Projects\sousan\Production\ssZoning\Files\Zone-1")
PLACE_ZIP = BASE_DIR / "tl_2024_48_place.zip"
CSV_PATH  = BASE_DIR / "78043-78046.csv"

OUT_GEOJSON_CORE = "zone1_follow_roads.geojson"
OUT_HTML         = "zone1_follow_roads.html"
OUT_BAD_CSV      = "bad_addresses.csv"

# CSV columns (0‑based)
CSV_COLS = dict(acct=15, name=18, city=19, street=20, size=21, svc=23)

# ── Manual coordinates (supplied by user) ────────────────────────────────
ANCHOR_NW = (27.530610, -99.480810)      # Saunders × North Meadow
WEST_CHAIN = [
    (27.490348, -99.481395),
    (27.475109, -99.477077),
    (27.475098, -99.478154),
    (27.462677, -99.485407),
    (27.450802, -99.493460),
]
ANCHOR_SW = WEST_CHAIN[-1]               # 27.450802, -99.493460

# ── 1. Load Laredo city limits ───────────────────────────────────────────
city = gpd.read_file(f"zip://{PLACE_ZIP}")
city = city[(city.STATEFP=="48") & (city.NAME.str.lower()=="laredo")]
if city.empty: raise RuntimeError("City of Laredo not found in shapefile")
city_poly = city.geometry.values[0]      # shapely Polygon (EPSG:4326)
city_boundary = city_poly.boundary       # MultiLineString

# ── 2.  Find east intersections for north & south horizontals ───────────
def eastmost_intersection(lat):
    """Return the intersection point (lat, lon) of a horizontal ray
    from the given latitude + a very small west‑lon to the east city
    boundary."""
    # Horizontal line longer than city
    ray = LineString([(-100.0, lat), (-99.0, lat)])
    inter = ray.intersection(city_boundary)
    # inter can be MultiPoint / Point; we take rightmost (max lon)
    if inter.is_empty: raise RuntimeError("No city‑limit intersection")
    pts = list(inter.geoms) if hasattr(inter, 'geoms') else [inter]
    east_pt = max(pts, key=lambda p: p.x)   # max longitude
    return (east_pt.y, east_pt.x)

# north horizontal intersection
P_NE = eastmost_intersection(ANCHOR_NW[0])   # (lat, lon)
# south horizontal intersection (La Pita Mangana latitude)
P_SE = eastmost_intersection(ANCHOR_SW[0])

# ── 3.  Extract east boundary segment between P_SE and P_NE ─────────────
# Convert boundary to LineString in one piece for substring convenience
#   (small city, so first geometry is enough; dissolve if needed)
from shapely.ops import linemerge

# --- build a single LineString that contains the whole city boundary
merged = linemerge(city_boundary)         # may return LineString or MultiLineString

if merged.geom_type == "LineString":
    city_line = merged
else:
    # merged is MultiLineString; pick the component that spans both east pts
    pts = [Point(P_SE[1], P_SE[0]), Point(P_NE[1], P_NE[0])]
    def spans(ls):
        return all(ls.project(p) > 0 for p in pts)
    # choose the first component that spans both target points;
    # if none spans both, concatenate them in order
    parts = [ls for ls in merged.geoms if spans(ls)]
    city_line = parts[0] if parts else linemerge(merged.geoms)

# --- curvilinear distances along that boundary
start_d = city_line.project(Point(P_SE[1], P_SE[0]))
end_d   = city_line.project(Point(P_NE[1], P_NE[0]))
if start_d > end_d:      # ensure north‑ward traversal
    start_d, end_d = end_d, start_d

from shapely.ops import substring
east_segment = substring(city_line, start_d, end_d, normalized=False)

# Ensure we go north‑ward (smaller d → larger d). If reversed, swap.
if start_d > end_d:
    start_d, end_d = end_d, start_d
east_segment = substring(city_line, start_d, end_d, normalized=False)

# ── 4. Assemble full perimeter clockwise ────────────────────────────────
perim_coords = (
    [ANCHOR_NW] +                      # start NW
    [P_NE] +                           # straight east
    [(lat,lon) for lon,lat in east_segment.coords[1:-1]] +  # down city edge
    [P_SE] +                           # reach south horizontal
    WEST_CHAIN[::-1] +                 # west chain south→north order
    [ANCHOR_NW]                        # close polygon
)
zone1_core = Polygon([(lon,lat) for lat,lon in perim_coords]).buffer(0)

# ── 5.  Export GeoJSON ───────────────────────────────────────────────────
gpd.GeoDataFrame({'zone':['Zone 1']}, geometry=[zone1_core], crs='EPSG:4326') \
  .to_file(OUT_GEOJSON_CORE)
print("✓", OUT_GEOJSON_CORE, "written")

# ── 6.  Geocode addresses & label inside/outside ─────────────────────────
def ascii_clean(t:str)->str:
    if not isinstance(t,str): return ""
    t = unicodedata.normalize("NFKD",t)
    t = re.sub(r"[\u2010-\u2015\u2212]","-",t)
    return "".join(c for c in t if 31<ord(c)<127)

geocode = RateLimiter(Nominatim(user_agent="zone1_mapper",timeout=10).geocode,
                      min_delay_seconds=1.0)

rows,bad=[],[]
with open(CSV_PATH,encoding="utf-8",errors="ignore",newline="") as f:
    buf=""
    for ln in f:
        buf+=ln
        if buf.count('"')%2: continue
        cols=next(csv.reader([buf.strip()])); buf=""
        if len(cols)<=max(CSV_COLS.values()): continue
        rec={k:ascii_clean(cols[i]) for k,i in CSV_COLS.items()}
        if not(rec["street"] and rec["city"]): continue
        loc=geocode(f"{rec['street']}, {rec['city']}")
        if not loc: bad.append(rec); continue
        rec["pt"]=Point(loc.longitude,loc.latitude)
        rec["inside"]=zone1_core.contains(rec["pt"])
        rows.append(rec)
if bad:
    with open(OUT_BAD_CSV,"w",newline="",encoding="utf-8") as f:
        w=csv.DictWriter(f,fieldnames=bad[0].keys()); w.writeheader(); w.writerows(bad)
        print("⇢ bad_addresses.csv written")

# ── 7.  Build interactive map ────────────────────────────────────────────
center=zone1_core.representative_point()
m=folium.Map(location=[center.y,center.x], zoom_start=12, tiles="cartodbpositron")

folium.GeoJson(zone1_core.__geo_interface__,
    style_function=lambda _:{'color':'#FF4500','fillColor':'#FFA500',
                             'weight':3,'fillOpacity':0.3},
    tooltip="Zone 1").add_to(m)

for r in rows:
    folium.Marker([r["pt"].y,r["pt"].x],
                  icon=folium.Icon(color='blue' if r["inside"] else 'red',
                                   icon="home")).add_to(m)

folium.LayerControl().add_to(m)

# Legend
m.get_root().html.add_child(Element("""
<style>#leg{position:fixed;bottom:15px;right:15px;z-index:9999;
background:white;padding:6px 8px;border:1px solid #bbb;font:14px/16px Arial;}
#leg i{width:18px;height:18px;float:left;margin-right:8px;opacity:0.8;}</style>
<div id='leg'><i style='background:#FF4500'></i> Zone 1<br>
<i style='background:#1E90FF'></i> Address in Zone<br>
<i style='background:#FF0000'></i> Address outside</div>"""))

# Search bar
m.get_root().html.add_child(Element("""
<link rel="stylesheet"
 href="https://unpkg.com/leaflet-control-geocoder/dist/Control.Geocoder.css"/>
<script src="https://unpkg.com/leaflet-control-geocoder/dist/Control.Geocoder.js"></script>
<script src="https://unpkg.com/@turf/turf@6/turf.min.js"></script>
"""))

zone_js=json.dumps(zone1_core.__geo_interface__)
map_var=m.get_name()
class SearchBar(MacroElement):
    _template=Template("""
{% macro script(this,kwargs) %}
var map={{this.map}}; var zone={{this.zone}};
L.Control.geocoder({position:'topleft',collapsed:false,placeholder:'Search…',
 defaultMarkGeocode:false})
 .on('markgeocode',e=>{
   var ll=e.geocode.center,
       inside=turf.booleanPointInPolygon(turf.point([ll.lng,ll.lat]),zone),
       col=inside?'blue':'red',
       msg=inside?'Inside Zone 1':'Outside Zone 1';
   if(window._sm) map.removeLayer(window._sm);
   window._sm=L.circleMarker(ll,{radius:8,color:col,fillColor:col,fillOpacity:0.9})
     .addTo(map).bindPopup(e.geocode.name+'<br><b>'+msg+'</b>').openPopup();
   map.setView(ll,15);
 }).addTo(map);
{% endmacro %}""")
    def __init__(self,zone,map_name): super().__init__(); self.zone=zone; self.map=map_name
m.add_child(SearchBar(zone_js,map_var))

m.save(OUT_HTML)
print("✓", OUT_HTML, "written\n✅ Finished.")
