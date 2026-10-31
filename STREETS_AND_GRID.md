# NYC POP! — Streets and Grid View (design checkpoint)

**Status:** Draft pull request for visual review; this is not a verified demographic or political dataset. Do not merge without user approval.

## Purpose
The `Streets + grid` option adds a recognizable street network, road names and blocks to the approved neon borough map. Visitors can zoom into a borough, select a 2020 NTA, and still see streets underneath the translucent borough color. The `Neon-only` option restores the original graphic map.

## Attribution and geographic distinction
- **Street background:** OpenStreetMap Standard tiles. Requests occur only in normal interactive browser viewing, not in bulk or in automated screenshot testing. Map attribution remains visible inside the Leaflet map, and the site must respect the [OpenStreetMap Foundation Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/). Standard tile service is best-effort; if tiles cannot load, the map reverts to neon-only polygons.
- **Statistical geography:** New York City Department of City Planning 2020 Neighborhood Tabulation Areas, dataset [9nt8-h7nd](https://data.cityofnewyork.us/d/9nt8-h7nd), still loaded from the versioned `data/nta2020.geojson` snapshot. OSM street grids are a navigational reference **only**; they do not define NTA boundaries or authorize demographic values.
- **Five-borough focus:** a canvas outside-city matte is derived from the same pinned NTA polygons, preserving visibility of streets on NYC land while hiding surrounding jurisdictions. Water passages and other excluded geography appear as the pale blue map background.
- **No data publication:** No income, poverty, racial, voter registration, election, or turnout observations are introduced.

## QA
The GitHub pull request checks use a deterministic **mock grid** instead of making automated tile requests to OSM. Tests verify official 262-geometry coverage, filtering and Longwood NTA search, switch between street and neon views, source attribution, tile presence, the Manhattan inside-city transparency, outside-city opacity and mobile overflow. A screenshot of the mock-grid view is **not evidence of live OSM street detail**. Final publication requires user review and a manual check of real street names at borough/neighborhood zoom.
