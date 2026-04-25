// Dashboard logic for Matched Betting Extension

class MatchedBettingDashboard {
  constructor() {
    this.oddsData = [];
    this.statusDiv = document.getElementById("status");
    this.tableBody = document.getElementById("tableBody");
    this.filterOptionsDiv = document.getElementById("filterOptions");
    this.toggleAllBtn = document.getElementById("toggleAllBtn");
    this.autoRefreshInterval = null;
    this.isCollapsed = false;
    this.COLLAPSE_THRESHOLD = 10;
    this.enabledBookies = new Set();
    this.availableBookies = new Set();
    /** Snapshot of bookie names from last filter update — used to default-on only truly new bookies */
    this._lastKnownAvailableBookies = new Set();
    /**
     * Per-mode bookie filter memory.
     * Stores a Set of enabled bookie names for each mode the user has visited.
     * Undefined for a mode means the user has never interacted with it → default to all enabled.
     */
    this.modeBookieFilters = {};

    this.commissionValue = 0.08;
    this.commissionEnabled = true;

    this.backStakeValue = 50;
    this.hideLayStake = false;
    this.minOdds = 0;
    this.maxOdds = 1000; // internal default when no explicit max is set

    this.retentionValue = 80; // % of bonus you expect to realise
    this.placesPaid = 3; // default places paid for place-refund offers

    // Modes:
    // - 'bonus-place'  : bonus back for placing (place-refund)
    // - 'bonus-snr'    : bonus turnover (stake-not-returned)
    // - 'non-promo'    : normal qualifying / non-offer bets
    this.mode = "bonus-place";

    this.colorThresholds = {
      // Bonus turnover (SNR) mode: thresholds compare against retention %
      bonus: {
        darkGreen: 90,
        lightGreen: 80,
        yellow: 75,
        orange: 70,
      },
      // Bonus back for placing mode: thresholds compare against EV
      bonusPlace: {
        darkGreen: 9,
        lightGreen: 7.5,
        yellow: 6.5,
        orange: 5,
      },
      nonPromo: {
        darkGreen: -5,
        lightGreen: -7.5,
        yellow: -10,
        orange: -12.5,
      },
    };
    this.eliteMode = false;

    this.raceVenue = null;
    this.raceNumber = null;
    this.betfairTotalMatched = null;
    this.betfairCommissionDisplay = "";

    this.init();
  }

  async init() {
    this.commissionCheckbox = document.getElementById("commissionEnabled");
    this.hideLayStakeCheckbox = document.getElementById("hideLayStake");
    this.minOddsInput = document.getElementById("minOddsInput");
    this.maxOddsInput = document.getElementById("maxOddsInput");
    this.backStakeInput = document.getElementById("backStakeInput");
    this.placesPaidInput = document.getElementById("placesPaidInput");
    this.placesPaidWrapper = document.getElementById("placesPaidWrapper");

    try {
      const stored = await chrome.storage.local.get([
        "betfairCommission",
        "betfairCommissionEnabled",
        "hideLayStake",
        "minOdds",
        "maxOdds",
        "backStakeValue",
        "bettingMode",
        "colorThresholds",
        "eliteMode",
        "placesPaid",
      ]);

      let percent = 8;
      if (stored.betfairCommission != null) {
        percent = Math.max(
          0,
          Math.min(20, Math.round(Number(stored.betfairCommission))),
        );
      }
      this.commissionValue = percent / 100;

      if (stored.betfairCommissionEnabled != null) {
        this.commissionEnabled = !!stored.betfairCommissionEnabled;
        if (this.commissionCheckbox)
          this.commissionCheckbox.checked = this.commissionEnabled;
      }

      if (stored.hideLayStake != null) {
        this.hideLayStake = !!stored.hideLayStake;
      }

      if (stored.minOdds != null) {
        const parsedMin = Number(stored.minOdds);
        if (Number.isFinite(parsedMin) && parsedMin >= 0) {
          this.minOdds = parsedMin;
        }
      }

      if (stored.maxOdds != null) {
        const parsedMax = Number(stored.maxOdds);
        if (Number.isFinite(parsedMax) && parsedMax > 0) {
          this.maxOdds = parsedMax;
        }
      }

      if (stored.backStakeValue != null) {
        const parsedStake = Number(stored.backStakeValue);
        if (Number.isFinite(parsedStake) && parsedStake >= 0) {
          this.backStakeValue = parsedStake;
        }
      }
      if (this.backStakeInput) this.backStakeInput.value = this.backStakeValue;

      if (stored.bettingMode) {
        this.mode = stored.bettingMode;
      }

      if (stored.placesPaid != null) {
        const parsedPlaces = Number(stored.placesPaid);
        if (Number.isFinite(parsedPlaces) && parsedPlaces > 0) {
          this.placesPaid = Math.max(1, Math.min(10, Math.round(parsedPlaces)));
        }
      }
      if (this.placesPaidInput) this.placesPaidInput.value = this.placesPaid;
      if (this.hideLayStakeCheckbox)
        this.hideLayStakeCheckbox.checked = this.hideLayStake;
      if (this.minOddsInput)
        this.minOddsInput.value = String(this.minOdds ?? 0);
      if (this.maxOddsInput) {
        if (
          stored.maxOdds != null &&
          Number.isFinite(this.maxOdds) &&
          this.maxOdds > 0 &&
          this.maxOdds !== 1000
        ) {
          // Only prefill if user explicitly set a non-default max
          this.maxOddsInput.value = String(this.maxOdds);
        } else {
          // No explicit max: keep UI blank
          this.maxOddsInput.value = "";
        }
      }

      if (stored.colorThresholds) {
        this.colorThresholds = stored.colorThresholds;

        // Migration: if bonus thresholds look like EV values (e.g. 9, 7.5, 6.5, 5),
        // move them to bonusPlace and restore bonus to retention % defaults.
        if (
          this.colorThresholds.bonus &&
          !this.colorThresholds.bonusPlace &&
          this.colorThresholds.bonus.darkGreen <= 20
        ) {
          this.colorThresholds.bonusPlace = { ...this.colorThresholds.bonus };
          this.colorThresholds.bonus = {
            darkGreen: 90,
            lightGreen: 80,
            yellow: 75,
            orange: 70,
          };

          chrome.storage.local
            .set({ colorThresholds: this.colorThresholds })
            .catch(() => {});
        }

        // Ensure bonusPlace thresholds always exist (for older configs).
        if (!this.colorThresholds.bonusPlace) {
          this.colorThresholds.bonusPlace = {
            darkGreen: 9,
            lightGreen: 7.5,
            yellow: 6.5,
            orange: 5,
          };
        }
      }

      if (stored.eliteMode != null) {
        this.eliteMode = !!stored.eliteMode;
        if (this.eliteMode) {
          this.colorThresholds.nonPromo = {
            darkGreen: -1,
            lightGreen: -2.7,
            yellow: -5.6,
            orange: -8.3,
          };
        }
      }
    } catch (e) {
      console.warn("[Dashboard] Could not load settings:", e);
    }

    this.modeSelect = document.getElementById("modeSelect");
    if (this.modeSelect) {
      this.modeSelect.value = this.mode;
      this.modeSelect.addEventListener("change", () => this.onModeChange());
    }

    this.toggleAllBtn.addEventListener("click", () => this.toggleAllBookies());

    // No commission input field anymore; commission comes from Betfair (or last stored) only.
    if (this.commissionCheckbox) {
      this.commissionCheckbox.addEventListener("change", () =>
        this.onPricingInputsChange(),
      );
    }
    if (this.backStakeInput) {
      this.backStakeInput.addEventListener("input", () =>
        this.onBackStakeInputChange(false),
      );
      this.backStakeInput.addEventListener("change", () =>
        this.onBackStakeInputChange(true),
      );
    }

    if (this.placesPaidInput) {
      this.placesPaidInput.addEventListener("change", () =>
        this.onPricingInputsChange(),
      );
    }

    if (this.hideLayStakeCheckbox) {
      this.hideLayStakeCheckbox.addEventListener("change", () =>
        this.onHideLayStakeChange(),
      );
    }

    if (this.minOddsInput || this.maxOddsInput) {
      this.minOddsInput?.addEventListener("change", () =>
        this.onOddsRangeChange(),
      );
      this.maxOddsInput?.addEventListener("change", () =>
        this.onOddsRangeChange(),
      );
    }

    this.settingsBtn = document.getElementById("settingsBtn");
    this.settingsModal = document.getElementById("settingsModal");
    this.closeModalBtn = document.querySelector(".close");
    this.saveSettingsBtn = document.getElementById("saveSettingsBtn");
    this.resetDefaultsBtn = document.getElementById("resetDefaultsBtn");
    this.eliteModeCheckbox = document.getElementById("eliteModeCheckbox");

    if (this.settingsBtn) {
      this.settingsBtn.addEventListener("click", () =>
        this.openSettingsModal(),
      );
    }
    if (this.closeModalBtn) {
      this.closeModalBtn.addEventListener("click", () =>
        this.closeSettingsModal(),
      );
    }
    if (this.saveSettingsBtn) {
      this.saveSettingsBtn.addEventListener("click", () =>
        this.saveColorSettings(),
      );
    }
    if (this.resetDefaultsBtn) {
      this.resetDefaultsBtn.addEventListener("click", () =>
        this.resetToDefaults(),
      );
    }
    if (this.eliteModeCheckbox) {
      this.eliteModeCheckbox.addEventListener("change", () =>
        this.onEliteModeToggle(),
      );
    }

    window.addEventListener("click", (e) => {
      if (e.target === this.settingsModal) {
        this.closeSettingsModal();
      }
    });

    this.updatePlacesPaidVisibility();

    this.fetchOdds();
    this.startAutoRefresh();
  }

