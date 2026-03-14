// Simple loader to expose mode maths on window without using ES module imports,
// so we can keep dashboard.js as a normal script for the extension popup.

import * as bonusPlace from './modeBonusBackPlace.js';
import * as bonusSnr from './modeBonusTurnoverSnr.js';
import * as nonPromo from './modeNonPromo.js';

window.DashboardModes = {
  bonusPlace,
  bonusSnr,
  nonPromo
};

