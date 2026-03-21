// Noisy (noisy.com.au) scraper — win market from RaceCard Win/Place panel
// Uses stable data-testid attributes (see PRD: prefer data-testid / automation ids)

console.log("[Noisy Scraper] Initializing on:", window.location.href);

function findMatchingBetfairName(bookieName, betfairNames) {
  if (!betfairNames || betfairNames.length === 0) return null;
  const normalize = (str) =>
    str
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, "");
  const normalizedBookie = normalize(bookieName);
  for (const betfairName of betfairNames) {
    const normalizedBetfair = normalize(betfairName);
    if (normalizedBookie === normalizedBetfair) return betfairName;
    if (
      normalizedBookie.includes(normalizedBetfair) ||
      normalizedBetfair.includes(normalizedBookie)
    ) {
      return betfairName;
    }
  }
  return null;
}

function parseWinOddsFromButton(winBtn) {
  if (!winBtn) return null;
  const p = winBtn.querySelector("p");
  const raw = p ? p.textContent.trim() : "";
  if (!raw || raw === "—" || raw.toUpperCase() === "SCR") return null;
  const n = parseFloat(raw.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 1 ? n : null;
}

function cleanHorseName(raw) {
  if (!raw) return "";
  return String(raw)
    .replace(/\s*\(\d+\)\s*$/, "")
    .replace(/^[\d.]+\s*/, "")
    .trim();
}

function highlightHorse(horseName) {
  const containers = document.querySelectorAll(
    '[data-testid^="RaceCard-WinPlace-Panel-RunnerContainer-"]',
  );
  containers.forEach((container) => {
    const nameEl = container.querySelector(
      '[data-testid*="Label-RunnerName"]',
    );
    if (!nameEl) return;
    const name = cleanHorseName(nameEl.textContent);
    if (name.toLowerCase() === String(horseName).toLowerCase()) {
      const row =
        container.querySelector(
          '[data-testid$="-card-row"]',
        ) || container;
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      row.style.transition = "background-color 0.3s ease";
      row.style.backgroundColor = "#ffeb3b";
      setTimeout(() => {
        row.style.backgroundColor = "";
      }, 2000);
      console.log("[Noisy Scraper] Highlighted:", horseName);
    }
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "highlight_horse") {
    highlightHorse(request.horseName);
    sendResponse({ success: true });
    return true;
  }

  if (request.action === "request_odds") {
    const targetNames = request.targetHorseNames || [];
    scrapeOdds(targetNames)
      .then((data) => {
        sendResponse({
          success: true,
          data,
          site: "Noisy",
          url: window.location.href,
        });
      })
      .catch((error) => {
        console.warn("[Noisy Scraper] scrape failed:", error);
        sendResponse({
          success: true,
          data: [],
          site: "Noisy",
          url: window.location.href,
        });
      });
    return true;
  }
});

function scrapeOdds(targetHorseNames = []) {
  return new Promise((resolve) => {
    const horses = [];

    try {
      const containers = document.querySelectorAll(
        '[data-testid^="RaceCard-WinPlace-Panel-RunnerContainer-"]',
      );
      console.log(`[Noisy Scraper] Found ${containers.length} runner containers`);

      containers.forEach((container, index) => {
        try {
          const nameEl = container.querySelector(
            '[data-testid*="Label-RunnerName"]',
          );
          if (!nameEl) {
            console.warn(`[Noisy Scraper] Row ${index}: no runner name`);
            return;
          }

          let horseName = cleanHorseName(nameEl.textContent);
          if (!horseName) return;

          let finalName = horseName;
          if (targetHorseNames.length > 0) {
            const matched = findMatchingBetfairName(
              horseName,
              targetHorseNames,
            );
            if (matched) {
              finalName = matched;
              console.log(
                `[Noisy Scraper] Matched "${horseName}" → Betfair: "${matched}"`,
              );
            } else {
              console.log(`[Noisy Scraper] No match for "${horseName}", skipping`);
              return;
            }
          }

          const winBtn = container.querySelector(
            '[data-testid$="-FIXED-WinBtn"]',
          );
          const backOdds = parseWinOddsFromButton(winBtn);
          if (backOdds == null) {
            console.warn(
              `[Noisy Scraper] Row ${index} (${horseName}): no valid win odds`,
            );
            return;
          }

          horses.push({
            name: finalName,
            backOdds,
            layOdds: null,
            site: "Noisy",
          });
        } catch (rowErr) {
          console.warn(`[Noisy Scraper] Row ${index} error:`, rowErr);
        }
      });
    } catch (e) {
      console.error("[Noisy Scraper] scrapeOdds error:", e);
    }

    resolve(horses);
  });
}