  onPricingInputsChange() {
    this.commissionEnabled = !!this.commissionCheckbox?.checked;

    const rawPlaces = parseFloat(this.placesPaidInput?.value);
    this.placesPaid =
      Number.isFinite(rawPlaces) && rawPlaces > 0
        ? Math.max(1, Math.min(10, Math.round(rawPlaces)))
        : 3;
    if (this.placesPaidInput) this.placesPaidInput.value = this.placesPaid;

    chrome.storage.local
      .set({
        betfairCommissionEnabled: this.commissionEnabled,
        backStakeValue: this.backStakeValue,
        placesPaid: this.placesPaid,
      })
      .catch(() => {});

    this.renderTable();
  }

  onHideLayStakeChange() {
    this.hideLayStake = !!this.hideLayStakeCheckbox?.checked;
    chrome.storage.local
      .set({
        hideLayStake: this.hideLayStake,
      })
      .catch(() => {});
    this.renderTable();
  }

  onOddsRangeChange() {
    if (this.minOddsInput) {
      const rawMin = this.minOddsInput.value;
      const parsedMin = parseFloat(rawMin);
      this.minOdds =
        Number.isFinite(parsedMin) && parsedMin >= 0 ? parsedMin : 0;
      this.minOddsInput.value = String(this.minOdds);
    }

    if (this.maxOddsInput) {
      const rawMax = this.maxOddsInput.value;
      const parsedMax = parseFloat(rawMax);
      if (rawMax === "" || !Number.isFinite(parsedMax) || parsedMax <= 0) {
        // No explicit max: use internal default but keep the UI empty
        this.maxOdds = 1000;
        this.maxOddsInput.value = "";
      } else {
        this.maxOdds = parsedMax;
        this.maxOddsInput.value = String(parsedMax);
      }
    }

    chrome.storage.local
      .set({
        minOdds: this.minOdds,
        maxOdds:
          this.maxOddsInput && this.maxOddsInput.value === ""
            ? null
            : this.maxOdds,
      })
      .catch(() => {});

    this.renderTable();
  }

  onBackStakeInputChange(normalize = false) {
    if (!this.backStakeInput) return;

    const raw = this.backStakeInput.value;
    const parsed = parseFloat(raw);

    if (raw === "" || !Number.isFinite(parsed) || parsed < 0) {
      if (normalize) {
        // On blur, snap back to default stake when empty/invalid
        this.backStakeValue = 50;
        this.backStakeInput.value = "50";
      } else {
        // While typing, treat empty as 0 stake and hide Lay $
        this.backStakeValue = 0;
      }
    } else {
      this.backStakeValue = parsed;
      if (normalize) {
        this.backStakeInput.value = String(parsed);
      }
    }

    chrome.storage.local
      .set({
        backStakeValue: this.backStakeValue,
      })
      .catch(() => {});

    this.renderTable();
  }

