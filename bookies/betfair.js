// Betfair Exchange scraper
// Returns lay odds + available lay liquidity for horse racing

console.log('[Betfair Scraper] Initializing on:', window.location.href);

// Highlight horse on page
function highlightHorse(horseName) {
  const runnerRows = document.querySelectorAll('tr.runner-line');

  runnerRows.forEach(row => {
    const nameElement = row.querySelector('.runner-name');
    if (nameElement) {
      let name = nameElement.textContent.trim();
      name = name.replace(/^\d+\.\s*/, '').replace(/\s*\(\d+\)\s*$/, '').trim();

      if (name.toLowerCase() === horseName.toLowerCase()) {
        // Scroll into view
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Add highlight animation
        row.style.transition = 'background-color 0.3s ease';
        row.style.backgroundColor = '#ffeb3b';
        setTimeout(() => {
          row.style.backgroundColor = '';
        }, 2000);

        console.log('[Betfair Scraper] Highlighted:', horseName);
      }
    }
  });
}

// Listen for odds requests from dashboard
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'highlight_horse') {
    highlightHorse(request.horseName);
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'request_odds') {
    scrapeOdds()
      .then(data => {
        sendResponse({
          success: true,
          data: data,
          site: 'Betfair',
          url: window.location.href
        });
      })
      .catch(error => {
        console.error('[Betfair Scraper] Error:', error);
        sendResponse({
          success: false,
          error: error.message,
          data: []
        });
      });
    return true; // Keep channel open for async response
  }
});

