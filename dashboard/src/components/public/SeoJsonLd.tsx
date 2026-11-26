import React from "react";

export function SeoJsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "VedaVoice",
        url: "https://dashboard.kindstone-eaab21b4.eastus2.azurecontainerapps.io",
        description:
          "24/7 AI voice receptionist that answers business phone calls, books appointments into Google Calendar, and handles emergency escalations.",
      },
      {
        "@type": "SoftwareApplication",
        name: "VedaVoice AI Receptionist",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        offers: {
          "@type": "AggregateOffer",
          lowPrice: "99",
          highPrice: "1999",
          priceCurrency: "USD",
        },
        description:
          "Autonomous AI phone answering service for plumbing, HVAC, dental, salons, clinics, auto repair, and local service businesses.",
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "What is VedaVoice AI Receptionist?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "VedaVoice is a 24/7 AI phone receptionist that answers incoming customer calls in under a second, filters out background noise, books appointments directly onto your calendar, and transfers urgent calls to your on-call team.",
            },
          },
          {
            "@type": "Question",
            name: "How fast does VedaVoice answer and respond on a live call?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "VedaVoice picks up on the first ring and responds in under one second, using smart pause detection so callers are never cut off mid-sentence.",
            },
          },
          {
            "@type": "Question",
            name: "Can VedaVoice speak both English and Spanish?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Yes. VedaVoice automatically detects and switches between English and Spanish during the same phone call without dropping the conversation.",
            },
          },
          {
            "@type": "Question",
            name: "How does VedaVoice handle call recording laws in the US, UK, Canada, UAE, and India?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "VedaVoice speaks your recording and AI assistant disclosure at the very start of the call before taking caller details, and enforces opt-in consent and calling-window rules for outbound callbacks.",
            },
          },
        ],
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
