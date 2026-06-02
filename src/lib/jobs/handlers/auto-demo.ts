import { createDemo } from "@/lib/demo/demo-service";

export type AutoCreateDemoPayload = {
  leadId: string;
  createdBy?: string | null;
};

export async function handleAutoCreateDemo(payload: AutoCreateDemoPayload) {
  await createDemo(payload.leadId, payload.createdBy ?? null);
}
