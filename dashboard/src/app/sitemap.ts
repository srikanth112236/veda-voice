import type { MetadataRoute } from "next";

const BASE = "https://dashboard.kindstone-eaab21b4.eastus2.azurecontainerapps.io";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "",
    "/how-it-works",
    "/features",
    "/industries",
    "/legal",
    "/legal/privacy",
    "/legal/telephony-compliance",
    "/legal/terms",
    "/legal/dpa",
    "/legal/security",
    "/onboarding",
  ];
  const now = new Date();
  return routes.map((route) => ({
    url: `${BASE}${route}`,
    lastModified: now,
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1.0 : 0.8,
  }));
}
