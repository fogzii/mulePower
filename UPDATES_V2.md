# Updates V2 - Major Enhancements

## Three Critical Improvements

### 1. ✅ Tabs Already Open Support

**Problem:** Content scripts only inject when a page loads. If tabs were already open before the extension was installed/updated, they wouldn't have the scraper scripts.

**Solution:** Programmatic Script Injection
- When a tab doesn't respond to messages, the dashboard now:
  1. Detects the tab's URL
  2. Programmatically injects the appropriate scraper script
  3. Waits 500ms for initialization
  4. Retries the message request

**Code Location:** `dashboard.js` → `requestOddsFromTab()` method

**Benefits:**
- Works with tabs that were open before extension load
- Auto-recovers if content scripts fail to load
- No need to refresh betting tabs manually

---

### 2. ✅ Auto-Refresh Every 1 Second

**Problem:** Odds (especially on Betfair) change rapidly. Manual refresh was too slow.

**Solution:** Automatic Polling
- `setInterval()` runs every 1000ms (1 second)
- Silent refresh mode (no status message spam)
- Always shows latest odds in real-time

**Code Location:** `dashboard.js` → `startAutoRefresh()` method

**UI Changes:**
- Button text: "🔄 Refresh Now" (for manual override)
- Status bar: Shows "Auto-refreshing every 1s"
- Silent updates don't flash status messages

**Performance Note:** Uses 2-second timeout for each tab to keep refresh fast

---

### 3. ✅ Show All Bookmaker Combinations (No Dominated Odds Hidden)

**Problem:** Old logic kept only the "best" back odds, hiding other bookmaker options.

**Solution:** Generate All Combinations
- If Horse A has:
  - 1 Betfair lay price
  - 2 bookmaker back prices (TAB + bet365)
- Result: 2 rows showing both combinations

**Example Output:**
```
Horse A | 2.50 (Betfair) | 5.00 (TAB)    | 95.2%
Horse A | 2.50 (Betfair) | 4.80 (bet365) | 93.8%
```

**Code Location:** `dashboard.js` → `generateCombinations()` method

**New Logic:**
1. Group odds by normalized horse name
2. Separate Betfair entries from bookmaker entries
3. Create Cartesian product: Each Betfair × Each Bookie
4. Show incomplete rows (Betfair-only or Bookie-only) separately

---

### 4. ✅ BONUS: Auto-Collapse for Large Lists

**Problem:** More than 10 rows can clutter the dashboard.

**Solution:** Smart Collapse
- If > 10 rows: Shows first 10, hides the rest
- Button appears: "▼ Show X more rows"
- Click to expand/collapse
- State persists during auto-refresh

**Threshold:** `COLLAPSE_THRESHOLD = 10` (configurable in code)

**Code Location:** `dashboard.js` → `renderTable()` method

---

## Data Structure Changes

### Old (Single Row Per Horse):
```javascript
{
  name: "Horse A",
  betfairLayOdds: 2.5,
  bookieBackOdds: 5.0,  // Only best odds
  bookieName: "TAB"
}
```

### New (Array of All Combinations):
```javascript
[
  {
    name: "Horse A",
    betfairLayOdds: 2.5,
    bookieBackOdds: 5.0,
    bookieName: "TAB",
    retention: 95.2
  },
  {
    name: "Horse A",
    betfairLayOdds: 2.5,
    bookieBackOdds: 4.8,
    bookieName: "bet365",
    retention: 93.8
  }
]
```

---

## Testing Instructions

### Test 1: Tabs Already Open
1. Open Betfair, TAB, bet365 tabs BEFORE loading extension
2. Install/reload extension
3. Open dashboard
4. Click "Refresh Now"
5. ✅ Expected: Odds appear (scripts auto-injected)

### Test 2: Auto-Refresh
1. Open dashboard
2. Keep a betting tab open in another window
3. Watch for odds changes on the betting site
4. ✅ Expected: Dashboard updates within 1 second

### Test 3: Multiple Bookmakers
1. Open same race on TAB and bet365
2. Open Betfair for that race
3. Open dashboard
4. ✅ Expected: Each horse has 2 rows (Betfair+TAB, Betfair+bet365)

### Test 4: Collapse Feature
1. Open multiple races or bookmakers
2. Get > 10 rows
3. ✅ Expected: List collapses, button appears
4. Click button
5. ✅ Expected: All rows shown

---

## Performance Considerations

- **Refresh Interval:** 1 second (1000ms)
- **Tab Timeout:** 2 seconds (down from 3s for faster refresh)
- **Injection Wait:** 500ms (gives script time to initialize)
- **Total Refresh Time:** ~2-3 seconds for all tabs

If you have many tabs open, consider:
- Closing non-betting tabs
- Increasing timeout if data seems incomplete

---

## Files Modified

- ✅ `dashboard.js` - Major refactor for new logic
- ✅ `dashboard.html` - UI text updates + collapse button styles
- ⚠️ No changes to bookmaker scrapers (betfair.js, tab.js, bet365.js)
- ⚠️ No changes to manifest.json (already had `scripting` permission)

---

## Quick Reference

### Auto-Refresh
- **Start:** Automatic on dashboard load
- **Stop:** Close dashboard tab (interval clears)
- **Manual:** Click "🔄 Refresh Now"

### Collapse
- **Trigger:** > 10 rows
- **Default:** Collapsed (first 10 shown)
- **Toggle:** Click button at bottom of table

### Script Injection
- **When:** Tab doesn't respond to message
- **How:** chrome.scripting.executeScript()
- **Sites:** Betfair, TAB, bet365
- **Wait:** 500ms before retry
