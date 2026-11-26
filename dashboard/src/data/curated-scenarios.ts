import { INDUSTRY_CONCEPTS } from "./industries";

export type CuratedKind = "BENCHMARK" | "SCENARIO" | "EARLY-BIRD OFFER";

export interface CuratedTickerItem {
  id: string;
  kind: CuratedKind;
  industrySlug: string;
  industryName: string;
  headline: string;
  metric: string;
}

const SCENARIO_TEMPLATES: Array<{
  kind: CuratedKind;
  buildHeadline: (name: string) => string;
  buildMetric: (latencyMs: number, idx: number) => string;
}> = [
  {
    kind: "BENCHMARK",
    buildHeadline: (name) => `${name}: After-hours calls answered on first ring with recording notice`,
    buildMetric: () => "Under 1s Reply",
  },
  {
    kind: "SCENARIO",
    buildHeadline: (name) => `${name}: Smart noise filter keeps street & TV sound out of calls`,
    buildMetric: () => "Crystal Clear",
  },
  {
    kind: "EARLY-BIRD OFFER",
    buildHeadline: (name) => `Founder Offer for ${name}: 500 included minutes + priority setup`,
    buildMetric: () => "Limited Cohort",
  },
  {
    kind: "SCENARIO",
    buildHeadline: (name) => `${name}: Speaks fluent English & Spanish in the same call`,
    buildMetric: () => "Bilingual Ready",
  },
  {
    kind: "BENCHMARK",
    buildHeadline: (name) => `${name}: Patient listening waits for natural caller pauses`,
    buildMetric: () => "Zero Cutoffs",
  },
  {
    kind: "SCENARIO",
    buildHeadline: (name) => `${name}: Checks live Google Calendar openings before confirming`,
    buildMetric: () => "No Double-Book",
  },
  {
    kind: "EARLY-BIRD OFFER",
    buildHeadline: (name) => `Early-Bird ${name} Pack: Pre-loaded FAQs & safety script`,
    buildMetric: () => "Day-1 Ready",
  },
  {
    kind: "BENCHMARK",
    buildHeadline: (name) => `${name}: Ends wrong-number calls politely in two turns`,
    buildMetric: () => "Saves Minutes",
  },
  {
    kind: "SCENARIO",
    buildHeadline: (name) => `${name}: Live supervisor coaching & warm transfer to your team`,
    buildMetric: (_lat, idx) => `Quality Check #${(idx % 5) + 1}`,
  },
];

// 20 industries * 9 templates = 180 distinct curated entries
export const CURATED_SCENARIO_POOL: CuratedTickerItem[] = INDUSTRY_CONCEPTS.flatMap(
  (ind, indIdx) =>
    SCENARIO_TEMPLATES.map((tpl, tplIdx) => ({
      id: `${ind.slug}-${tplIdx + 1}`,
      kind: tpl.kind,
      industrySlug: ind.slug,
      industryName: ind.name,
      headline: tpl.buildHeadline(ind.name),
      metric: tpl.buildMetric(ind.latencyMs, indIdx + tplIdx),
    }))
);