  onModeChange() {
    // Persist the current mode's bookie selection before switching.
    this.modeBookieFilters[this.mode] = new Set(this.enabledBookies);

    this.mode = this.modeSelect.value;

    // Restore the saved filter for the incoming mode, or default to all bookies.
    // Do not intersect with availableBookies here: fetchOdds can clear/rebuild that set
    // mid-refresh; updateBookieFilters() prunes bookies that are no longer open.
    if (this.modeBookieFilters[this.mode] !== undefined) {
      this.enabledBookies = new Set(this.modeBookieFilters[this.mode]);
    } else {
      // First time visiting this mode — enable every available bookie.
      this.enabledBookies = new Set(this.availableBookies);
    }

    this._syncCheckboxesToEnabledBookies();

    chrome.storage.local.set({ bettingMode: this.mode }).catch(() => {});
    this.updatePlacesPaidVisibility();
    this.renderTable();
  }

  /** Sync checkbox UI state to match the current enabledBookies set. */
  _syncCheckboxesToEnabledBookies() {
    const checkboxes =
      this.filterOptionsDiv.querySelectorAll(".bookie-checkbox");
    checkboxes.forEach((cb) => {
      cb.checked = this.enabledBookies.has(cb.value);
    });
    this.updateToggleAllButton();
  }

  updatePlacesPaidVisibility() {
    if (!this.placesPaidWrapper) return;
    this.placesPaidWrapper.style.display =
      this.mode === "bonus-place" ? "" : "none";
  }

  openSettingsModal() {
    document.getElementById("bonus-dark-green").value =
      this.colorThresholds.bonus.darkGreen;
    document.getElementById("bonus-light-green").value =
      this.colorThresholds.bonus.lightGreen;
    document.getElementById("bonus-yellow").value =
      this.colorThresholds.bonus.yellow;
    document.getElementById("bonus-orange").value =
      this.colorThresholds.bonus.orange;

    const npDark = document.getElementById("nonpromo-dark-green");
    const npLight = document.getElementById("nonpromo-light-green");
    const npYellow = document.getElementById("nonpromo-yellow");
    const npOrange = document.getElementById("nonpromo-orange");

    if (this.eliteModeCheckbox) this.eliteModeCheckbox.checked = this.eliteMode;

    if (this.eliteMode) {
      npDark.value = -1;
      npLight.value = -2.7;
      npYellow.value = -5.6;
      npOrange.value = -8.3;
      npDark.disabled =
        npLight.disabled =
        npYellow.disabled =
        npOrange.disabled =
          true;
    } else {
      npDark.value = this.colorThresholds.nonPromo.darkGreen;
      npLight.value = this.colorThresholds.nonPromo.lightGreen;
      npYellow.value = this.colorThresholds.nonPromo.yellow;
      npOrange.value = this.colorThresholds.nonPromo.orange;
      npDark.disabled =
        npLight.disabled =
        npYellow.disabled =
        npOrange.disabled =
          false;
    }

    this.settingsModal.style.display = "block";
  }

  onEliteModeToggle() {
    const checked = this.eliteModeCheckbox && this.eliteModeCheckbox.checked;
    const npDark = document.getElementById("nonpromo-dark-green");
    const npLight = document.getElementById("nonpromo-light-green");
    const npYellow = document.getElementById("nonpromo-yellow");
    const npOrange = document.getElementById("nonpromo-orange");

    if (checked) {
      npDark.value = -1;
      npLight.value = -2.7;
      npYellow.value = -5.6;
      npOrange.value = -8.3;
      npDark.disabled =
        npLight.disabled =
        npYellow.disabled =
        npOrange.disabled =
          true;
    } else {
      npDark.value = this.colorThresholds.nonPromo.darkGreen;
      npLight.value = this.colorThresholds.nonPromo.lightGreen;
      npYellow.value = this.colorThresholds.nonPromo.yellow;
      npOrange.value = this.colorThresholds.nonPromo.orange;
      npDark.disabled =
        npLight.disabled =
        npYellow.disabled =
        npOrange.disabled =
          false;
    }
  }

  closeSettingsModal() {
    this.settingsModal.style.display = "none";
  }

  saveColorSettings() {
    const eliteOn = this.eliteModeCheckbox && this.eliteModeCheckbox.checked;
    this.eliteMode = eliteOn;

    this.colorThresholds = {
      bonus: {
        darkGreen:
          parseFloat(document.getElementById("bonus-dark-green").value) || 90,
        lightGreen:
          parseFloat(document.getElementById("bonus-light-green").value) || 80,
        yellow: parseFloat(document.getElementById("bonus-yellow").value) || 75,
        orange: parseFloat(document.getElementById("bonus-orange").value) || 70,
      },
      // Bonus-place EV thresholds are not user-editable; keep existing or defaults.
      bonusPlace: this.colorThresholds.bonusPlace || {
        darkGreen: 9,
        lightGreen: 7.5,
        yellow: 6.5,
        orange: 5,
      },
      nonPromo: eliteOn
        ? { darkGreen: -1, lightGreen: -2.7, yellow: -5.6, orange: -8.3 }
        : {
            darkGreen:
              parseFloat(
                document.getElementById("nonpromo-dark-green").value,
              ) || -5,
            lightGreen:
              parseFloat(
                document.getElementById("nonpromo-light-green").value,
              ) || -7.5,
            yellow:
              parseFloat(document.getElementById("nonpromo-yellow").value) ||
              -10,
            orange:
              parseFloat(document.getElementById("nonpromo-orange").value) ||
              -12.5,
          },
    };

    chrome.storage.local
      .set({
        colorThresholds: this.colorThresholds,
        eliteMode: this.eliteMode,
      })
      .catch(() => {});

    this.renderTable();
    this.closeSettingsModal();
  }

