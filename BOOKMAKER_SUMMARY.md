# Bookmaker Scraper Summary

Complete list of all supported bookmakers with their selector strategies.

## Overview

| Bookmaker | Selector Strategy | Stability | Notes |
|-----------|------------------|-----------|-------|
| Betfair | CSS Classes | ⭐⭐⭐ High | Stable runner classes |
| TAB | data-testid | ⭐⭐⭐⭐⭐ Very High | Test IDs rarely change |
| bet365 | Structural | ⭐⭐⭐⭐ High | Avoids obfuscated classes |
| Sportsbet | data-automation-id | ⭐⭐⭐⭐⭐ Very High | Automation IDs very stable |
| Ladbrokes | data-testid | ⭐⭐⭐⭐⭐ Very High | Test IDs rarely change |
| Neds | data-testid | ⭐⭐⭐⭐⭐ Very High | Same structure as Ladbrokes |
| Pointsbet | data-test | ⭐⭐⭐⭐ High | Avoids obfuscated classes |
| Betr | data-test-id | ⭐⭐⭐⭐ High | Avoids JSS classes |
| Unibet | data-test-id | ⭐⭐⭐⭐ High | Uses typo "squence" |

## Detailed Selector Reference

### 1. Betfair Exchange (betfair.js)
**Type:** Exchange (provides lay odds)  
**Stability:** ⭐⭐⭐ High

```javascript
Container:   tr.runner-line
Name:        .runner-name
Lay Odds:    .first-lay-cell button[is-best-selection="true"] label:first-of-type
```

### 2. TAB (tab.js)
**Type:** Bookmaker (provides back odds)  
**Stability:** ⭐⭐⭐⭐⭐ Very High

```javascript
Container:   div.row[data-testid^="runner-number-"]
Name:        .runner-name
Win Odds:    div[data-test-fixed-odds-win-price] .animate-odd
Skip Logic:  Text === "SCR" or empty
```

**Why Stable:** Uses test IDs specifically created for testing/automation.

### 3. bet365 (bet365.js)
**Type:** Bookmaker (provides back odds)  
**Stability:** ⭐⭐⭐⭐ High

```javascript
Container:   section > div (with h4 inside)
Name:        Last <span> in h4 (or h4 text with numbers removed)
Win Odds:    First .rul-ce0412 element (stable library class)
Strategy:    Uses DOM structure instead of obfuscated classes
```

**Why Stable:** Structural selectors + stable library class. Works across Horse/Harness/Greyhound.

### 4. Sportsbet (sportsbet.js)
**Type:** Bookmaker (provides back odds)  
**Stability:** ⭐⭐⭐⭐⭐ Very High

```javascript
Container:   div[data-automation-id^="racecard-outcome-"]
Name:        div[data-automation-id="racecard-outcome-name"]
Win Odds:    div[data-automation-id="racecard-outcome-0-L-price"]
             → span[data-automation-id$="-odds-button-text"]
```

**Why Stable:** `data-automation-id` attributes are specifically for automation/testing and rarely change.

### 5. Ladbrokes (ladbrokes.js)
**Type:** Bookmaker (provides back odds)  
**Stability:** ⭐⭐⭐⭐⭐ Very High

```javascript
Container:   tr[data-testid="race-table-row"]
Name:        span[data-testid="runner-name"]
Win Odds:    td.runner-fixed-odds
             → button[data-testid^="price-button-"]
             → span[data-testid="price-button-odds"]
```

**Why Stable:** Test IDs created for QA/testing purposes.

### 6. Neds (neds.js)
**Type:** Bookmaker (provides back odds)  
**Stability:** ⭐⭐⭐⭐⭐ Very High

```javascript
Same selectors as Ladbrokes (shared infrastructure)
```

**Why Stable:** Neds and Ladbrokes use the same platform/codebase.

### 7. Pointsbet (pointsbet.js)
**Type:** Bookmaker (provides back odds)  
**Stability:** ⭐⭐⭐⭐ High

```javascript
Container:   div[data-test="runner-list"] → li
Name:        Find div with text matching /^\d+\.\s+/ (e.g., "1. Horse")
             Remove number prefix
Win Odds:    button[data-test$="OutcomeRunnerWinOddsButton"]
```

**Why Stable:** Uses `data-test` attributes. Name extraction is a workaround but reliable.  
**Warning:** Highly obfuscated classes - avoid using any class names.

### 8. Betr (betr.js)
**Type:** Bookmaker (provides back odds)  
**Stability:** ⭐⭐⭐⭐ High

```javascript
Container:   div[data-test-id^="RUNNER-"]
Name:        Find div with text matching /^\d+\.\s+/ (e.g., "1. Horse")
             Remove number prefix
Win Odds:    First button with valid numeric value > 1
```

**Why Stable:** Uses `data-test-id` attributes instead of JSS classes.  
**Warning:** Site uses JSS classes (e.g., `jss2368`) - these MUST be avoided as they change frequently.

### 9. Unibet (unibet.js)
**Type:** Bookmaker (provides back odds)  
**Stability:** ⭐⭐⭐⭐ High

```javascript
Container:      div[data-test-id^="squence-"]  (note the typo!)
Name:           strong tag inside container
Win Odds:       button[data-test-id$="-FixedWin"]
Deduplication:  Tracks processed horses to avoid duplicates
```

**Why Stable:** Uses `data-test-id` attributes.  
**Note:** Exploits a typo in their HTML ("squence" instead of "sequence") - this typo makes it stable!

## Scraper Maintenance Guide

### High Priority (Check Rarely)
- TAB, Sportsbet, Ladbrokes, Neds - Test IDs/Automation IDs
- Check once every 3-6 months

### Medium Priority (Check Occasionally)
- bet365, Pointsbet, Betr, Unibet - Structural/data-test selectors
- Check once every 1-2 months

### Higher Risk (Monitor)
- Betfair - Uses CSS classes (but historically stable)
- Check monthly or if users report issues

## Debugging Failed Scrapers

If a scraper stops working:

1. **Check Console Logs**
   - Open DevTools on the bookmaker tab
   - Look for scraper logs with prefix like `[Sportsbet Scraper]`
   - Check for "No X element found" warnings

2. **Inspect Selectors**
   - Open Elements tab in DevTools
   - Search for the selector (e.g., `data-testid="runner-name"`)
   - Verify it still exists and has the expected structure

3. **Common Fixes**
   - If data-* attributes changed: Update selectors in the .js file
   - If structure changed: May need to redesign strategy
   - If obfuscated classes changed: This is why we avoid them!

## Standard Output Format

All scrapers return the same format:

```json
{
  "name": "Horse Name",
  "backOdds": 5.50,
  "layOdds": null,
  "site": "BookieName"
}
```

**For Betfair (Exchange):**
```json
{
  "name": "Horse Name",
  "backOdds": null,
  "layOdds": 2.50,
  "site": "Betfair"
}
```

This standardization allows the dashboard to work with any scraper without modification.
