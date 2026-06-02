import { createAdminClient } from "@/lib/supabase/admin";

export type EvidenceType =
  | "dm_screenshot"
  | "reply_screenshot"
  | "demo_shared_screenshot"
  | "demo_viewed_confirm"
  | "converted_proof"
  | "other";

export async function uploadEvidence(input: {
  leadId: string;
  eventId: string;
  type: EvidenceType;
  file: File;
  notes?: string;
  uploadedBy: string;
}) {
  const adminClient = createAdminClient();
  if (input.file.size > 10 * 1024 * 1024) throw new Error("File too large (max 10MB)");
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(input.file.type)) {
    throw new Error("Only images allowed");
  }

  const ext = input.file.type.split("/")[1] ?? "bin";
  const storagePath = `${input.uploadedBy}/${input.leadId}/${Date.now()}-${input.type}.${ext}`;
  const { error: uploadError } = await adminClient.storage
    .from("evidence")
    .upload(storagePath, await input.file.arrayBuffer(), { contentType: input.file.type });
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const { data, error } = await adminClient
    .from("outreach_evidence")
    .insert({
      event_id: input.eventId,
      lead_id: input.leadId,
      type: input.type,
      storage_path: storagePath,
      file_name: input.file.name,
      file_size: input.file.size,
      mime_type: input.file.type,
      uploaded_by: input.uploadedBy,
      notes: input.notes ?? null,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) throw new Error(`Evidence insert failed: ${error?.message ?? "unknown"}`);
  return { evidenceId: data.id, storagePath };
}
