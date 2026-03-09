# Matched Betting Dashboard - Chrome Extension

A Chrome Extension for comparing horse racing odds across betting platforms, optimized for matched betting strategies.

## Features

- 🏇 **Real-time Odds Scraping**: Automatically extracts odds from open betting tabs
- 📊 **Clean Dashboard**: Beautiful dark-mode interface for comparing odds
- 🧮 **Retention Calculation**: Automatic calculation of retention percentages
- 🔄 **Multi-tab Support**: Scans all open tabs simultaneously
- 🏢 **Multi-bookmaker Support**: Betfair Exchange, TAB, bet365, Sportsbet, Ladbrokes, Neds, Pointsbet, Betr, and Unibet
- 🎯 **All Combinations Shown**: See odds from all bookmakers side-by-side
- 🧩 **Modular Architecture**: Separate scrapers for each bookmaker
- ⚡ **Auto-Refresh**: Updates every 1 second
- 🎨 **Smart Highlighting**: Green for >80% retention, yellow for >75%
- 🔧 **Bookmaker Filters**: Show/hide specific bookmakers

## Installation

### Loading the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select the `mulePower` directory
5. The extension icon should appear in your toolbar

### Creating Icons (Optional)

The extension references icon files. You can:
- Create your own icons (16x16, 48x48, 128x128 PNG files)
- Or temporarily remove the icon references from `manifest.json` if you want to test without icons

## Usage

### Step 1: Open Betting Tabs
1. Open betting tabs with horse racing markets:
   - **Betfair Exchange**: For lay odds
   - **TAB, bet365, Sportsbet, Ladbrokes, Neds, Pointsbet, Betr, Unibet**: For back odds
2. Navigate to specific race pages where odds are displayed
3. You can have multiple bookmaker tabs open for the same race

### Step 2: Launch Dashboard
1. Click the extension icon in your Chrome toolbar
2. A new tab will open with the Matched Betting Dashboard

### Step 3: Refresh Odds
1. Click the "🔄 Refresh Odds" button in the dashboard
2. The extension will scan all open tabs and extract available odds
3. View the comparison table with calculated retention percentages
4. If multiple bookmakers are open, the dashboard shows the **best (highest) back odds**

## Architecture

### File Structure

```
mulePower/
├── manifest.json       # Extension configuration (Manifest V3)
├── background.js       # Service worker (handles icon clicks)
├── dashboard.html      # Dashboard UI
├── dashboard.js        # Dashboard logic and data management
├── bookies/            # Bookmaker scrapers
│   ├── betfair.js      # Betfair Exchange scraper
│   ├── tab.js          # TAB scraper
│   └── bet365.js       # bet365 scraper
└── README.md          # This file
```

### How It Works

1. **Content Scripts** (Modular scrapers in `bookies/` folder):
   - **bookies/betfair.js**: Injected into Betfair pages, extracts lay odds
   - **bookies/tab.js**: Injected into TAB pages, extracts back odds
   - **bookies/bet365.js**: Injected into bet365 pages, extracts back odds
   - Each listens for `request_odds` messages
   - Returns standardized JSON format: `{ name, backOdds, layOdds, site }`

2. **Background Script** (`background.js`):
   - Listens for extension icon clicks
   - Opens dashboard in new tab

3. **Dashboard** (`dashboard.html` + `dashboard.js`):
   - Queries all open tabs
   - Sends `request_odds` messages to each tab
   - Collects and merges responses
   - Normalizes horse names for matching
   - Keeps best back odds if multiple bookies available
   - Calculates retention percentages
   - Displays data in sorted table

## Scraping Selectors

### Betfair Exchange (`betfair.js`)

- **Container**: `tr.runner-line`
- **Horse Name**: `.runner-name`
- **Lay Odds (Best)**: `.first-lay-cell button[is-best-selection="true"] label:first-of-type`

### TAB (`tab.js`)

- **Container**: `div.row[data-testid^="runner-number-"]` (uses stable test IDs)
- **Horse Name**: `.runner-name`
- **Win Odds**: `div[data-test-fixed-odds-win-price] .animate-odd`
- **Skip logic**: Ignores runners with "SCR" or empty odds

### bet365 (`bet365.js`)

Uses **structural selectors** to avoid dynamic obfuscated class names:

- **Container**: `section > div` (only divs containing an `h4` element)
- **Horse Name**: Last `<span>` inside `h4` (fallback: full h4 text with leading numbers removed)
- **Win Odds**: First `.rul-ce0412` element in row (stable library class)
- **Validation**: Skips rows without h4 elements (headers, spacers, etc.)
- **Note**: Works across different racing codes (Horse, Harness, Greyhound)

