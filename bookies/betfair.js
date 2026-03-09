// Betfair Exchange scraper
// Returns lay odds for horse racing

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

function scrapeOdds() {
  return new Promise((resolve) => {
    const horses = [];

    try {
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
          let horseName = nameElement.textContent.trim();
          
          // Clean horse name: remove leading number (e.g., "1. ") and trailing barrier (e.g., " (1)")
          // This ensures consistency with bookmaker names
          horseName = horseName.replace(/^\d+\.\s*/, '').replace(/\s*\(\d+\)\s*$/, '').trim();

          // Extract lay odds (best price)
          const layOddsElement = row.querySelector('.first-lay-cell button[is-best-selection="true"] label:first-of-type');
          
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

          // Standardized format: backOdds is null for exchanges
          horses.push({
            name: horseName,
            backOdds: null,
            layOdds: layOdds,
            site: 'Betfair'
          });

          console.log(`[Betfair Scraper] Extracted: ${horseName} @ Lay ${layOdds}`);
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
  });
}
