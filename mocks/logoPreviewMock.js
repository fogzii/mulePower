// Mock helper for previewing one row per bookie/logo when there is no live data.
// Enabled only when the dashboard URL contains ?mockLogos=1.

(function () {
  if (
    typeof MatchedBettingDashboard === "undefined" ||
    !window.location.search.includes("mockLogos=1")
  ) {
    return;
  }

  if (window.__mulePowerLogoPreviewPatched) return;
  window.__mulePowerLogoPreviewPatched = true;

  const proto = MatchedBettingDashboard.prototype;
  const originalFetchOdds = proto.fetchOdds;

  proto.seedFakeLogoRows = function seedFakeLogoRows() {
    const mockSites = [
      "Betfair",
      "TAB",
      "bet365",
      "Sportsbet",
      "Ladbrokes",
      "Neds",
      "PointsBet",
      "Betr",
      "Unibet",
      "BetDeluxe",
      "Noisy",
    ];

    this.oddsData = [];
    this.availableBookies.clear();
    this.enabledBookies.clear();

    const baseHorse = "Mock Runner";

    mockSites.forEach((site, index) => {
      const backOdds = site === "Betfair" ? null : 3 + index * 0.1;
      const layOdds = site === "Betfair" ? 3.5 : null;

      const horse = {
        name: `${baseHorse} ${index + 1}`,
        backOdds,
        layOdds,
        liquidity: site === "Betfair" ? 100 : null,
        site,
        raceVenue: site === "Betfair" ? "Mock Venue" : undefined,
        commissionDisplay:
          site === "Betfair" ? "Mock Betfair commission 8%" : undefined,
        commissionRate: site === "Betfair" ? 0.08 : undefined,
      };

      this.mergeOddsData([horse], {
        url: "about:blank",
        title: "Mock",
        tabId: null,
      });
    });

    this.availableBookies.forEach((bookie) => {
      this.enabledBookies.add(bookie);
    });

    this.updateBookieFilters();
  };

  proto.fetchOdds = async function fetchOddsWithLogoMock(silent = false) {
    await originalFetchOdds.call(this, silent);

    if (this.oddsData.length === 0) {
      this.seedFakeLogoRows();
      this.updateRaceInfo();
      this.updateCommissionInfo();
      if (!silent) {
        this.setStatus("Showing mock data for logo preview.", "info");
      }
      this.renderTable();
    }
  };
})();

