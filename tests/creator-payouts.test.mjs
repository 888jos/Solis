import assert from "node:assert/strict";
import test from "node:test";
import { campaignProgress, calculateVideoPayout, median, monthlyPayoutDecision, payoutState } from "../server/backend/creator-payouts.ts";

test("CPM payout caps at the configured amount", () => {
  assert.deepEqual(calculateVideoPayout({ type: "cpm", cpm: 5, maxPayoutPerVideo: 500 }, 150_000), {
    baseFee: 0, capApplied: true, cpmComponent: 750, finalAmount: 500, rawAmount: 750,
  });
});

test("hybrid payout combines base fee and CPM before applying cap", () => {
  assert.equal(calculateVideoPayout({ type: "hybrid", baseFeePerVideo: 100, cpm: 2, maxPayoutPerVideo: 500 }, 50_000).finalAmount, 200);
});

test("fixed video and monthly threshold states are deterministic", () => {
  assert.equal(calculateVideoPayout({ type: "fixed_per_video", baseFeePerVideo: 233 }, 0).finalAmount, 233);
  assert.equal(monthlyPayoutDecision(49.99, 50), "rollover");
  assert.equal(monthlyPayoutDecision(50, 50), "due");
  assert.equal(payoutState(Date.now() - 1), "locked");
  assert.equal(payoutState(Date.now() + 10_000), "estimated");
});

test("median and campaign progress avoid misleading averages", () => {
  assert.equal(median([1, 2, 100, 200]), 51);
  assert.equal(campaignProgress(10, 1, "2026-09-01", "2026-09-30", Date.parse("2026-09-25")), "behind");
});
