import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/how-it-works", "/features", "/industries", "/legal"],
        disallow: ["/portal/", "/admin/", "/api/"],
      },
    ],
    sitemap: "https://dashboard.kindstone-eaab21b4.eastus2.azurecontainerapps.io/sitemap.xml",
  };
}
