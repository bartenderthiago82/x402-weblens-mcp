import { test } from "node:test";
import assert from "node:assert/strict";
import { makeBudgetPolicy, usdToAtomic } from "./budget.mjs";

const req = (amount) => [{ scheme: "exact", network: "eip155:8453", asset: "x", amount, payTo: "y", maxTimeoutSeconds: 60, extra: {} }];

test("usdToAtomic", () => {
  assert.equal(usdToAtomic("$1"), 1_000_000n);
  assert.equal(usdToAtomic("0.002"), 2000n);
  assert.throws(() => usdToAtomic("abc"));
});

test("budget refuses the payment that would pass the limit", () => {
  const b = makeBudgetPolicy("0.025");
  assert.equal(b.policy(2, req("20000")).length, 1); // $0.02
  assert.equal(b.policy(2, req("5000")).length, 1); // $0.005 -> exactly $0.025
  assert.equal(b.policy(2, req("2000")).length, 0); // would be $0.027
  assert.equal(b.state.spent, 25000n);
});
