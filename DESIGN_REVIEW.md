# Comic-style NYC atlas — draft design and landmark provenance

**Status:** Visual review draft, **not merged** to `main`. No new statistical map layers are published.

The map retains NYC DCP 2020 NTA identifiers and the pinned versioned `data/nta2020.geojson` from dataset [9nt8-h7nd](https://data.cityofnewyork.us/d/9nt8-h7nd).
At city scale, it colors those polygons by official borough; selecting a borough reveals all its NTA boundaries. It does not substitute fictional borough outlines.

## Visual treatment
- Electric lime Bronx (`#C7FF00`), hot-pink Brooklyn (`#FF3B9D`), cyan Manhattan (`#00D9FF`), ultraviolet Queens (`#AF68FF`), and orange Staten Island (`#FF9A24`).
- Dark purple ink outlines (`#241039`), high-contrast text, bold typographic labels and halftone background.
- Map includes five **illustrative landmark pins for orientation only**, not a representative collection of all landmarks or any analytic variable.
- Each pin is labeled by name, keyboard-focusable and clickable. Borough selector and neighborhood search remain available. Mobile view hides large borough text badges to reduce collisions; pin tooltips and button names are retained.

## Landmark point sources

| Borough | Orientation landmark | Latitude | Longitude | Reference |
| --- | --- | ---: | ---: | --- |
| Bronx | Yankee Stadium | 40.82962 | -73.92650 | [Mapcarta](https://mapcarta.com/22636036) |
| Brooklyn | Coney Island Cyclone | 40.57450 | -73.97772 | [Mapcarta](https://mapcarta.com/W405891521) and [Luna Park](https://lunaparknyc.com/rides/coney-island-cyclone/) |
| Manhattan | Empire State Building | 40.74844 | -73.98566 | [Mapcarta](https://mapcarta.com/22578872) and [official visit page](https://www.esbnyc.com/visit/map-and-directions) |
| Queens | Unisphere | 40.74640 | -73.84507 | [Mapcarta](https://mapcarta.com/W596273458) and [NYC Parks](https://nycgovparks.org/parks/flushing-meadows-corona-park/highlights/12761) |
| Staten Island | St. George Ferry Terminal | 40.64420 | -74.07289 | [Mapcarta](https://mapcarta.com/W241853804) and [NYC DOT](https://www.nyc.gov/html/dot/html/ferrybus/sif-traveler-info.shtml) |

Coordinates are location markers, not boundary assignments or statistical observations. Distinguish the borough name from NTA code where geography has exceptional administrative assignments.

## Next acceptance gates
1. Use the design-review branch in a real browser; check all five colors, borders, landmark visibility, layer order and zoom on desktop and mobile.
2. Test keyboard focus on all borough buttons, search field, map landmark icons and reset.
3. Confirm the map loads the pinned 262 NTA polygons; test five borough counts and special-purpose areas.
4. Confirm the website does not display unverified income, poverty, racial, registration or election statistics.
5. Request explicit approval prior to merging this draft into published `main`.