  resetToDefaults() {
    this.eliteMode = false;
    this.colorThresholds = {
      bonus: { darkGreen: 90, lightGreen: 80, yellow: 75, orange: 70 },
      bonusPlace: { darkGreen: 9, lightGreen: 7.5, yellow: 6.5, orange: 5 },
      nonPromo: { darkGreen: -5, lightGreen: -7.5, yellow: -10, orange: -12.5 },
    };

    chrome.storage.local
      .set({
        colorThresholds: this.colorThresholds,
        eliteMode: false,
      })
      .catch(() => {});

    document.getElementById("bonus-dark-green").value =
      this.colorThresholds.bonus.darkGreen;
    document.getElementById("bonus-light-green").value =
      this.colorThresholds.bonus.lightGreen;
    document.getElementById("bonus-yellow").value =
      this.colorThresholds.bonus.yellow;
    document.getElementById("bonus-orange").value =
      this.colorThresholds.bonus.orange;

    if (this.eliteModeCheckbox) this.eliteModeCheckbox.checked = false;

    const npDark = document.getElementById("nonpromo-dark-green");
    const npLight = document.getElementById("nonpromo-light-green");
    const npYellow = document.getElementById("nonpromo-yellow");
    const npOrange = document.getElementById("nonpromo-orange");

    npDark.value = this.colorThresholds.nonPromo.darkGreen;
    npLight.value = this.colorThresholds.nonPromo.lightGreen;
    npYellow.value = this.colorThresholds.nonPromo.yellow;
    npOrange.value = this.colorThresholds.nonPromo.orange;
    npDark.disabled =
      npLight.disabled =
      npYellow.disabled =
      npOrange.disabled =
        false;
  }

  startAutoRefresh() {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
    }

    this.autoRefreshInterval = setInterval(() => {
      this.fetchOdds(true);
    }, 1000);

