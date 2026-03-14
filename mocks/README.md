# MulePower Dashboard Mocks

This folder contains **development-only helpers** for the dashboard. They are not required for normal extension use.

## Logo preview mock

File: `mocks/logoPreviewMock.js`

- Purpose: Quickly preview one row per bookmaker to check the **bookie logo PNGs** in `assets/bookies/`.
- Activation: Open the dashboard with the query flag `mockLogos=1`, for example:

  `chrome-extension://<extension-id>/dashboard.html?mockLogos=1`

- Behavior:
  - If there is **no live odds data**, the mock injects a single fake row for each supported bookie (Betfair, TAB, bet365, Sportsbet, Ladbrokes, Neds, PointsBet, Betr, Unibet, BetDeluxe).
  - Filters are populated and enabled for all these bookies.
  - The status bar shows: “Showing mock data for logo preview.”

The mocks do **not** affect real odds fetching or calculations when live data is present.

