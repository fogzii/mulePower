// Non-promo mode (% loss/win on straight qualifying / non-offer bets)

function calculateLayStakeNonPromo(betfairLay, bookieBack, backStake, commissionEnabled, commissionValue) {
  if (!betfairLay || !bookieBack || !backStake) return null;

  const denominator = commissionEnabled ? betfairLay - commissionValue : betfairLay;
  if (denominator <= 0) return null;

  return (backStake * bookieBack) / denominator;
}

function calculateNonPromoLossWinPercent(betfairLay, bookieBack, backStake, commissionEnabled, commissionValue) {
  if (!betfairLay || !bookieBack) return null;

  const layStake = calculateLayStakeNonPromo(
    betfairLay,
    bookieBack,
    backStake,
    commissionEnabled,
    commissionValue
  );
  if (layStake == null) return null;

  const backProfit = backStake * (bookieBack - 1);
  const layLoss = layStake * (betfairLay - 1);
  const outcome = backProfit - layLoss;

  return (outcome / backStake) * 100;
}

export { calculateLayStakeNonPromo, calculateNonPromoLossWinPercent };

