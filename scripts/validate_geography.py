#!/usr/bin/env python3
"""Validate an official NYC 2020 NTA GeoJSON snapshot before release."""
import collections
import hashlib
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
PATH = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'data' / 'nta2020.geojson'
BOROUGHS = {'Bronx', 'Brooklyn', 'Manhattan', 'Queens', 'Staten Island'}

def fail(message):
    raise SystemExit('INVALID: ' + message)

if not PATH.exists():
    fail(f'{PATH} not found. Download official dataset 9nt8-h7nd first.')
raw = PATH.read_bytes()
try:
    data = json.loads(raw)
except (UnicodeDecodeError, json.JSONDecodeError) as exc:
    fail(f'invalid JSON: {exc}')
if data.get('type') != 'FeatureCollection' or not isinstance(data.get('features'), list):
    fail('expected GeoJSON FeatureCollection')
features = data['features']
if len(features) != 262:
    fail(f'expected 262 NTAs, found {len(features)}')
counts = collections.Counter()
codes = set()
for index, f in enumerate(features, 1):
    p = f.get('properties') or {}
    code, name, borough = [str(p.get(x) or '').strip() for x in ('nta2020', 'ntaname', 'boroname')]
    if not code or not name or borough not in BOROUGHS:
        fail(f'feature {index} missing valid nta2020, ntaname, or boroname')
    if code in codes:
        fail(f'duplicate NTA code: {code}')
    codes.add(code)
    geometry = f.get('geometry') or {}
    if geometry.get('type') not in ('Polygon', 'MultiPolygon') or not geometry.get('coordinates'):
        fail(f'{code} lacks nonempty Polygon/MultiPolygon geometry')
    counts[borough] += 1
if set(counts) != BOROUGHS:
    fail('missing one or more boroughs')
print(json.dumps({'status':'VALID','source':'NYC DCP dataset 9nt8-h7nd (verify download provenance separately)', 'features':len(features),'by_borough':dict(sorted(counts.items())),'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)},indent=2))
