# NYC POP! — Certified 2025 NYC mayoral election

## Scope and official sources

Citywide summary **only** for the November 4, 2025 general mayoral contest. This is not a neighborhood result, Council district result, party-enrollment statistic, demographic observation or prediction.

Source: https://www.vote.nyc/page/election-results-summary-2025

The BOE ED-Level CSV and the independently certified Recap CSV were downloaded for Mayor — Citywide. The recap identifies certification on December 2, 2025. Complete source URLs and SHA-256 hashes are retained in data/elections/mayor_2025_verified_citywide.json.

## Reconciliation procedure

- The official BOE election-district export has 56,745 source records with 11 repeated field header columns followed by 11 data columns.
- Separate active IN-PLAY EDs from COMBINED INTO EDs. There are 4,338 distinct county+AD+ED keys, including 221 combined ED identifiers.
- Sum only the four BOE ballot methods for turnout-related ballots; do not count administrative rows as candidate votes.
- Independently verify all nine named candidate ballot lines by county against the BOE's certified recap, and confirm all five county ballots, recorded votes and unrecorded vote totals.
- Combine multiple ballot lines for the same candidate, including Mamdani's Democratic/Working Families lines and Sliwa's Republican/Protect Animals lines.
- After all county reconciliation checks pass, pin the citywide summary JSON. The browser independently revalidates known reconciled totals before displaying the citywide result chart.
- Browser tests verify candidate totals, the explicit citywide-only caveat, mobile width, and accessibility.

## Verified numbers

Total ballots: **2,218,647**; votes for candidates/write-ins: **2,194,204**; unrecorded: **24,443**.

Candidate totals: Zohran Kwame Mamdani 1,114,184; Andrew M. Cuomo 906,614; Curtis A. Sliwa 153,749; Eric L. Adams 6,897; scattered write-ins 6,206; Irene Estrada 2,856; Jim Walden 2,319; Joseph Hernandez 1,379.

Candidate percentages are of *recorded votes for candidates and write-ins*, not ballots cast or voter registration.

## Pending geographic election layer

The current published NYC DCP ED data are 2026 geography (https://data.cityofnewyork.us/d/wwxk-38u4) and may not match the **November 2025** ED districts. Before displaying winners or candidate shares for election districts or neighborhoods, establish the correct 2025 ED geometry or official crosswalk, match every county/AD/ED code, reconcile all combined/absentee precincts, and audit omissions. Never assign a candidate winner to an NTA from borough or nearest-neighbor assumptions.

A separately published February 2026 Council party enrollment layer is **registration**, not a November 2025 vote result; neither is the 2020–2024 ACS neighborhood dataset.

This project does not modify the original Roo100/nyc-shootings-map.