### Sportsbet (`sportsbet.js`)

Uses **data-automation-id** attributes (very stable):

- **Container**: `div[data-automation-id^="racecard-outcome-"]`
- **Horse Name**: `div[data-automation-id="racecard-outcome-name"]`
- **Win Odds**: `div[data-automation-id="racecard-outcome-0-L-price"]` → `span[data-automation-id$="-odds-button-text"]`

### Ladbrokes (`ladbrokes.js`) & Neds (`neds.js`)

Share the same structure, use **data-testid** attributes (stable):

- **Container**: `tr[data-testid="race-table-row"]`
- **Horse Name**: `span[data-testid="runner-name"]`
- **Win Odds**: `td.runner-fixed-odds` → `button[data-testid^="price-button-"]` → `span[data-testid="price-button-odds"]`

### Pointsbet (`pointsbet.js`)

Uses **data-test** attributes (stable, but name extraction requires workaround):

- **Container**: `div[data-test="runner-list"]` → `li` elements
- **Horse Name**: Searches divs for text starting with number (e.g., "1. Horse Name"), removes prefix
- **Win Odds**: `button[data-test$="OutcomeRunnerWinOddsButton"]`
- **Note**: Highly obfuscated classes, so only data-test attributes are used

### Betr (`betr.js`)

Uses **data-test-id** attributes (stable, avoids JSS classes):

- **Container**: `div[data-test-id^="RUNNER-"]`
- **Horse Name**: Searches divs for text starting with number (e.g., "1. Horse Name"), removes prefix
- **Win Odds**: First `button` containing a valid numeric value > 1
- **Warning**: Uses JSS classes internally but scraper avoids them

### Unibet (`unibet.js`)

Uses **data-test-id** attributes (stable, note the typo in their HTML):

- **Container**: `div[data-test-id^="squence-"]` (note: typo "squence" instead of "sequence")
- **Horse Name**: `strong` tag inside the container
- **Win Odds**: `button[data-test-id$="-FixedWin"]`
- **Deduplication**: Tracks processed horses to avoid duplicates

## Retention Formula

```
Retention % = ((BookieBack - 1) / (BetfairLay - 0.05)) * 100
```

- Higher retention = better matched betting opportunity
- Dashboard sorts horses by retention (best first)
- "-" displayed when data is incomplete

## Data Standardization

All scrapers return the same JSON format:

```json
[
  {
    "name": "Horse Name",
    "backOdds": 5.5,   // null for Betfair
    "layOdds": 2.22,   // null for bookmakers
    "site": "TAB"      // or "Betfair", "bet365"
  }
]
```

This standardization allows:
- Easy addition of new bookmakers
- Dashboard to merge data from multiple sources
- Automatic "best odds" selection when multiple bookies are open

## Development

### Adding New Bookmakers

The modular architecture makes adding new bookmakers straightforward:

1. **Create new scraper file** in `bookies/` folder (e.g., `bookies/sportsbet.js`):
   ```javascript
   chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
     if (request.action === 'request_odds') {
       scrapeOdds().then(data => {
         sendResponse({ success: true, data: data, site: 'Sportsbet', url: window.location.href });
       });
       return true;
     }
   });
   
   function scrapeOdds() {
     // Return standardized format: [{ name, backOdds, layOdds, site }]
   }
   ```

2. **Update `manifest.json`**:
   - Add host permission: `"*://*.sportsbet.com.au/*"`
   - Add content script entry:
     ```json
     {
       "matches": ["*://*.sportsbet.com.au/*"],
       "js": ["bookies/sportsbet.js"],
       "run_at": "document_idle"
     }
     ```

3. **No dashboard changes needed** - It automatically handles the standardized format!

### Testing

1. Open DevTools on the dashboard (F12)
2. Check Console for scraping logs
3. Verify message passing between tabs
4. Test with various race pages

## Troubleshooting

**No odds appearing?**
- Check that betting tabs are fully loaded
- Open DevTools Console (F12) on the betting tab to see scraper logs
- Verify you're on a race page (not homepage or lobby)
- For bet365: Check if the page has a `<section>` with direct `<div>` children containing `<h4>` tags
- Check console for specific error messages from scrapers

**Extension icon not working?**
- Check background script logs: `chrome://extensions/` → Extension details → "service worker" link
- Verify permissions in manifest

**Content script not running?**
- Check that URL matches host permissions
- Reload the Betfair tab after installing extension
- Check for JavaScript errors in page console

## License

Private project for personal use.