    console.log("[Dashboard] Auto-refresh started (1s interval)");
  }

  stopAutoRefresh() {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
      console.log("[Dashboard] Auto-refresh stopped");
    }
  }

  getBookieLogoHtml(bookieName) {
    if (!bookieName) return null;

    const logoFiles = {
      Betfair: "betfair.png",
      TAB: "tab.png",
      bet365: "bet365.png",
      Sportsbet: "sportsbet.png",
      Ladbrokes: "ladbrokes.png",
      Neds: "neds.png",
      PointsBet: "pointsbet.png",
      Betr: "betr.png",
      Unibet: "unibet.png",
      BetDeluxe: "betdeluxe.png",
      Noisy: "noisy.png",
    };

    const fileName = logoFiles[bookieName];
    if (!fileName) return null;

    const src = `assets/bookies/${fileName}`;
    return `<img src="${src}" alt="${bookieName}" class="bookie-logo" />`;
  }

  getBookieScriptFile(url) {
    if (!url) return null;
    if (url.includes("betfair.com.au")) return "bookies/betfair.js";
    if (url.includes("tab.com.au")) return "bookies/tab.js";
    if (url.includes("bet365.com")) return "bookies/bet365.js";
    if (url.includes("sportsbet.com.au")) return "bookies/sportsbet.js";
    if (url.includes("ladbrokes.com.au")) return "bookies/ladbrokes.js";
    if (url.includes("neds.com.au")) return "bookies/neds.js";
    if (url.includes("pointsbet.com")) return "bookies/pointsbet.js";
    if (url.includes("betr.com.au")) return "bookies/betr.js";
    if (url.includes("unibet.com")) return "bookies/unibet.js";
    if (url.includes("betdeluxe.com.au")) return "bookies/betdeluxe.js";
    if (url.includes("noisy.com.au")) return "bookies/noisy.js";
    return null;
  }

  async fetchOdds(silent = false) {
    if (!silent) {
      this.setStatus("🔄 Scanning open tabs...", "loading");
    }

    this.oddsData = [];
    this.raceVenue = null;
    this.raceNumber = null;
    this.betfairTotalMatched = null;
    this.betfairCommissionDisplay = "";

    try {
      const tabs = await chrome.tabs.query({});
      if (!silent) {
        this.setStatus(
          `📡 Found ${tabs.length} tabs, requesting odds data...`,
          "loading",
        );
      }

      const betfairTabs = tabs.filter(
        (tab) => tab.url && tab.url.includes("betfair.com.au"),
      );
      let betfairHorseNames = [];

      if (betfairTabs.length > 0) {
        if (!silent) {
          this.setStatus(
            "🏇 Loading Betfair data (source of truth)...",
            "loading",
          );
        }

        const betfairResults = await Promise.allSettled(
          betfairTabs.map((tab) => this.requestOddsFromTab(tab)),
        );

        betfairResults.forEach((result) => {
          if (result.status === "fulfilled" && result.value) {
            const { data, tabInfo } = result.value;
            if (data && data.length > 0) {
              this.mergeOddsData(data, tabInfo);
              data.forEach((horse) => {
                if (horse.name) betfairHorseNames.push(horse.name);
              });
            }
          }
        });
      }

      const bookieTabs = tabs.filter(
        (tab) =>
          tab.url &&
          !tab.url.includes("betfair.com.au") &&
          this.getBookieScriptFile(tab.url),
      );

      if (bookieTabs.length > 0) {
        if (!silent) {
          this.setStatus(
            "📊 Searching bookmakers for Betfair horses...",
            "loading",
          );
        }

        const bookieResults = await Promise.allSettled(
          bookieTabs.map((tab) =>
            this.requestOddsFromTab(tab, betfairHorseNames),
          ),
        );

        bookieResults.forEach((result) => {
          if (result.status === "fulfilled" && result.value) {
            const { data, tabInfo } = result.value;
            if (data && data.length > 0) {
              this.mergeOddsData(data, tabInfo);
            }
          }
        });
      }

      this._rebuildAvailableBookiesFromOddsData();
      this.updateBookieFilters();

      if (this.oddsData.length === 0) {
        this.setStatus(
          "No odds data available. Make sure Betfair and at least one other bookie is open.",
          "warning",
        );
        this.renderEmptyState();
      } else {
        this.updateRaceInfo();
        this.updateCommissionInfo();
        // Always clear the status bar once we have real odds data,
        // even during silent auto-refreshes.
        this.setStatus("", "info");
        this.renderTable();
      }
    } catch (error) {
      console.error("Error fetching odds:", error);
      if (!silent) {
        this.setStatus(
          "❌ Error fetching odds. Check console for details.",
          "error",
        );
      }
    } finally {
      // no-op; refresh button removed
    }
  }

  async requestOddsFromTab(tab, targetHorseNames = []) {
    return new Promise(async (resolve) => {
      const timeout = setTimeout(() => {
        resolve(null);
      }, 2000);

      const message = {
        action: "request_odds",
        targetHorseNames: targetHorseNames,
      };

      chrome.tabs.sendMessage(tab.id, message, async (response) => {
        clearTimeout(timeout);

        if (chrome.runtime.lastError) {
          const scriptFile = this.getBookieScriptFile(tab.url);

          try {
            if (scriptFile) {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: [scriptFile],
              });

              await new Promise((r) => setTimeout(r, 500));

              const retryMessage = {
                action: "request_odds",
                targetHorseNames: targetHorseNames,
              };

              chrome.tabs.sendMessage(tab.id, retryMessage, (response2) => {
                if (chrome.runtime.lastError) {
                  resolve(null);
                  return;
                }

                if (response2 && response2.success) {
                  resolve({
                    data: response2.data,
                    tabInfo: {
                      url: tab.url,
                      title: tab.title,
                      tabId: tab.id,
                    },
                  });
                } else {
                  resolve(null);
                }
              });
            } else {
              resolve(null);
            }
          } catch (error) {
            console.error(
              `[Dashboard] Failed to inject script into tab ${tab.id}:`,
              error,
            );
            resolve(null);
          }
          return;
        }

        if (response && response.success) {
          resolve({
            data: response.data,
            tabInfo: {
              url: tab.url,
              title: tab.title,
              tabId: tab.id,
            },
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  /** Derive non-Betfair bookie names from merged odds (single source of truth each refresh). */
  _rebuildAvailableBookiesFromOddsData() {
    const next = new Set();
    for (const entry of this.oddsData) {
      if (entry.site !== "Betfair") {
        next.add(entry.site);
      }
    }
    this.availableBookies = next;
  }

  mergeOddsData(data, tabInfo) {
    data.forEach((horse) => {
      if (!this.raceVenue && horse.site === "Betfair" && horse.raceVenue) {
        this.raceVenue = horse.raceVenue;
      }

      if (!this.raceNumber && horse.site === "Betfair" && horse.raceNumber) {
        this.raceNumber = horse.raceNumber;
      }

      if (
        !this.betfairTotalMatched &&
        horse.site === "Betfair" &&
        horse.totalMatched
      ) {
        this.betfairTotalMatched = horse.totalMatched;
      }

      if (
        !this.betfairCommissionDisplay &&
        horse.site === "Betfair" &&
        horse.commissionDisplay
      ) {
        this.betfairCommissionDisplay = horse.commissionDisplay;
        if (horse.commissionRate != null) {
          this.commissionValue = horse.commissionRate;
          const percent = Math.round(horse.commissionRate * 100);
          // Persist latest scraped commission so we have a default next load
          chrome.storage.local
            .set({ betfairCommission: percent })
            .catch(() => {});
          // Do not override the user's "Apply Betfair commission" checkbox
        }
      }

      this.oddsData.push({
        name: horse.name,
        normalizedName: this.normalizeHorseName(horse.name),
        backOdds: horse.backOdds,
        layOdds: horse.layOdds,
        liquidity: horse.liquidity ?? null,
        site: horse.site,
        source: `${horse.site}: ${tabInfo.url}`,
        tabId: tabInfo.tabId,
        tabUrl: tabInfo.url,
      });
    });
  }

  updateRaceInfo() {
    const el = document.getElementById("raceInfo");
    if (!el) return;

    const parts = [];
    if (this.raceVenue) {
      // Insert the race number (e.g. "R5") before the country code in parentheses.
      // "16:17 Dalby (AUS)" → "16:17 Dalby R5 (AUS)"
      const venue = this.raceNumber
        ? this.raceVenue.replace(/(\s*\([A-Z]+\)\s*)$/, ` ${this.raceNumber}$1`)
        : this.raceVenue;
      parts.push(venue);
    }
    if (this.betfairTotalMatched) parts.push(this.betfairTotalMatched);
    el.textContent = parts.join(" | ");
  }

  updateCommissionInfo() {
    const el = document.getElementById("commissionInfo");
    if (!el) return;

    if (this.betfairCommissionDisplay) {
      el.textContent = this.betfairCommissionDisplay;
    } else {
      // Scraping failed or no explicit commission text found; show sensible fallback.
      el.textContent = "Commission not found, defaulting to 8%";
    }
  }

  normalizeHorseName(name) {
    if (!name) return "";

    return String(name)
      .toLowerCase()
      .replace(/^\d+\s*[.\-]?\s*/, "") // leading runner number
      .replace(/\[[^\]]*\]/g, " ") // [..]
      .replace(/\([^)]*\)/g, " ") // (..)
      .replace(/\b(nz|aus|gb|ire|fr|usa|saf|jpn)\b/g, " ")
      .replace(/['’`]/g, "") // apostrophes
      .replace(/[^a-z0-9]+/g, " ") // punctuation to space
      .replace(/\s+/g, " ")
      .trim();
  }

  getCompactHorseKey(name) {
    return this.normalizeHorseName(name).replace(/\s+/g, "");
  }

  getMatchedHorseGroupKey(entry, horseGroups) {
    const exactKey = entry.normalizedName;
    if (horseGroups.has(exactKey)) {
      return exactKey;
    }

    const compactKey = this.getCompactHorseKey(entry.name);

    for (const existingKey of horseGroups.keys()) {
      const existingCompact = existingKey.replace(/\s+/g, "");

      if (compactKey === existingCompact) {
        return existingKey;
      }

      if (compactKey && existingCompact) {
        if (
          compactKey.includes(existingCompact) ||
          existingCompact.includes(compactKey)
        ) {
          return existingKey;
        }
      }
    }

    return exactKey;
  }

  parseCurrency(value) {
    if (value == null) return null;
    if (typeof value === "number") return value;
    const parsed = parseFloat(String(value).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  calculateRetention(betfairLay, bookieBack) {
    if (!betfairLay || !bookieBack) return null;

    if (this.commissionEnabled) {
      const denominator = betfairLay - this.commissionValue;
      if (denominator <= 0) return null;
      return (
        (((bookieBack - 1) * (1 - this.commissionValue)) / denominator) * 100
      );
    }

    return ((bookieBack - 1) / betfairLay) * 100;
  }

  // Mode dispatch helpers

  getModeCalculations(betfairLay, bookieBack, numRunners) {
    if (!betfairLay || !bookieBack) {
      return { layStake: null, xr: null, ev: null, retention: null };
    }

    const backStake = this.backStakeValue;
    const commissionEnabled = this.commissionEnabled;
    const commissionValue = this.commissionValue;

    if (this.mode === "bonus-place") {
      const { calculateBonusBackPlaceEv } = window.DashboardModes.bonusPlace;
      const result = calculateBonusBackPlaceEv({
        betfairLay,
        bookieBack,
        backStake,
        commissionEnabled,
        commissionValue,
        placesPaid: this.placesPaid,
        numRunners,
        retentionValue: this.retentionValue,
      });
      const retention = this.calculateRetention(betfairLay, bookieBack);
      return {
        layStake: result.layStake,
        xr: result.xr,
        ev: result.ev,
        retention,
      };
    }

    if (this.mode === "bonus-snr") {
      const { calculateLayStakeSnr, calculateSnrEv } =
        window.DashboardModes.bonusSnr;
      const layStake = calculateLayStakeSnr(
        betfairLay,
        bookieBack,
        backStake,
        commissionEnabled,
        commissionValue,
      );
      const snr = calculateSnrEv(
        betfairLay,
        bookieBack,
        backStake,
        commissionEnabled,
        commissionValue,
      );
      const retention = this.calculateRetention(betfairLay, bookieBack);
      return {
        layStake,
        xr: snr.xr,
        ev: null, // Bonus turnover uses retention % only; EV not shown
        retention,
      };
    }

    const { calculateLayStakeNonPromo, calculateNonPromoLossWinPercent } =
      window.DashboardModes.nonPromo;
    const layStake = calculateLayStakeNonPromo(
      betfairLay,
      bookieBack,
      backStake,
      commissionEnabled,
      commissionValue,
    );
    const retention = calculateNonPromoLossWinPercent(
      betfairLay,
      bookieBack,
      backStake,
      commissionEnabled,
      commissionValue,
    );

    let xr = null;
    if (layStake != null) {
      const layWinAfterCommission = commissionEnabled
        ? layStake * (1 - commissionValue)
        : layStake;
      xr = layWinAfterCommission - backStake;
    }

    return {
      layStake,
      xr,
      ev: null,
      retention,
    };
  }

  generateCombinations() {
    const combinations = [];
    const horseGroups = new Map();

    this.oddsData.forEach((entry) => {
      const groupKey = this.getMatchedHorseGroupKey(entry, horseGroups);

      if (!horseGroups.has(groupKey)) {
        horseGroups.set(groupKey, {
          name: entry.name,
          betfair: [],
          bookies: [],
          tabIds: {},
        });
      }

      const group = horseGroups.get(groupKey);

      // Prefer the cleaner/shorter display name
      if (!group.name || entry.name.length < group.name.length) {
        group.name = entry.name;
      }

      group.tabIds[entry.site] = { tabId: entry.tabId, url: entry.tabUrl };

      if (entry.site === "Betfair") {
        group.betfair.push(entry);
      } else {
        group.bookies.push(entry);
      }
    });

    const numRunners = this.oddsData.filter(
      (entry) => entry.site === "Betfair",
    ).length;

    horseGroups.forEach((group) => {
      if (group.betfair.length > 0 && group.bookies.length > 0) {
        group.betfair.forEach((betfairEntry) => {
          group.bookies.forEach((bookieEntry) => {
            if (this.enabledBookies.has(bookieEntry.site)) {
              const backOdds = bookieEntry.backOdds;
              const inMinRange = backOdds == null || backOdds >= this.minOdds;
              const inMaxRange = backOdds == null || backOdds <= this.maxOdds;
              if (!inMinRange || !inMaxRange) {
                return;
              }

              const {
                layStake,
                xr,
                ev,
                retention: retentionValue,
              } = this.getModeCalculations(
                betfairEntry.layOdds,
                bookieEntry.backOdds,
                numRunners,
              );

              combinations.push({
                name: group.name,
                betfairLayOdds: betfairEntry.layOdds,
                bookieBackOdds: bookieEntry.backOdds,
                bookieName: bookieEntry.site,
                liquidity: betfairEntry.liquidity ?? null,
                layStake,
                xr,
                ev,
                retention: retentionValue,
                tabIds: group.tabIds,
              });
            }
          });
        });
      } else if (group.betfair.length > 0) {
        group.betfair.forEach((betfairEntry) => {
          combinations.push({
            name: group.name,
            betfairLayOdds: betfairEntry.layOdds,
            bookieBackOdds: null,
            bookieName: null,
            liquidity: betfairEntry.liquidity ?? null,
            layStake: null,
            xr: null,
            ev: null,
            retention: null,
            tabIds: group.tabIds,
          });
        });
      } else if (group.bookies.length > 0) {
        group.bookies.forEach((bookieEntry) => {
          if (this.enabledBookies.has(bookieEntry.site)) {
            combinations.push({
              name: group.name,
              betfairLayOdds: null,
              bookieBackOdds: bookieEntry.backOdds,
              bookieName: bookieEntry.site,
              liquidity: null,
              layStake: null,
              xr: null,
              ev: null,
              retention: null,
              tabIds: group.tabIds,
            });
          }
        });
      }
    });

    return combinations;
  }

  updateBookieFilters() {
    const currentBookies = Array.from(this.availableBookies).sort();

    // Drop enabled entries for bookies that are no longer in the data
    for (const b of [...this.enabledBookies]) {
      if (!this.availableBookies.has(b)) {
        this.enabledBookies.delete(b);
      }
    }

    const existingCheckboxes = this.filterOptionsDiv.querySelectorAll(
      'input[type="checkbox"]',
    );
    const existingBookies = Array.from(existingCheckboxes).map(
      (cb) => cb.value,
    );

    if (JSON.stringify(currentBookies) !== JSON.stringify(existingBookies)) {
      const previouslyAvailable = new Set(this._lastKnownAvailableBookies);

      this.filterOptionsDiv.innerHTML = "";

      if (currentBookies.length === 0) {
        this.filterOptionsDiv.innerHTML =
          '<span style="color: #666; font-size: 14px;">No bookies available</span>';
        this.toggleAllBtn.style.display = "none";
        this._lastKnownAvailableBookies = new Set();
        return;
      }

      this.toggleAllBtn.style.display = "block";

      currentBookies.forEach((bookie) => {
        // Only auto-enable bookies that were not in the previous snapshot (new tab / new site).
        // If the user had unchecked a bookie that is still available, do not re-add it.
        if (
          !this.enabledBookies.has(bookie) &&
          !previouslyAvailable.has(bookie)
        ) {
          this.enabledBookies.add(bookie);
        }

        const wrapper = document.createElement("div");
        wrapper.className = "filter-checkbox";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = `filter-${bookie}`;
        checkbox.value = bookie;
        checkbox.checked = this.enabledBookies.has(bookie);
        checkbox.className = "bookie-checkbox";

        checkbox.addEventListener("change", (e) => {
          if (e.target.checked) {
            this.enabledBookies.add(bookie);
          } else {
            this.enabledBookies.delete(bookie);
          }
          // Persist the updated selection for this mode.
          this.modeBookieFilters[this.mode] = new Set(this.enabledBookies);
          this.updateToggleAllButton();
          this.renderTable();
        });

        const label = document.createElement("label");
        label.htmlFor = `filter-${bookie}`;
        label.textContent = bookie;

        wrapper.appendChild(checkbox);
        wrapper.appendChild(label);
        this.filterOptionsDiv.appendChild(wrapper);
      });

      this.updateToggleAllButton();
      this._lastKnownAvailableBookies = new Set(currentBookies);
    } else {
      this._lastKnownAvailableBookies = new Set(currentBookies);
    }
  }

  updateToggleAllButton() {
    const checkboxes =
      this.filterOptionsDiv.querySelectorAll(".bookie-checkbox");
    const checkedCount = Array.from(checkboxes).filter(
      (cb) => cb.checked,
    ).length;

    this.toggleAllBtn.textContent =
      checkboxes.length > 0 && checkedCount === checkboxes.length
        ? "Unselect All"
        : "Select All";
  }

  toggleAllBookies() {
    const checkboxes =
      this.filterOptionsDiv.querySelectorAll(".bookie-checkbox");
    const checkedCount = Array.from(checkboxes).filter(
      (cb) => cb.checked,
    ).length;
    const shouldCheck = checkedCount !== checkboxes.length;

    checkboxes.forEach((checkbox) => {
      checkbox.checked = shouldCheck;
      const bookie = checkbox.value;

      if (shouldCheck) {
        this.enabledBookies.add(bookie);
      } else {
        this.enabledBookies.delete(bookie);
      }
    });

    // Persist the updated selection for this mode.
    this.modeBookieFilters[this.mode] = new Set(this.enabledBookies);

    this.updateToggleAllButton();
    this.renderTable();
  }

  renderTable() {
    this.tableBody.innerHTML = "";

    const xrHeader = document.getElementById("xrHeader");
    const layStakeHeader = document.getElementById("layStakeHeader");
    const evHeader = document.getElementById("evHeader");

    if (xrHeader) xrHeader.textContent = "Xr";
    if (layStakeHeader) {
      const hideLayColumn = this.hideLayStake || this.backStakeValue <= 0;
      layStakeHeader.style.display = hideLayColumn ? "none" : "";
    }

    if (evHeader) {
      if (this.mode === "non-promo") {
        evHeader.textContent = "% Loss/Win";
      } else if (this.mode === "bonus-snr") {
        // In bonus turnover mode, show retention % just like main branch
        evHeader.textContent = "Retention %";
      } else {
        evHeader.textContent = "EV";
      }
    }

    if (this.oddsData.length === 0) {
      this.renderEmptyState();
      return;
    }

    const combinations = this.generateCombinations();

    const sortedCombos = combinations.sort((a, b) => {
      if (this.mode === "bonus-snr") {
        // Bonus turnover: sort by retention % (what we show), not EV
        if (a.retention === null && b.retention === null) return 0;
        if (a.retention === null) return 1;
        if (b.retention === null) return -1;
        return b.retention - a.retention;
      }
      if (this.mode === "non-promo") {
        // Non-promo: EV is always null; % Loss/Win lives in retention — sort by that (best first)
        if (a.retention === null && b.retention === null) return 0;
        if (a.retention === null) return 1;
        if (b.retention === null) return -1;
        return b.retention - a.retention;
      }
      // bonus-place: sort by EV
      if (a.ev === null && b.ev === null) return 0;
      if (a.ev === null) return 1;
      if (b.ev === null) return -1;
      return b.ev - a.ev;
    });

    const shouldCollapse = sortedCombos.length > this.COLLAPSE_THRESHOLD;
    const visibleRows =
      shouldCollapse && this.isCollapsed
        ? sortedCombos.slice(0, this.COLLAPSE_THRESHOLD)
        : sortedCombos;

    visibleRows.forEach((combo) => {
      const row = document.createElement("tr");

      // Retention-based row highlighting (same pattern as main branch)
      // Row highlighting:
      // - Bonus turnover (bonus-snr): thresholds compare against retention %
      // - Non-promo: thresholds compare against retention % (% loss/win)
      // - Bonus back for placing (bonus-place): thresholds compare against EV
      let thresholds = null;
      let metric = null;

      if (this.mode === "bonus-snr" && combo.retention !== null) {
        thresholds = this.colorThresholds.bonus;
        metric = combo.retention;
      } else if (this.mode === "non-promo" && combo.retention !== null) {
        thresholds = this.colorThresholds.nonPromo;
        metric = combo.retention;
      } else if (this.mode === "bonus-place" && combo.ev !== null) {
        thresholds =
          this.colorThresholds.bonusPlace || this.colorThresholds.bonus;
        metric = combo.ev;
      }

      if (thresholds && metric !== null) {
        if (metric >= thresholds.darkGreen) {
          row.classList.add("retention-dark-green");
        } else if (metric >= thresholds.lightGreen) {
          row.classList.add("retention-light-green");
        } else if (metric >= thresholds.yellow) {
          row.classList.add("retention-yellow");
        } else if (metric >= thresholds.orange) {
          row.classList.add("retention-orange");
        }
      }

      row.style.cursor = "pointer";
      row.title = "Click to view on betting site";
      row.addEventListener("click", () => this.handleRowClick(combo));

      const liquidityValue = this.parseCurrency(combo.liquidity);
      const hasEnoughLiquidity =
        liquidityValue != null &&
        combo.layStake != null &&
        liquidityValue > combo.layStake;

      const nameCell = document.createElement("td");
      nameCell.innerHTML = `<span class="horse-name">${combo.name}</span>`;
      row.appendChild(nameCell);

      const bookieNameCell = document.createElement("td");
      bookieNameCell.className = "bookie-cell";
      if (combo.bookieName) {
        const logoHtml = this.getBookieLogoHtml(combo.bookieName);
        bookieNameCell.innerHTML =
          logoHtml || `<span class="bookie-label">${combo.bookieName}</span>`;
      } else {
        bookieNameCell.innerHTML = '<span class="neutral">-</span>';
      }
      row.appendChild(bookieNameCell);

      const backCell = document.createElement("td");
      backCell.innerHTML =
        combo.bookieBackOdds != null
          ? `<span class="odds-bookie">${combo.bookieBackOdds.toFixed(2)}</span>`
          : '<span class="neutral">-</span>';
      row.appendChild(backCell);

      const layCell = document.createElement("td");
      layCell.innerHTML =
        combo.betfairLayOdds != null
          ? `<span class="odds-betfair">${combo.betfairLayOdds.toFixed(2)}</span>`
          : '<span class="neutral">-</span>';
      row.appendChild(layCell);

      const liquidityCell = document.createElement("td");
      liquidityCell.innerHTML =
        combo.liquidity != null
          ? `<span class="liquidity">${combo.liquidity}</span>`
          : '<span class="neutral">-</span>';

      if (hasEnoughLiquidity) {
        liquidityCell.style.backgroundColor = "rgba(76, 175, 80, 0.28)";
        liquidityCell.style.boxShadow =
          "inset 0 0 0 2px rgba(76, 175, 80, 0.65)";
        liquidityCell.style.borderRadius = "6px";
        liquidityCell.title = "Liquidity is greater than lay amount";
      }

      row.appendChild(liquidityCell);

      const layStakeCell = document.createElement("td");
      layStakeCell.innerHTML =
        combo.layStake != null
          ? `<span class="stake-value">${combo.layStake.toFixed(2)}</span>`
          : '<span class="neutral">-</span>';
      if (this.hideLayStake || this.backStakeValue <= 0) {
        layStakeCell.style.display = "none";
      }
      row.appendChild(layStakeCell);

      const xrCell = document.createElement("td");
      if (combo.xr != null) {
        const xrClass = combo.xr >= 0 ? "positive" : "negative";
        xrCell.innerHTML = `<span class="metric ${xrClass}">${combo.xr.toFixed(2)}</span>`;
      } else {
        xrCell.innerHTML = '<span class="metric neutral">-</span>';
      }
      row.appendChild(xrCell);

      const evCell = document.createElement("td");
      if (this.mode === "non-promo" || this.mode === "bonus-snr") {
        // For non-promo and bonus turnover, show retention % in this column
        if (combo.retention != null) {
          const evClass = combo.retention >= 0 ? "positive" : "negative";
          evCell.innerHTML = `<span class="metric ${evClass}">${combo.retention.toFixed(2)}%</span>`;
        } else {
          evCell.innerHTML = '<span class="metric neutral">-</span>';
        }
      } else {
        // Bonus back for placing: show EV (currency)
        if (combo.ev != null) {
          const evClass = combo.ev >= 0 ? "positive" : "negative";
          evCell.innerHTML = `<span class="metric ${evClass}">${combo.ev.toFixed(2)}</span>`;
        } else {
          evCell.innerHTML = '<span class="metric neutral">-</span>';
        }
      }

      row.appendChild(evCell);
      this.tableBody.appendChild(row);
    });

    if (shouldCollapse) {
      const buttonRow = document.createElement("tr");
      buttonRow.id = "collapseButtonRow";

      const buttonCell = document.createElement("td");
      buttonCell.colSpan = 8;
      buttonCell.style.textAlign = "center";
      buttonCell.style.padding = "15px";

      const button = document.createElement("button");
      button.textContent = this.isCollapsed
        ? `▼ Show ${sortedCombos.length - this.COLLAPSE_THRESHOLD} more rows`
        : "▲ Collapse";
      button.style.padding = "8px 16px";
      button.style.cursor = "pointer";
      button.onclick = () => {
        this.isCollapsed = !this.isCollapsed;
        this.renderTable();
      };

      buttonCell.appendChild(button);
      buttonRow.appendChild(buttonCell);
      this.tableBody.appendChild(buttonRow);
    }
  }

  renderEmptyState() {
    // Leave the table body empty; the status bar above the table
    // now communicates "no odds data" to the user.
    this.tableBody.innerHTML = "";
  }

  setStatus(message, type = "info") {
    if (!this.statusDiv) return;

    if (!message) {
      this.statusDiv.textContent = "";
      this.statusDiv.style.display = "none";
      return;
    }

    this.statusDiv.style.display = "block";
    this.statusDiv.textContent = message;
    this.statusDiv.style.backgroundColor =
      {
        loading: "#2a4a6a",
        success: "#2a4a2a",
        warning: "#6a5a2a",
        error: "#6a2a2a",
        info: "#2a2a2a",
      }[type] || "#2a2a2a";
  }

  async handleRowClick(combo) {
    const targetSite = combo.bookieName || "Betfair";
    const targetTabInfo = combo.tabIds[targetSite];

    if (!targetTabInfo) {
      return;
    }

    try {
      await chrome.tabs.update(targetTabInfo.tabId, { active: true });
      await chrome.windows.update(
        (await chrome.tabs.get(targetTabInfo.tabId)).windowId,
        { focused: true },
      );

      setTimeout(() => {
        chrome.tabs.sendMessage(
          targetTabInfo.tabId,
          {
            action: "highlight_horse",
            horseName: combo.name,
          },
          () => {},
        );
      }, 300);
    } catch (error) {
      console.error("[Dashboard] Error switching to tab:", error);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new MatchedBettingDashboard();
});
