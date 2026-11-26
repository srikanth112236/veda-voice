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
    buildHeadline: (name) => `${name}: After-hours intake with locked Turn-1 TCPA disclosure`,
    buildMetric: (lat) => `${lat}ms P50`,
  },
  {
    kind: "SCENARIO",
    buildHeadline: (name) => `${name}: BVC noise filter isolates caller from road & TV bleed`,
    buildMetric: (lat) => `${Math.max(710, lat - 40)}ms P50`,
  },
  {
    kind: "EARLY-BIRD OFFER",
    buildHeadline: (name) => `Founder Offer for ${name}: 500 included minutes + SIP setup`,
    buildMetric: () => "Limited Cohort",
  },
  {
    kind: "SCENARIO",
    buildHeadline: (name) => `${name}: Bilingual EN/ES code-switching via Deepgram Nova-3`,
    buildMetric: () => "Multi-Lang STT",
  },
  {
    kind: "BENCHMARK",
    buildHeadline: (name) => `${name}: Semantic turn detection prevents mid-sentence splits`,
    buildMetric: () => "0.6s EOU",
  },
  {
    kind: "SCENARIO",
    buildHeadline: (name) => `${name}: Double-booking guard checks live Google Calendar slots`,
    buildMetric: () => "Calendar Lock",
  },
  {
    kind: "EARLY-BIRD OFFER",
    buildHeadline: (name) => `Early-Bird ${name} Pack: Pre-configured FAQs & safety script`,
    buildMetric: () => "Day-1 Ready",
  },
  {
    kind: "BENCHMARK",
    buildHeadline: (name) => `${name}: Wrong-number guardrail exits politely in 2 turns`,
    buildMetric: () => "2-Turn Exit",
  },
  {
    kind: "SCENARIO",
    buildHeadline: (name) => `${name}: Live supervisor whisper coaching & warm SIP transfer`,
    buildMetric: (_lat, idx) => `QA Rubric #${(idx % 5) + 1}`,
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
