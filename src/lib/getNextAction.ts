import type { PipelineLead, NextAction } from "@/types";

function daysSince(iso: string | null | undefined): number {
  if (!iso) return 9999;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

export function getNextAction(lead: PipelineLead): NextAction {
  const { stage, demo, updatedAt } = lead;

  switch (stage) {
    case "ready":
      return {
        urgency: "ok",
        icon: "Send",
        title: "Send DM + demo link",
        desc: "Reach out on their platform with a personalized message.",
        due: "Today",
      };

    case "sent": {
      const days = daysSince(updatedAt);
      if (days < 2) {
        return {
          urgency: "ok",
          icon: "Clock",
          title: "Waiting for view",
          desc: "DM sent — give it 48 h before following up.",
          due: "In 2 days",
        };
      }
      return {
        urgency: "soon",
        icon: "RefreshCw",
        title: "Follow up — not viewed yet",
        desc: "It's been 2+ days. Send a gentle nudge.",
        due: "Today",
      };
    }

    case "viewed":
      return {
        urgency: "urgent",
        icon: "Zap",
        title: "Follow up now — demo viewed",
        desc: "They watched your demo. Strike while it's fresh.",
        due: "Within 24 h",
      };

    case "hot":
      return {
        urgency: "urgent",
        icon: "Flame",
        title: "Priority follow up — highly engaged",
        desc: `${demo?.plays ?? 2}+ plays or ${demo?.pct ?? 80}%+ watched. They're very interested.`,
        due: "Today",
      };

    case "replied":
      return {
        urgency: "urgent",
        icon: "MessageCircle",
        title: "Reply + send pricing",
        desc: "They replied — respond fast and send the pricing sheet.",
        due: "ASAP",
      };

    case "signedup":
      return {
        urgency: "ok",
        icon: "BookOpen",
        title: "Send welcome + setup guide",
        desc: "They signed up. Send the onboarding welcome email.",
        due: "Today",
      };

    case "onboarding":
      return {
        urgency: "soon",
        icon: "Settings",
        title: "Nudge to complete setup",
        desc: "Check in and help them finish configuring their account.",
        due: "This week",
      };

    case "trial": {
      const days = daysSince(updatedAt);
      return {
        urgency: "soon",
        icon: "Activity",
        title: "Trial check-in (day 3)",
        desc: days < 3 ? "Trial started — check in at day 3." : "Check in on trial progress and offer help.",
        due: days < 3 ? `Day 3 (${Math.max(0, Math.round(3 - days))} days)` : "Today",
      };
    }

    case "converted":
      return {
        urgency: "ok",
        icon: "CheckCircle",
        title: "Monitor — check in at 30 days",
        desc: "They're a customer. Schedule a 30-day health check.",
        due: "30 days",
      };

    case "ghosted": {
      const days = daysSince(updatedAt);
      return {
        urgency: "soon",
        icon: "Ghost",
        title: "Re-engage after 30 days",
        desc: days >= 30 ? "It's been 30+ days. Try a fresh angle." : `${Math.round(30 - days)} days until re-engage window.`,
        due: days >= 30 ? "Today" : `In ${Math.round(30 - days)} days`,
      };
    }

    case "churned": {
      const days = daysSince(updatedAt);
      return {
        urgency: "soon",
        icon: "RotateCcw",
        title: "Win-back after 60 days",
        desc: days >= 60 ? "60+ days. Reach out with a win-back offer." : `${Math.round(60 - days)} days until win-back window.`,
        due: days >= 60 ? "Today" : `In ${Math.round(60 - days)} days`,
      };
    }
  }
}
