/**
 * Cold-DM templates for Instagram/Facebook outreach to salon owners.
 *
 * Strategy (2-step): a short curiosity opener with NO link (avoids the cold-DM
 * spam trigger), then a reveal + personalized /try link once they reply. Openers
 * and reveals are rotated *stably per lead* (hashed lead id) so every lead keeps
 * one variant — even A/B spread, reproducible, doesn't change on re-open.
 */
import type { PipelineLead } from "@/types";

function salon(lead: PipelineLead): string {
  return lead.name;
}

function demoUrl(lead: PipelineLead): string {
  // lead.demo.slug is the /try/<slug> path stored from the ringbooker demo URL.
  return lead.demo?.slug ? `https://ringbooker.com/${lead.demo.slug}` : "your personalized demo link";
}

/** Lowercased plural business type for "for {type}s like yours" — falls back to "salons". */
function businessTypePlural(lead: PipelineLead): string {
  const t = lead.businessType?.trim().toLowerCase();
  return t ? `${t}s` : "salons";
}

/** City from "City, State"; null when missing/unknown so the opener uses a local fallback. */
function city(lead: PipelineLead): string | null {
  const first = lead.location?.split(",")[0]?.trim();
  if (!first || first.toLowerCase() === "unknown") return null;
  return first;
}

// ── Tin 1: opener — curiosity + permission, NO link. Four distinct angles
// (name-curiosity / category / locality+social-proof / warm) so the A/B tests
// real strategy, not micro-wording. All end with "can I show / share" so the
// reveals below flow naturally. ──────────────────────────────────────────────
const OPENERS: Array<(l: PipelineLead) => string> = [
  // A — pure curiosity (default)
  (l) => `Hey ${salon(l)}! Made something with your salon's name on it 👀 can I show you?`,
  // B — category-specific (signals you know what they do)
  (l) => `Hey ${salon(l)}! Made a quick demo for ${businessTypePlural(l)} like yours 👀 can I show you?`,
  // C — locality + social proof (strongest "I looked at you" signal)
  (l) => {
    const c = city(l);
    return c
      ? `Hey ${salon(l)}! Made a little demo for a few ${c} salons — yours included 👀 can I show?`
      : `Hey ${salon(l)}! Made a little demo for some local salons — yours included 👀 can I show?`;
  },
  // D — warm / direct
  (l) => `Hey ${salon(l)} 🙂 made a quick AI Receptionist demo for your salon — mind if I share it?`,
];

// ── Tin 2: reveal + link — sent after they reply ────────────────────────────
const REVEALS: Array<(l: PipelineLead) => string> = [
  (l) =>
    `It's a 30-sec demo — I set up an AI receptionist under ${salon(l)}'s name so you can hear how it'd answer & book your calls:\n${demoUrl(l)}\nJust tap "Hear your AI now" 🙂`,
  (l) =>
    `Here it is 🙂\nI made a quick AI receptionist demo for ${salon(l)}, so you can hear how it answers calls and helps book appointments:\n${demoUrl(l)}\nJust tap "Hear your AI now"`,
  (l) =>
    `This is what I made 👀\nA quick AI receptionist demo with ${salon(l)}'s name on it:\n${demoUrl(l)}\nTap "Hear your AI now" to listen.`,
];

// ── Follow-ups: contextual (not random) ─────────────────────────────────────
export const FOLLOW_UPS = {
  /** Opened the demo but hasn't replied. */
  openedNoReply: (l: PipelineLead) => `Did it sound natural for ${salon(l)}, or should I tweak the voice/script a bit?`,
  /** Replied but hasn't opened the link yet. */
  notOpened: (l: PipelineLead) => `No rush 🙂 the demo is still here if you want to hear it:\n${demoUrl(l)}`,
  /** Reacted positively — offer to tailor it. */
  positive: (_l: PipelineLead) => `Glad you liked it 🙂 Want me to adjust it to your actual services and opening hours?`,
};

/** Deterministic 32-bit string hash for stable per-lead variant selection. */
function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = (Math.imul(h, 31) + value.charCodeAt(i)) >>> 0;
  }
  return h;
}

function pick<T>(arr: T[], seed: string): T {
  return arr[hashString(seed) % arr.length];
}

/** Tin 1 — opener (no link), rotated stably per lead. */
export function buildOpener(lead: PipelineLead): string {
  return pick(OPENERS, `opener:${lead.id}`)(lead);
}

/** Tin 2 — reveal + personalized demo link, rotated stably per lead. */
export function buildReveal(lead: PipelineLead): string {
  return pick(REVEALS, `reveal:${lead.id}`)(lead);
}

export type DmSequence = {
  opener: string;
  reveal: string;
  followUps: { openedNoReply: string; notOpened: string; positive: string };
};

/** Full randomized sequence for one lead. */
export function buildDmSequence(lead: PipelineLead): DmSequence {
  return {
    opener: buildOpener(lead),
    reveal: buildReveal(lead),
    followUps: {
      openedNoReply: FOLLOW_UPS.openedNoReply(lead),
      notOpened: FOLLOW_UPS.notOpened(lead),
      positive: FOLLOW_UPS.positive(lead),
    },
  };
}
