# Refactoring Summary: Modular Multi-Bookmaker Architecture

## Changes Made

### 1. Manifest Updates (`manifest.json`)

**Added Host Permissions:**
- `*://*.betfair.com.au/*` (existing)
- `*://*.tab.com.au/*` (new)
- `*://*.bet365.com.au/*` (new)
- `*://*.bet365.com/*` (new)

**Content Scripts - Old (Single File):**
```json
{
  "matches": ["*://*.betfair.com.au/*"],
  "js": ["content.js"]
}
```

**Content Scripts - New (Modular):**
```json
{
  "matches": ["*://*.betfair.com.au/*"],
  "js": ["betfair.js"]
},
{
  "matches": ["*://*.tab.com.au/*"],
  "js": ["tab.js"]
},
{
  "matches": ["*://*.bet365.com.au/*", "*://*.bet365.com/*"],
  "js": ["bet365.js"]
}
```

### 2. File Structure Changes

**Removed:**
- `content.js` (monolithic scraper)

**Added:**
- `bookies/` folder (contains all bookmaker scrapers)
- `bookies/betfair.js` - Betfair Exchange scraper
- `bookies/tab.js` - TAB scraper
- `bookies/bet365.js` - bet365 scraper

### 3. Data Standardization

All scrapers now return the **same format**:

```json
[
  {
    "name": "Horse Name",
    "backOdds": 5.5,   // null for Betfair (exchanges)
    "layOdds": 2.22,   // null for bookmakers
    "site": "TAB"      // "Betfair", "TAB", or "bet365"
  }
]
```

### 4. Scraper Implementations

#### betfair.js
- Extracts **lay odds** from Betfair Exchange
- Uses stable selectors: `tr.runner-line`, `.runner-name`, `.first-lay-cell`
- Returns `layOdds`, sets `backOdds` to null

#### tab.js
- Extracts **back odds** from TAB
- Uses test IDs: `data-testid^="runner-number-"`, `data-test-fixed-odds-win-price`
- Skips scratched runners ("SCR")
- Returns `backOdds`, sets `layOdds` to null

#### bet365.js
- Extracts **back odds** from bet365
- Uses obfuscated classes: `.rh-99`, `.rh-61`, `.rh-b5`, `.rul-ce0412`
- ⚠️ **Warning**: Classes may change when bet365 updates
- Returns `backOdds`, sets `layOdds` to null

### 5. Dashboard Updates (`dashboard.js`)

#### Enhanced `mergeOddsData()`:
- **Horse name normalization**: Case-insensitive matching
- **Best odds selection**: If multiple bookies are open, keeps the **highest back odds**
- **Bookie tracking**: Stores which bookmaker provided the best odds

```javascript
// Old
existing.bookieBackOdds = horse.backOdds;

// New (with best odds logic)
if (existing.bookieBackOdds === null || horse.backOdds > existing.bookieBackOdds) {
  existing.bookieBackOdds = horse.backOdds;
  existing.bookieName = horse.site;
}
```

#### Enhanced Display:
- Shows bookie name next to back odds (e.g., "5.50 (TAB)")
- Updated status messages to mention all supported bookmakers

### 6. Benefits of This Architecture

✅ **Separation of Concerns**: Each bookmaker has its own file  
✅ **Easy to Add New Bookmakers**: Just create a new file + manifest entry  
✅ **No Dashboard Changes Needed**: Works with any scraper that returns the standard format  
✅ **Best Odds Automatically**: Dashboard handles multiple bookies intelligently  
✅ **Independent Testing**: Can test each scraper in isolation  
✅ **Maintainability**: If one scraper breaks, others continue working  

## Scraper Selector Reference

### Betfair (Stable)
```
Container:   tr.runner-line
Name:        .runner-name
Lay Odds:    .first-lay-cell button[is-best-selection="true"] label:first-of-type
```

### TAB (Very Stable - Uses Test IDs)
```
Container:   div.row[data-testid^="runner-number-"]
Name:        .runner-name
Win Odds:    div[data-test-fixed-odds-win-price] .animate-odd
Skip:        Text === "SCR" or empty
```

### bet365 (Structural Selectors)
```
Container:   section > div (with h4 inside)
Name:        Last <span> in h4 (or h4 text with numbers removed)
Win Odds:    First .rul-ce0412 element (stable library class)
Strategy:    Uses DOM structure instead of obfuscated classes
Benefit:     Works across Horse, Harness, and Greyhound racing
```

## Testing the Refactored Extension

1. **Reload the extension** in `chrome://extensions/`
2. Open test tabs:
   - Betfair Exchange race page
   - TAB race page (same race if possible)
   - bet365 race page (same race if possible)
3. Click extension icon to open dashboard
4. Click "Refresh Odds"
5. Expected results:
   - Horses matched by name across bookies
   - Betfair lay odds in column 2
   - Best back odds in column 3 with bookie name
   - Retention % calculated correctly

## Future Bookmakers

To add Sportsbet, Ladbrokes, Unibet, etc.:

1. Create `sportsbet.js` (copy structure from `tab.js`)
2. Add selectors for that site
3. Add to `manifest.json` host_permissions and content_scripts
4. **No changes needed** to dashboard.js!

## Migration Notes

- Old `content.js` has been **deleted**
- If you had the extension loaded, **reload it** in Chrome
- All existing functionality is preserved
- New functionality: Multi-bookmaker support with best odds selection
