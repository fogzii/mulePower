// Dashboard logic for Matched Betting Extension

class MatchedBettingDashboard {
  constructor() {
    this.oddsData = []; // Array of all odds combinations
    this.refreshBtn = document.getElementById('refreshBtn');
    this.statusDiv = document.getElementById('status');
    this.tableBody = document.getElementById('tableBody');
    this.filterOptionsDiv = document.getElementById('filterOptions');
    this.toggleAllBtn = document.getElementById('toggleAllBtn');
    this.autoRefreshInterval = null;
    this.isCollapsed = false;
    this.COLLAPSE_THRESHOLD = 10;
    this.enabledBookies = new Set(); // Track which bookies are enabled
    this.availableBookies = new Set(); // Track which bookies have data
    this.commissionValue = 0.08;
    this.commissionEnabled = true;
    this.mode = 'bonus'; // 'bonus' or 'non-promo'

    // Color threshold settings
    this.colorThresholds = {
      bonus: {
        darkGreen: 90,
        lightGreen: 80,
        yellow: 75,
        orange: 70
      },
      nonPromo: {
        darkGreen: -5,
        lightGreen: -7.5,
        yellow: -10,
        orange: -12.5
      }
    };
    this.eliteMode = false;

    this.init();
  }

  async init() {
    // Commission UI refs
    this.commissionInput = document.getElementById('commissionInput');
    this.commissionCheckbox = document.getElementById('commissionEnabled');

    // Load saved commission settings (stored as whole-number percent 0-20)
    try {
      const stored = await chrome.storage.local.get(['betfairCommission', 'betfairCommissionEnabled', 'bettingMode', 'colorThresholds', 'eliteMode']);
      let percent = 8;
      if (stored.betfairCommission != null) {
        percent = Math.max(0, Math.min(20, Math.round(Number(stored.betfairCommission))));
      }
      this.commissionValue = percent / 100;
      if (this.commissionInput) this.commissionInput.value = percent;
      if (stored.betfairCommissionEnabled != null) {
        this.commissionEnabled = !!stored.betfairCommissionEnabled;
        if (this.commissionCheckbox) this.commissionCheckbox.checked = this.commissionEnabled;
      }
      
      // Load saved mode
      if (stored.bettingMode) {
        this.mode = stored.bettingMode;
      }
      
      // Load saved color thresholds
      if (stored.colorThresholds) {
        this.colorThresholds = stored.colorThresholds;
      }
      // Load elite mode (when on, non-promo uses -1, -2.7, -5.6, -8.3)
      if (stored.eliteMode != null) {
        this.eliteMode = !!stored.eliteMode;
        if (this.eliteMode) {
          this.colorThresholds.nonPromo = { darkGreen: -1, lightGreen: -2.7, yellow: -5.6, orange: -8.3 };
        }
      }
    } catch (e) {
      console.warn('[Dashboard] Could not load settings:', e);
    }

    // Mode select UI ref
    this.modeSelect = document.getElementById('modeSelect');
    if (this.modeSelect) {
      this.modeSelect.value = this.mode;
      this.modeSelect.addEventListener('change', () => this.onModeChange());
    }

    // Bind event listeners
    this.refreshBtn.addEventListener('click', () => this.fetchOdds());
    this.toggleAllBtn.addEventListener('click', () => this.toggleAllBookies());

    if (this.commissionInput) {
      this.commissionInput.addEventListener('input', () => this.onCommissionChange());
      this.commissionInput.addEventListener('change', () => this.onCommissionChange());
    }
    if (this.commissionCheckbox) {
      this.commissionCheckbox.addEventListener('change', () => this.onCommissionChange());
    }

    // Settings modal UI refs
    this.settingsBtn = document.getElementById('settingsBtn');
    this.settingsModal = document.getElementById('settingsModal');
    this.closeModalBtn = document.querySelector('.close');
    this.saveSettingsBtn = document.getElementById('saveSettingsBtn');
    this.resetDefaultsBtn = document.getElementById('resetDefaultsBtn');
    this.eliteModeCheckbox = document.getElementById('eliteModeCheckbox');

    // Bind modal event listeners
    if (this.settingsBtn) {
      this.settingsBtn.addEventListener('click', () => this.openSettingsModal());
    }
    if (this.closeModalBtn) {
      this.closeModalBtn.addEventListener('click', () => this.closeSettingsModal());
    }
    if (this.saveSettingsBtn) {
      this.saveSettingsBtn.addEventListener('click', () => this.saveColorSettings());
    }
    if (this.resetDefaultsBtn) {
      this.resetDefaultsBtn.addEventListener('click', () => this.resetToDefaults());
    }
    if (this.eliteModeCheckbox) {
      this.eliteModeCheckbox.addEventListener('change', () => this.onEliteModeToggle());
    }
    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
      if (e.target === this.settingsModal) {
        this.closeSettingsModal();
      }
    });

    // Auto-fetch on load
    this.fetchOdds();

    // Start auto-refresh every 1 second
    this.startAutoRefresh();
  }

  onCommissionChange() {
    const raw = parseFloat(this.commissionInput.value);
    const percent = isNaN(raw) ? 8 : Math.max(0, Math.min(20, Math.round(raw)));
    this.commissionInput.value = percent;
    this.commissionValue = percent / 100;
    this.commissionEnabled = this.commissionCheckbox.checked;
    chrome.storage.local.set({
      betfairCommission: percent,
      betfairCommissionEnabled: this.commissionEnabled
    }).catch(() => {});
    this.renderTable();
  }

  onModeChange() {
    this.mode = this.modeSelect.value;
    chrome.storage.local.set({ bettingMode: this.mode }).catch(() => {});
    this.renderTable();
  }

  openSettingsModal() {
    // Populate bonus inputs
    document.getElementById('bonus-dark-green').value = this.colorThresholds.bonus.darkGreen;
    document.getElementById('bonus-light-green').value = this.colorThresholds.bonus.lightGreen;
    document.getElementById('bonus-yellow').value = this.colorThresholds.bonus.yellow;
    document.getElementById('bonus-orange').value = this.colorThresholds.bonus.orange;

    // Elite mode: sync checkbox and non-promo inputs
    const npDark = document.getElementById('nonpromo-dark-green');
    const npLight = document.getElementById('nonpromo-light-green');
    const npYellow = document.getElementById('nonpromo-yellow');
    const npOrange = document.getElementById('nonpromo-orange');
    if (this.eliteModeCheckbox) this.eliteModeCheckbox.checked = this.eliteMode;
    if (this.eliteMode) {
      npDark.value = -1;
      npLight.value = -2.7;
      npYellow.value = -5.6;
      npOrange.value = -8.3;
      npDark.disabled = npLight.disabled = npYellow.disabled = npOrange.disabled = true;
    } else {
      npDark.value = this.colorThresholds.nonPromo.darkGreen;
      npLight.value = this.colorThresholds.nonPromo.lightGreen;
      npYellow.value = this.colorThresholds.nonPromo.yellow;
      npOrange.value = this.colorThresholds.nonPromo.orange;
      npDark.disabled = npLight.disabled = npYellow.disabled = npOrange.disabled = false;
    }

    this.settingsModal.style.display = 'block';
  }

  onEliteModeToggle() {
    const checked = this.eliteModeCheckbox && this.eliteModeCheckbox.checked;
    const npDark = document.getElementById('nonpromo-dark-green');
    const npLight = document.getElementById('nonpromo-light-green');
    const npYellow = document.getElementById('nonpromo-yellow');
    const npOrange = document.getElementById('nonpromo-orange');
    if (checked) {
      npDark.value = -1;
      npLight.value = -2.7;
      npYellow.value = -5.6;
      npOrange.value = -8.3;
      npDark.disabled = npLight.disabled = npYellow.disabled = npOrange.disabled = true;
    } else {
      npDark.value = this.colorThresholds.nonPromo.darkGreen;
      npLight.value = this.colorThresholds.nonPromo.lightGreen;
      npYellow.value = this.colorThresholds.nonPromo.yellow;
      npOrange.value = this.colorThresholds.nonPromo.orange;
      npDark.disabled = npLight.disabled = npYellow.disabled = npOrange.disabled = false;
    }
  }

  closeSettingsModal() {
    this.settingsModal.style.display = 'none';
  }

  saveColorSettings() {
    const eliteOn = this.eliteModeCheckbox && this.eliteModeCheckbox.checked;
    this.eliteMode = eliteOn;
    this.colorThresholds = {
      bonus: {
        darkGreen: parseFloat(document.getElementById('bonus-dark-green').value) || 90,
        lightGreen: parseFloat(document.getElementById('bonus-light-green').value) || 80,
        yellow: parseFloat(document.getElementById('bonus-yellow').value) || 75,
        orange: parseFloat(document.getElementById('bonus-orange').value) || 70
      },
      nonPromo: eliteOn
        ? { darkGreen: -1, lightGreen: -2.7, yellow: -5.6, orange: -8.3 }
        : {
            darkGreen: parseFloat(document.getElementById('nonpromo-dark-green').value) || -5,
            lightGreen: parseFloat(document.getElementById('nonpromo-light-green').value) || -7.5,
            yellow: parseFloat(document.getElementById('nonpromo-yellow').value) || -10,
            orange: parseFloat(document.getElementById('nonpromo-orange').value) || -12.5
          }
    };

    chrome.storage.local.set({ colorThresholds: this.colorThresholds, eliteMode: this.eliteMode }).catch(() => {});

    this.renderTable();
    this.closeSettingsModal();
  }

  resetToDefaults() {
    this.eliteMode = false;
    this.colorThresholds = {
      bonus: { darkGreen: 90, lightGreen: 80, yellow: 75, orange: 70 },
      nonPromo: { darkGreen: -5, lightGreen: -7.5, yellow: -10, orange: -12.5 }
    };
    chrome.storage.local.set({ colorThresholds: this.colorThresholds, eliteMode: false }).catch(() => {});

    // Refresh modal with defaults (keeps modal open)
    document.getElementById('bonus-dark-green').value = this.colorThresholds.bonus.darkGreen;
    document.getElementById('bonus-light-green').value = this.colorThresholds.bonus.lightGreen;
    document.getElementById('bonus-yellow').value = this.colorThresholds.bonus.yellow;
    document.getElementById('bonus-orange').value = this.colorThresholds.bonus.orange;
    if (this.eliteModeCheckbox) this.eliteModeCheckbox.checked = false;
    const npDark = document.getElementById('nonpromo-dark-green');
    const npLight = document.getElementById('nonpromo-light-green');
    const npYellow = document.getElementById('nonpromo-yellow');
    const npOrange = document.getElementById('nonpromo-orange');
    npDark.value = this.colorThresholds.nonPromo.darkGreen;
    npLight.value = this.colorThresholds.nonPromo.lightGreen;
    npYellow.value = this.colorThresholds.nonPromo.yellow;
    npOrange.value = this.colorThresholds.nonPromo.orange;
    npDark.disabled = npLight.disabled = npYellow.disabled = npOrange.disabled = false;
  }

  startAutoRefresh() {
    // Clear any existing interval
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
    }

    // Refresh every 1 second
    this.autoRefreshInterval = setInterval(() => {
      this.fetchOdds(true); // silent refresh (no status updates)
    }, 1000);

    console.log('[Dashboard] Auto-refresh started (1s interval)');
  }

  stopAutoRefresh() {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
      console.log('[Dashboard] Auto-refresh stopped');
    }
  }

  // Returns the bookie script file for a URL, or null if not a supported bookmaker
  getBookieScriptFile(url) {
    if (!url) return null;
    if (url.includes('betfair.com.au')) return 'bookies/betfair.js';
    if (url.includes('tab.com.au')) return 'bookies/tab.js';
    if (url.includes('bet365.com')) return 'bookies/bet365.js';
    if (url.includes('sportsbet.com.au')) return 'bookies/sportsbet.js';
    if (url.includes('ladbrokes.com.au')) return 'bookies/ladbrokes.js';
    if (url.includes('neds.com.au')) return 'bookies/neds.js';
    if (url.includes('pointsbet.com')) return 'bookies/pointsbet.js';
    if (url.includes('betr.com.au')) return 'bookies/betr.js';
    if (url.includes('unibet.com')) return 'bookies/unibet.js';
    if (url.includes('betdeluxe.com.au')) return 'bookies/betdeluxe.js';
    return null;
  }

  async fetchOdds(silent = false) {
    if (!silent) {
      this.setStatus('🔄 Scanning open tabs...', 'loading');
      this.refreshBtn.disabled = true;
    }
    
    // Clear existing data
    this.oddsData = [];

    try {
      // Query all tabs
      const tabs = await chrome.tabs.query({});
      if (!silent) {
        this.setStatus(`📡 Found ${tabs.length} tabs, requesting odds data...`, 'loading');
      }

      // PHASE 1: Get Betfair data first (source of truth)
      const betfairTabs = tabs.filter(tab => tab.url && tab.url.includes('betfair.com.au'));
      let betfairHorseNames = [];
      
      if (betfairTabs.length > 0) {
        if (!silent) {
          this.setStatus(`🏇 Loading Betfair data (source of truth)...`, 'loading');
        }
        
        const betfairResults = await Promise.allSettled(
          betfairTabs.map(tab => this.requestOddsFromTab(tab))
        );
        
        betfairResults.forEach(result => {
          if (result.status === 'fulfilled' && result.value) {
            const { data, tabInfo } = result.value;
            if (data && data.length > 0) {
              this.mergeOddsData(data, tabInfo);
              // Collect Betfair horse names
              data.forEach(horse => {
                if (horse.name) {
                  betfairHorseNames.push(horse.name);
                }
              });
            }
          }
        });
        
        console.log(`[Dashboard] Betfair names (source of truth):`, betfairHorseNames);
      }

      // PHASE 2: Get bookmaker data (only from tabs that are supported bookmaker sites)
      const bookieTabs = tabs.filter(tab => tab.url && !tab.url.includes('betfair.com.au') && this.getBookieScriptFile(tab.url));
      
      if (bookieTabs.length > 0) {
        if (!silent) {
          this.setStatus(`📊 Searching bookmakers for Betfair horses...`, 'loading');
        }
        
        const bookieResults = await Promise.allSettled(
          bookieTabs.map(tab => this.requestOddsFromTab(tab, betfairHorseNames))
        );
        
        let successCount = betfairTabs.length > 0 ? betfairTabs.length : 0;
        bookieResults.forEach(result => {
          if (result.status === 'fulfilled' && result.value) {
            const { data, tabInfo } = result.value;
            if (data && data.length > 0) {
              this.mergeOddsData(data, tabInfo);
              successCount++;
            }
          }
        });
      }

      // Update bookie filters
      this.updateBookieFilters();

      // Update UI
      if (this.oddsData.length === 0) {
        if (!silent) {
          this.setStatus('⚠️ No odds data found. Make sure you have betting tabs open (Betfair, TAB, or bet365).', 'warning');
        }
        this.renderEmptyState();
      } else {
        const totalSuccess = betfairTabs.length + bookieTabs.length;
        if (!silent) {
          this.setStatus(`Successfully loaded odds from ${totalSuccess} tab(s). Found ${this.oddsData.length} combination(s). Auto-refreshing every 1s.`, 'success');
        }
        this.renderTable();
      }
    } catch (error) {
      console.error('Error fetching odds:', error);
      if (!silent) {
        this.setStatus('❌ Error fetching odds. Check console for details.', 'error');
      }
    } finally {
      if (!silent) {
        this.refreshBtn.disabled = false;
      }
    }
  }

  async requestOddsFromTab(tab, targetHorseNames = []) {
    return new Promise(async (resolve) => {
      // Set timeout for unresponsive tabs
      const timeout = setTimeout(() => {
        resolve(null);
      }, 2000);

      // Try sending message to existing content script
      const message = { 
        action: 'request_odds',
        targetHorseNames: targetHorseNames // Pass Betfair names if available
      };
      
      chrome.tabs.sendMessage(tab.id, message, async (response) => {
        clearTimeout(timeout);
        
        if (chrome.runtime.lastError) {
          const scriptFile = this.getBookieScriptFile(tab.url);
          if (scriptFile) {
            console.log(`[Dashboard] Content script not found in tab ${tab.id}, injecting ${scriptFile}...`);
          }
          try {
            if (scriptFile) {
              // Inject the content script
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: [scriptFile]
              });

              // Wait a bit for the script to initialize
              await new Promise(r => setTimeout(r, 500));

              // Try again with target names
              const retryMessage = { 
                action: 'request_odds',
                targetHorseNames: targetHorseNames
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
                      tabId: tab.id
                    }
                  });
                } else {
                  resolve(null);
                }
              });
            } else {
              resolve(null);
            }
          } catch (error) {
            console.error(`[Dashboard] Failed to inject script into tab ${tab.id}:`, error);
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
              tabId: tab.id
            }
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  mergeOddsData(data, tabInfo) {
    // Store all horse data with their site information
    data.forEach(horse => {
      this.oddsData.push({
        name: horse.name,
        normalizedName: this.normalizeHorseName(horse.name),
        backOdds: horse.backOdds,
        layOdds: horse.layOdds,
        site: horse.site,
        source: `${horse.site}: ${tabInfo.url}`,
        tabId: tabInfo.tabId, // Store tab ID for click-to-switch
        tabUrl: tabInfo.url
      });
      
      // Track available bookmakers (exclude Betfair from filter)
      if (horse.site !== 'Betfair') {
        this.availableBookies.add(horse.site);
      }
    });
  }

  // Normalize horse names for matching (case-insensitive, trim whitespace)
  normalizeHorseName(name) {
    return name.trim().toLowerCase();
  }

  // Create all possible combinations of Betfair + Bookies for each horse
  generateCombinations() {
    const combinations = [];
    
    // Group by normalized horse name
    const horseGroups = new Map();
    this.oddsData.forEach(entry => {
      if (!horseGroups.has(entry.normalizedName)) {
        horseGroups.set(entry.normalizedName, {
          name: entry.name,
          betfair: [],
          bookies: [],
          tabIds: {} // Track tab IDs by site
        });
      }
      
      const group = horseGroups.get(entry.normalizedName);
      group.tabIds[entry.site] = { tabId: entry.tabId, url: entry.tabUrl };
      
      if (entry.site === 'Betfair') {
        group.betfair.push(entry);
      } else {
        group.bookies.push(entry);
      }
    });

    // Create combinations for each horse
    horseGroups.forEach(group => {
      if (group.betfair.length > 0 && group.bookies.length > 0) {
        // Create all Betfair x Bookie combinations
        group.betfair.forEach(betfairEntry => {
          group.bookies.forEach(bookieEntry => {
            // Filter by enabled bookies
            if (this.enabledBookies.has(bookieEntry.site)) {
              const retentionValue = this.mode === 'bonus' 
                ? this.calculateRetention(betfairEntry.layOdds, bookieEntry.backOdds)
                : this.calculateNonPromoLossWin(betfairEntry.layOdds, bookieEntry.backOdds);
              
              combinations.push({
                name: group.name,
                betfairLayOdds: betfairEntry.layOdds,
                bookieBackOdds: bookieEntry.backOdds,
                bookieName: bookieEntry.site,
                retention: retentionValue,
                tabIds: group.tabIds // Include tab information
              });
            }
          });
        });
      } else if (group.betfair.length > 0) {
        // Only Betfair odds available
        group.betfair.forEach(betfairEntry => {
          combinations.push({
            name: group.name,
            betfairLayOdds: betfairEntry.layOdds,
            bookieBackOdds: null,
            bookieName: null,
            retention: null,
            tabIds: group.tabIds
          });
        });
      } else if (group.bookies.length > 0) {
        // Only bookie odds available (filter by enabled)
        group.bookies.forEach(bookieEntry => {
          if (this.enabledBookies.has(bookieEntry.site)) {
            combinations.push({
              name: group.name,
              betfairLayOdds: null,
              bookieBackOdds: bookieEntry.backOdds,
              bookieName: bookieEntry.site,
              retention: null,
              tabIds: group.tabIds
            });
          }
        });
      }
    });

    return combinations;
  }

  updateBookieFilters() {
    // Get current bookies from available data
    const currentBookies = Array.from(this.availableBookies).sort();
    
    // Check if filters need updating
    const existingCheckboxes = this.filterOptionsDiv.querySelectorAll('input[type="checkbox"]');
    const existingBookies = Array.from(existingCheckboxes).map(cb => cb.value);
    
    if (JSON.stringify(currentBookies) !== JSON.stringify(existingBookies)) {
      // Rebuild filter UI
      this.filterOptionsDiv.innerHTML = '';
      
      if (currentBookies.length === 0) {
        this.filterOptionsDiv.innerHTML = '<span style="color: #666; font-size: 14px;">No bookies available</span>';
        this.toggleAllBtn.style.display = 'none';
        return;
      }
      
      // Show toggle button
      this.toggleAllBtn.style.display = 'block';
      
      currentBookies.forEach(bookie => {
        // Initialize as enabled if not already tracked
        if (!this.enabledBookies.has(bookie)) {
          this.enabledBookies.add(bookie);
        }
        
        const wrapper = document.createElement('div');
        wrapper.className = 'filter-checkbox';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `filter-${bookie}`;
        checkbox.value = bookie;
        checkbox.checked = this.enabledBookies.has(bookie);
        checkbox.className = 'bookie-checkbox';
        
        checkbox.addEventListener('change', (e) => {
          if (e.target.checked) {
            this.enabledBookies.add(bookie);
          } else {
            this.enabledBookies.delete(bookie);
          }
          this.updateToggleAllButton();
          this.renderTable(); // Re-render with new filter
        });
        
        const label = document.createElement('label');
        label.htmlFor = `filter-${bookie}`;
        label.textContent = bookie;
        
        wrapper.appendChild(checkbox);
        wrapper.appendChild(label);
        this.filterOptionsDiv.appendChild(wrapper);
      });
      
      // Update toggle button text
      this.updateToggleAllButton();
    }
  }

  updateToggleAllButton() {
    const checkboxes = this.filterOptionsDiv.querySelectorAll('.bookie-checkbox');
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    
    if (checkedCount === checkboxes.length) {
      this.toggleAllBtn.textContent = 'Unselect All';
    } else {
      this.toggleAllBtn.textContent = 'Select All';
    }
  }

  toggleAllBookies() {
    const checkboxes = this.filterOptionsDiv.querySelectorAll('.bookie-checkbox');
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    
    // If all are checked, uncheck all. Otherwise, check all.
    const shouldCheck = checkedCount !== checkboxes.length;
    
    checkboxes.forEach(checkbox => {
      checkbox.checked = shouldCheck;
      const bookie = checkbox.value;
      
      if (shouldCheck) {
        this.enabledBookies.add(bookie);
      } else {
        this.enabledBookies.delete(bookie);
      }
    });
    
    this.updateToggleAllButton();
    this.renderTable();
  }

  calculateRetention(betfairLay, bookieBack) {
    if (!betfairLay || !bookieBack) {
      return null;
    }

    if (this.commissionEnabled) {
      // With commission: retention = (back - 1) * (1 - commission) / (lay - commission) * 100
      const denominator = betfairLay - this.commissionValue;
      if (denominator <= 0) return null;
      const retention = ((bookieBack - 1) * (1 - this.commissionValue) / denominator) * 100;
      return retention;
    } else {
      // Without commission: retention = (back - 1) / lay * 100
      const retention = ((bookieBack - 1) / betfairLay) * 100;
      return retention;
    }
  }

  calculateNonPromoLossWin(betfairLay, bookieBack) {
    if (!betfairLay || !bookieBack) {
      return null;
    }

    const backStake = 100;
    
    // Calculate lay stake that balances both outcomes when commission is applied
    let layStake;
    if (this.commissionEnabled) {
      // With commission, we need to balance:
      // Scenario 1 (back wins): backProfit - layLiability = outcome
      // Scenario 2 (back loses): layWinAfterCommission - backStake = outcome
      // 
      // backStake * (bookieBack - 1) - layStake * (betfairLay - 1) = layStake * (1 - commission) - backStake
      // Solving for layStake:
      // backStake * (bookieBack - 1) + backStake = layStake * (betfairLay - 1) + layStake * (1 - commission)
      // backStake * bookieBack = layStake * (betfairLay - 1 + 1 - commission)
      // layStake = (backStake * bookieBack) / (betfairLay - commission)
      layStake = (backStake * bookieBack) / (betfairLay - this.commissionValue);
    } else {
      // Without commission
      layStake = (backStake * bookieBack) / betfairLay;
    }
    
    // Calculate outcome (should be same for both scenarios when balanced)
    // Scenario 1: Back wins
    const backProfit = backStake * (bookieBack - 1);
    const layLoss = layStake * (betfairLay - 1);
    const outcome = backProfit - layLoss;
    
    // Calculate loss/win percentage
    const lossWinPercent = (outcome / backStake) * 100;
    
    return lossWinPercent;
  }

  renderTable() {
    this.tableBody.innerHTML = '';

    // Update table header based on mode
    const retentionHeader = document.getElementById('retentionHeader');
    if (retentionHeader) {
      retentionHeader.textContent = this.mode === 'bonus' ? 'Retention %' : '% Loss/Win';
    }

    if (this.oddsData.length === 0) {
      this.renderEmptyState();
      return;
    }

    // Generate all combinations
    const combinations = this.generateCombinations();

    // Sort by retention (best opportunities first)
    const sortedCombos = combinations.sort((a, b) => {
      // Sort: valid retentions first, then incomplete data
      if (a.retention === null && b.retention === null) return 0;
      if (a.retention === null) return 1;
      if (b.retention === null) return -1;
      
      // In bonus mode: higher retention is better
      // In non-promo mode: higher value is better (less loss or more profit)
      return b.retention - a.retention;
    });

    // Determine if we should show collapse button
    const shouldCollapse = sortedCombos.length > this.COLLAPSE_THRESHOLD;
    const visibleRows = shouldCollapse && this.isCollapsed 
      ? sortedCombos.slice(0, this.COLLAPSE_THRESHOLD) 
      : sortedCombos;

    visibleRows.forEach((combo, index) => {
      const row = document.createElement('tr');
      
      // Add retention-based row highlighting using configurable thresholds
      if (combo.retention !== null) {
        const thresholds = this.mode === 'bonus' ? this.colorThresholds.bonus : this.colorThresholds.nonPromo;
        
        if (combo.retention >= thresholds.darkGreen) {
          row.classList.add('retention-dark-green');
        } else if (combo.retention >= thresholds.lightGreen) {
          row.classList.add('retention-light-green');
        } else if (combo.retention >= thresholds.yellow) {
          row.classList.add('retention-yellow');
        } else if (combo.retention >= thresholds.orange) {
          row.classList.add('retention-orange');
        }
      }
      
      // Make row clickable
      row.style.cursor = 'pointer';
      row.title = 'Click to view on betting site';
      row.addEventListener('click', () => this.handleRowClick(combo));
      
      // Horse Name
      const nameCell = document.createElement('td');
      nameCell.innerHTML = `<span class="horse-name">${combo.name}</span>`;
      row.appendChild(nameCell);

      // Betfair Lay Odds
      const betfairCell = document.createElement('td');
      if (combo.betfairLayOdds !== null) {
        betfairCell.innerHTML = `<span class="odds-betfair">${combo.betfairLayOdds.toFixed(2)}</span>`;
      } else {
        betfairCell.innerHTML = '<span class="neutral">-</span>';
      }
      row.appendChild(betfairCell);

      // Bookie Back Odds
      const bookieCell = document.createElement('td');
      if (combo.bookieBackOdds !== null) {
        const bookieLabel = combo.bookieName ? ` <span class="bookie-label">(${combo.bookieName})</span>` : '';
        bookieCell.innerHTML = `<span class="odds-bookie">${combo.bookieBackOdds.toFixed(2)}</span>${bookieLabel}`;
      } else {
        bookieCell.innerHTML = '<span class="neutral">-</span>';
      }
      row.appendChild(bookieCell);

      // Retention % or Loss/Win %
      const retentionCell = document.createElement('td');
      
      if (combo.retention !== null) {
        // Cells always red/negative in both modes
        const retentionClass = 'negative';
        retentionCell.innerHTML = `<span class="retention ${retentionClass}">${combo.retention.toFixed(2)}%</span>`;
      } else {
        retentionCell.innerHTML = '<span class="retention neutral">-</span>';
      }
      row.appendChild(retentionCell);

      this.tableBody.appendChild(row);
    });

    // Add collapse/expand button if needed
    if (shouldCollapse) {
      const buttonRow = document.createElement('tr');
      buttonRow.id = 'collapseButtonRow';
      const buttonCell = document.createElement('td');
      buttonCell.colSpan = 4;
      buttonCell.style.textAlign = 'center';
      buttonCell.style.padding = '15px';
      
      const button = document.createElement('button');
      button.textContent = this.isCollapsed 
        ? `▼ Show ${sortedCombos.length - this.COLLAPSE_THRESHOLD} more rows` 
        : `▲ Collapse`;
      button.style.padding = '8px 16px';
      button.style.cursor = 'pointer';
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
    this.tableBody.innerHTML = `
      <tr>
        <td colspan="4" class="empty-state">
          <div class="empty-state-icon">📊</div>
          <div class="empty-state-text">No odds data available</div>
          <div class="empty-state-hint">Open betting tabs and click refresh to load odds</div>
        </td>
      </tr>
    `;
  }

  setStatus(message, type = 'info') {
    this.statusDiv.textContent = message;
    this.statusDiv.style.backgroundColor = {
      loading: '#2a4a6a',
      success: '#2a4a2a',
      warning: '#6a5a2a',
      error: '#6a2a2a',
      info: '#2a2a2a'
    }[type] || '#2a2a2a';
  }

  async handleRowClick(combo) {
    console.log('[Dashboard] Row clicked:', combo);
    
    // Determine which tab to switch to
    // Priority: Bookie tab (if exists) > Betfair tab
    let targetSite = combo.bookieName || 'Betfair';
    let targetTabInfo = combo.tabIds[targetSite];
    
    if (!targetTabInfo) {
      console.warn('[Dashboard] No tab found for site:', targetSite);
      return;
    }
    
    try {
      // Switch to the tab
      await chrome.tabs.update(targetTabInfo.tabId, { active: true });
      await chrome.windows.update(
        (await chrome.tabs.get(targetTabInfo.tabId)).windowId,
        { focused: true }
      );
      
      // Send highlight message to content script
      setTimeout(() => {
        chrome.tabs.sendMessage(targetTabInfo.tabId, {
          action: 'highlight_horse',
          horseName: combo.name
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('[Dashboard] Could not send highlight message:', chrome.runtime.lastError.message);
          } else {
            console.log('[Dashboard] Highlight message sent successfully');
          }
        });
      }, 300); // Small delay to ensure tab is active
      
    } catch (error) {
      console.error('[Dashboard] Error switching to tab:', error);
    }
  }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new MatchedBettingDashboard();
});
