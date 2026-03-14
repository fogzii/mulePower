// Bonus turnover (SNR) mode
// Assumes stake-not-returned free bets used on bookie back, laid off on Betfair.

function calculateLayStakeSnr(betfairLay, bookieBack, freeBetStake, commissionEnabled, commissionValue) {
  if (!betfairLay || !bookieBack || !freeBetStake) return null;

  const denominator = commissionEnabled ? betfairLay - commissionValue : betfairLay;
  if (denominator <= 0) return null;

  // Standard SNR matching formula: lay stake roughly equals (free stake * (odds - 1)) / (lay odds - commission)
  return (freeBetStake * (bookieBack - 1)) / denominator;
}

function calculateSnrEv(betfairLay, bookieBack, freeBetStake, commissionEnabled, commissionValue) {
  const layStake = calculateLayStakeSnr(betfairLay, bookieBack, freeBetStake, commissionEnabled, commissionValue);
  if (layStake == null) return { layStake: null, xr: null, ev: null };

  // If the back bet wins:
  //   bookie: win = freeBetStake * (bookieBack - 1)  (stake not returned)
  //   exchange: lose = layStake * (betfairLay - 1)
  // If the back bet loses:
  //   bookie: 0
  //   exchange: win = layStake * (1 - commission)
  const winReturn = freeBetStake * (bookieBack - 1) - layStake * (betfairLay - 1);
  const loseReturn = commissionEnabled
    ? layStake * (1 - commissionValue)
    : layStake;

  const winProb = 1 / betfairLay;
  const loseProb = 1 - winProb;

  const ev = winProb * winReturn + loseProb * loseReturn;

  // XR here is natural expected return vs 0 cost stake, so same as EV
  const xr = ev;

  return {
    layStake,
    xr,
    ev
  };
}

export { calculateLayStakeSnr, calculateSnrEv };

