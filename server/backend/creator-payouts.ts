export type DealInput = {
  type: "cpm" | "fixed_per_video" | "fixed_monthly" | "hybrid";
  cpm?: number | null;
  baseFeePerVideo?: number | null;
  monthlyFixedFee?: number | null;
  maxPayoutPerVideo?: number | null;
  minimumPayout?: number | null;
};

export function calculateVideoPayout(deal: DealInput, eligibleViews: number) {
  const views = Math.max(0, eligibleViews || 0);
  const cpmComponent = ["cpm", "hybrid"].includes(deal.type) ? views / 1000 * Math.max(0, deal.cpm || 0) : 0;
  const baseFee = ["fixed_per_video", "hybrid"].includes(deal.type) ? Math.max(0, deal.baseFeePerVideo || 0) : 0;
  const rawAmount = baseFee + cpmComponent;
  const cap = deal.maxPayoutPerVideo && deal.maxPayoutPerVideo > 0 ? deal.maxPayoutPerVideo : null;
  return {
    baseFee,
    capApplied: cap !== null && rawAmount > cap,
    cpmComponent,
    finalAmount: cap === null ? rawAmount : Math.min(rawAmount, cap),
    rawAmount,
  };
}

export function payoutState(trackingWindowEndsAt: Date | number | null, now = Date.now()) {
  if (!trackingWindowEndsAt) return "estimated" as const;
  return new Date(trackingWindowEndsAt).getTime() <= now ? "locked" as const : "estimated" as const;
}

export function monthlyPayoutDecision(lockedBalance: number, minimumPayout = 50) {
  return lockedBalance >= Math.max(0, minimumPayout) ? "due" as const : "rollover" as const;
}

export function campaignProgress(targetVideos: number, postedVideos: number, startsAt?: string | null, endsAt?: string | null, now = Date.now()) {
  if (!targetVideos || !startsAt || !endsAt) return postedVideos >= targetVideos && targetVideos > 0 ? "ahead" : "on_track";
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "on_track";
  const elapsed = Math.min(1, Math.max(0, (now - start) / (end - start)));
  const expected = targetVideos * elapsed;
  if (postedVideos >= expected + 1) return "ahead";
  if (postedVideos + 1 < expected) return "behind";
  return "on_track";
}

export function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
