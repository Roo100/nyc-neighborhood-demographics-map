#!/usr/bin/env python3
"""Download official DCP NTA GeoJSON and verify before replacing snapshot."""
from pathlib import Path
import subprocess
import sys
import tempfile
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'data' / 'nta2020.geojson'
SOURCE = 'https://data.cityofnewyork.us/resource/9nt8-h7nd.geojson?$limit=5000'

def main():
    req = Request(SOURCE, headers={'User-Agent': 'NYC-Neighborhood-Atlas/0.1'})
    with urlopen(req, timeout=90) as response:
        blob = response.read()
    if len(blob) < 1000:
        raise SystemExit('Download was unexpectedly small.')
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=TARGET.parent, prefix='nta-verify-', suffix='.geojson', delete=False) as temp:
        tmp = Path(temp.name)
        temp.write(blob)
    try:
        subprocess.run([sys.executable, str(ROOT / 'scripts' / 'validate_geography.py'), str(tmp)], check=True)
        tmp.replace(TARGET)
        print(f'Official snapshot verified and saved to {TARGET.relative_to(ROOT)}')
    finally:
        tmp.unlink(missing_ok=True)

if __name__ == '__main__':
    main()