function cleanHorseName(rawName) {
  return rawName
    .replace(/^\d+\.\s*/, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .trim();
}

function parseLiquidityText(text) {
  if (!text) return null;

  const cleaned = text.replace(/\s+/g, ' ').trim();

  // Keep original display style if already has $
  if (cleaned.includes('$')) {
    return cleaned;
  }

  // Try to parse numeric and format with $
  const numeric = parseFloat(cleaned.replace(/[^0-9.]/g, ''));
  if (Number.isFinite(numeric)) {
    return `$${numeric}`;
  }

  return cleaned || null;
}

function searchCommissionInDOM() {
  try {
    const spans = Array.from(document.querySelectorAll('span'));
    for (const span of spans) {
      const text = span.textContent.trim();
      if (!text) continue;

      if (text.includes('Market Base Rate')) {
        const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
        if (match) {
          const percent = parseFloat(match[1]);
          if (Number.isFinite(percent)) {
            return {
              commissionRate: percent / 100,
              commissionDisplay: `${percent}% Betfair commission`
            };
          }
        }
      } else if (text.includes('Log in to see your commission rate')) {
        return {
          commissionRate: 0.08,
          commissionDisplay: 'Log in to Betfair to see commission (defaulting to 8%)'
        };
      }
    }
  } catch (e) {
    console.warn('[Betfair Scraper] Unable to extract commission rate:', e);
  }
  return null;
}

// Only open the Rules popup once per page load; reuse last commission on later scrapes
let rulesPopupOpenedThisPage = false;
let lastScrapedCommission = null;

function scrapeOdds() {
  return new Promise((resolve) => {
    const horses = [];

    function doScrape(commission) {
      if (commission) lastScrapedCommission = commission;
      const commissionRate = commission ? commission.commissionRate : null;
      const commissionDisplay = commission ? commission.commissionDisplay : null;

      try {
        // Extract race/venue name (including time) once per page
        let raceVenue = null;
        try {
          const venueElement = document.querySelector('.venue-name');
          if (venueElement) {
            const text = venueElement.textContent.trim();
            raceVenue = text || null;
          }
        } catch (e) {
          console.warn('[Betfair Scraper] Unable to extract venue name:', e);
        }

        // Total matched on the market (e.g. <span class="total-matched">AUD 45,009</span>)
        let totalMatched = null;
        try {
          const matchedEl = document.querySelector('span.total-matched');
          if (matchedEl) {
            const text = matchedEl.textContent.trim();
            totalMatched = text || null;
          }
        } catch (e) {
          console.warn('[Betfair Scraper] Unable to extract total matched:', e);
        }

        // Find all runner rows
        const runnerRows = document.querySelectorAll('tr.runner-line');

        console.log(`[Betfair Scraper] Found ${runnerRows.length} runner rows`);

        runnerRows.forEach((row, index) => {
          try {
            // Extract horse name
            const nameElement = row.querySelector('.runner-name');
            if (!nameElement) {
              console.warn(`[Betfair Scraper] Row ${index}: No name element found`);
              return;
            }

            const horseName = cleanHorseName(nameElement.textContent.trim());

            // Extract best lay odds
            const layCell = row.querySelector('.first-lay-cell');
            if (!layCell) {
              console.warn(`[Betfair Scraper] Row ${index} (${horseName}): No lay cell found`);
              return;
            }

            const layOddsElement =
              layCell.querySelector('button[is-best-selection="true"] label:first-of-type') ||
              layCell.querySelector('button label:first-of-type') ||
              layCell.querySelector('label:first-of-type');

            if (!layOddsElement) {
              console.warn(`[Betfair Scraper] Row ${index} (${horseName}): No lay odds found`);
              return;
            }

            const layOddsText = layOddsElement.textContent.trim();
            const layOdds = parseFloat(layOddsText);

            if (isNaN(layOdds)) {
              console.warn(`[Betfair Scraper] Row ${index} (${horseName}): Invalid lay odds "${layOddsText}"`);
              return;
            }

            // Extract available lay liquidity
            const layLiquidityElement =
              layCell.querySelector('button[is-best-selection="true"] label:nth-of-type(2)') ||
              layCell.querySelector('button label:nth-of-type(2)') ||
              layCell.querySelector('label:nth-of-type(2)');

            const liquidity = parseLiquidityText(
              layLiquidityElement ? layLiquidityElement.textContent.trim() : null
            );

            horses.push({
              name: horseName,
              backOdds: null,
              layOdds: layOdds,
              liquidity: liquidity,
              site: 'Betfair',
              raceVenue: raceVenue,
              totalMatched: totalMatched,
              commissionRate: commissionRate,
              commissionDisplay: commissionDisplay
            });

            console.log(
              `[Betfair Scraper] Extracted: ${horseName} @ Lay ${layOdds}` +
              (liquidity ? ` | Liquidity ${liquidity}` : '')
            );
          } catch (error) {
            console.error(`[Betfair Scraper] Error processing row ${index}:`, error);
          }
        });
        console.log(`[Betfair Scraper] Successfully extracted ${horses.length} horses`);
        resolve(horses);
      } catch (error) {
        console.error('[Betfair Scraper] Fatal error:', error);
        resolve([]);
      }
    }

    // Try to get commission from current DOM; if not found (logged-in case), open Rules popup at most once per page
    let commission = searchCommissionInDOM();
    if (!commission && lastScrapedCommission) {
      commission = lastScrapedCommission;
    }
    if (!commission) {
      const rulesLink = document.querySelector('a.market-rules-link');
      if (rulesLink && !rulesPopupOpenedThisPage) {
        rulesPopupOpenedThisPage = true;
        rulesLink.click();
        setTimeout(() => {
          commission = searchCommissionInDOM();
          if (!commission && lastScrapedCommission) commission = lastScrapedCommission;
          // Attempt to close the Rules popup by clicking its dismiss button.
          try {
            const closeBtn = document.querySelector('button.ngdialog-close[aria-label="Dismiss"], button.ngdialog-close');
            if (closeBtn) {
              closeBtn.click();
            }
          } catch (e) {
            console.warn('[Betfair Scraper] Unable to close Rules popup:', e);
          }
          doScrape(commission);
        }, 600);
      } else {
        doScrape(commission || lastScrapedCommission);
      }
    } else {
      doScrape(commission);
    }
  });
}