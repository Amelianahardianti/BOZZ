export type SlaType = "instant" | "same_day" | "reguler";

// ponytail: keyword heuristic on the shipping carrier/logistics name — real classification
// should come from each platform's logistics-channel metadata once an adapter exposes it.
const INSTANT_KEYWORDS = ["instant", "grabexpress"];
const SAME_DAY_KEYWORDS = ["same day", "sameday", "same_day"];

const SLA_HOURS: Record<SlaType, number> = {
  instant: 3,
  same_day: 6,
  reguler: 48, // ponytail: no SLA number given in SRS for "Reguler" — placeholder, tune with the team
};

export function classifySla(shippingCarrier?: string | null): SlaType {
  const name = (shippingCarrier ?? "").toLowerCase();
  if (INSTANT_KEYWORDS.some((k) => name.includes(k))) return "instant";
  if (SAME_DAY_KEYWORDS.some((k) => name.includes(k))) return "same_day";
  return "reguler";
}

export function computeSlaDeadline(receivedAt: Date, slaType: SlaType): Date {
  return new Date(receivedAt.getTime() + SLA_HOURS[slaType] * 60 * 60 * 1000);
}
