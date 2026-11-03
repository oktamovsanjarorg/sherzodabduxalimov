import type { AdminVideo } from "@onatili/shared";

export function toAdminVideo(
  v: { id: string; status: AdminVideo["status"]; originalName: string; sizeBytes: bigint; receivedBytes: bigint; durationSec: number | null; error: string | null; processingPct: number | null } | null,
): AdminVideo | null {
  if (!v) return null;
  return {
    id: v.id,
    status: v.status,
    originalName: v.originalName,
    sizeBytes: Number(v.sizeBytes),
    receivedBytes: Number(v.receivedBytes),
    durationSec: v.durationSec,
    error: v.error,
    processingPct: v.processingPct,
  };
}
