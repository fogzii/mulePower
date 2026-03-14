// Bonus back for placing mode (current "bonus" behaviour)
// Exports helpers to compute lay stake, XR, EV for place-refund offers.

function calculateLayStake(betfairLay, bookieBack, backStake, commissionEnabled, commissionValue) {
  if (!betfairLay || !bookieBack || !backStake) return null;

  const denominator = commissionEnabled ? betfairLay - commissionValue : betfairLay;
  if (denominator <= 0) return null;

  return (backStake * bookieBack) / denominator;
}

function calculateExpectedReturn(betfairLay, bookieBack, backStake, commissionEnabled, commissionValue) {
  const layStake = calculateLayStake(betfairLay, bookieBack, backStake, commissionEnabled, commissionValue);
  if (layStake == null) return null;

  const layWinAfterCommission = commissionEnabled ? layStake * (1 - commissionValue) : layStake;
  return layWinAfterCommission - backStake;
}

function calculateReturnsAndLiability(backStake, bookieBack, layStake, betfairLay, commissionEnabled, commissionValue) {
  if (!backStake || !bookieBack || !layStake || !betfairLay) return null;

  const winReturn = backStake * (bookieBack - 1) - layStake * (betfairLay - 1);
  const loseReturn = commissionEnabled
    ? -backStake + layStake * (1 - commissionValue)
    : -backStake + layStake;

  return {
    winReturn,
    loseReturn,
    liability: layStake * (betfairLay - 1)
  };
}

function estimatePlaceOdds(layOdds, placesPaid, numRunners) {
  if (!layOdds || !placesPaid || !numRunners) return null;
  if (placesPaid <= 1) return 0;
  if (numRunners <= placesPaid) return 1;

  const hpLookup = {
    1: 1000,
    2: 1000,
    3: 1000,
    4: 10,
    5: 7,
    6: 6,
    7: 5
  };

  const divisor = hpLookup[numRunners] ?? (4.2 - (numRunners - 8) / 10);
  return ((layOdds - 1) / divisor / placesPaid) * 3 + 1;
}

function calculateBonusBackPlaceEv({
  betfairLay,
  bookieBack,
  backStake,
  commissionEnabled,
  commissionValue,
  placesPaid,
  numRunners,
  retentionValue
}) {
  const layStake = calculateLayStake(betfairLay, bookieBack, backStake, commissionEnabled, commissionValue);
  if (layStake == null) return { layStake: null, xr: null, ev: null };

  const returns = calculateReturnsAndLiability(
    backStake,
    bookieBack,
    layStake,
    betfairLay,
    commissionEnabled,
    commissionValue
  );
  if (!returns) return { layStake: null, xr: null, ev: null };

  const winProb = 1 / betfairLay;
  const placeOdds = estimatePlaceOdds(betfairLay, placesPaid, numRunners);
  if (!placeOdds || placeOdds <= 0) return { layStake, xr: null, ev: null };

  const placeOnlyProb = Math.max(0, 1 / placeOdds - winProb);
  const loseProb = Math.max(0, 1 - winProb - placeOnlyProb);

  const bonusValue = backStake * (retentionValue / 100);
  const placeReturn = returns.loseReturn + bonusValue;

  const ev =
    winProb * returns.winReturn +
    placeOnlyProb * placeReturn +
    loseProb * returns.loseReturn;

  const xr = calculateExpectedReturn(
    betfairLay,
    bookieBack,
    backStake,
    commissionEnabled,
    commissionValue
  );

  return {
    layStake,
    xr,
    ev
  };
}

export {
  calculateLayStake,
  calculateExpectedReturn,
  calculateBonusBackPlaceEv
};

