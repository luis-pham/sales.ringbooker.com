import type { PlatformHit } from "@/types";

type PlatformConfig = {
  tier: "A" | "B" | "C";
  urlPatterns: string[];
  scriptPatterns: string[];
};

const PLATFORMS: Record<string, PlatformConfig> = {
  square: {
    tier: "A",
    urlPatterns: ["square.site", "squareup.com/appointments", "book.squareup.com"],
    scriptPatterns: ["js.squareup.com", "js.squareupsandbox.com"],
  },
  vagaro: {
    tier: "A",
    urlPatterns: ["vagaro.com"],
    scriptPatterns: ["vagaro.com/api", "vagaro.com/widget"],
  },
  mindbody: {
    tier: "A",
    urlPatterns: ["mindbodyonline.com", "widgets.mindbodyonline.com"],
    scriptPatterns: ["mindbodyonline.com"],
  },
  acuity: {
    tier: "A",
    urlPatterns: ["acuityscheduling.com"],
    scriptPatterns: ["acuityscheduling.com"],
  },
  glossgenius: {
    tier: "B",
    urlPatterns: ["glossgenius.com"],
    scriptPatterns: [],
  },
  booksy: {
    tier: "B",
    urlPatterns: ["booksy.com"],
    scriptPatterns: ["booksy.com"],
  },
  fresha: {
    tier: "B",
    urlPatterns: ["fresha.com"],
    scriptPatterns: ["fresha.com"],
  },
  boulevard: {
    tier: "B",
    urlPatterns: ["boulevard.app", "joinblvd.com"],
    scriptPatterns: [],
  },
  styleseat: {
    tier: "B",
    urlPatterns: ["styleseat.com"],
    scriptPatterns: [],
  },
  schedulicity: {
    tier: "B",
    urlPatterns: ["schedulicity.com"],
    scriptPatterns: ["schedulicity.com"],
  },
};

export function detectPlatforms(html: string, links: string[], scriptSrcs: string[]): PlatformHit[] {
  const hits: PlatformHit[] = [];
  const allText = [html, ...links, ...scriptSrcs].join(" ").toLowerCase();

  for (const [platform, config] of Object.entries(PLATFORMS)) {
    let confidence = 0;
    let evidence = "";

    for (const pattern of config.urlPatterns) {
      const found = links.find((link) => link.toLowerCase().includes(pattern));
      if (found) {
        confidence = Math.max(confidence, 0.95);
        evidence = `link: ${found.slice(0, 100)}`;
        break;
      }
    }

    for (const pattern of config.scriptPatterns) {
      const found = scriptSrcs.find((src) => src.toLowerCase().includes(pattern));
      if (found) {
        confidence = Math.max(confidence, 0.9);
        evidence ||= `script: ${found.slice(0, 100)}`;
        break;
      }
    }

    if (confidence === 0) {
      for (const pattern of config.urlPatterns) {
        if (allText.includes(pattern)) {
          confidence = 0.75;
          evidence = `html_mention: ${pattern}`;
          break;
        }
      }
    }

    if (confidence > 0) hits.push({ platform, confidence, evidence, tier: config.tier });
  }

  return hits.sort((a, b) => b.confidence - a.confidence);
}

export function detectPlatformFromUrl(url: string): string | null {
  const lower = url.toLowerCase();
  for (const [platform, config] of Object.entries(PLATFORMS)) {
    if (config.urlPatterns.some((pattern) => lower.includes(pattern))) return platform;
  }
  return null;
}

export function getPlatformTier(platform: string | null): "A" | "B" | "C" {
  if (!platform) return "C";
  return PLATFORMS[platform]?.tier ?? "C";
}
