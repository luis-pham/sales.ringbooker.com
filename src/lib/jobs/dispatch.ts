import { handleAutoCreateDemo } from "@/lib/jobs/handlers/auto-demo";
import { handleAutoSearchQueue } from "@/lib/jobs/handlers/auto-search-queue";
import { handleEnrichLead } from "@/lib/jobs/handlers/enrich";
import { handleEnrichInstagram } from "@/lib/jobs/handlers/instagram";
import { handleInstagramBatch, handleInstagramBatchQueue } from "@/lib/jobs/handlers/instagram-batch";
import { handleScoreLead } from "@/lib/jobs/handlers/score";
import { handleSearchRun } from "@/lib/jobs/handlers/search";
import type { Job } from "@/types";

export async function dispatchJob(job: Job) {
  switch (job.type) {
    case "search_run":
      await handleSearchRun(job.payload as { searchRunId: string });
      return;
    case "enrich_lead":
      await handleEnrichLead(job.payload as { leadId: string });
      return;
    case "enrich_instagram":
      await handleEnrichInstagram(job.payload as { leadId: string; instagramHandle: string });
      return;
    case "instagram_batch":
      await handleInstagramBatch(job.payload as { leads: { leadId: string; handle: string }[] });
      return;
    case "instagram_batch_queue":
      await handleInstagramBatchQueue();
      return;
    case "score_lead":
      await handleScoreLead(job.payload as { leadId: string });
      return;
    case "auto_create_demo":
      await handleAutoCreateDemo(job.payload as { leadId: string; createdBy?: string | null });
      return;
    case "auto_search_queue":
      await handleAutoSearchQueue();
      return;
    case "score_batch":
    case "cleanup":
      return;
  }
}
