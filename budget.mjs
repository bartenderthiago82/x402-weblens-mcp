// Session spend cap: refuses any payment that would push total spend past the budget.
// USDC has 6 decimals, so "$1" = 1_000_000 atomic units.
export function usdToAtomic(usd) {
  const n = Number(String(usd).replace("$", ""));
  if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid USD amount: ${usd}`);
  return BigInt(Math.round(n * 1_000_000));
}

export function makeBudgetPolicy(budgetUsd) {
  const limit = usdToAtomic(budgetUsd);
  const state = { spent: 0n };
  // shortcut: counts a payment when it is signed, so a call that fails after signing still counts (errs on the safe side).
  const policy = (_version, reqs) => {
    const ok = reqs.filter((r) => state.spent + BigInt(r.amount) <= limit);
    if (ok.length) state.spent += BigInt(ok[0].amount);
    return ok;
  };
  return { policy, state, limit };
}
