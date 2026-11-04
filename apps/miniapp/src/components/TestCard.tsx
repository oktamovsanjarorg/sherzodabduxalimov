import type { TestSummary } from "@onatili/shared";
import { useMutation } from "@tanstack/react-query";
import { ChevronRight, ClipboardCheck, ListChecks, Loader2, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { formatDuration } from "../lib/hooks";
import { haptic } from "../lib/telegram";

export function TestCard({ test }: { test: TestSummary }) {
  const navigate = useNavigate();
  const start = useMutation({
    mutationFn: () =>
      test.inProgressAttemptId ? Promise.resolve({ id: test.inProgressAttemptId }) : api.startTest(test.id),
    onSuccess: (a) => navigate(`/attempt/${a.id}`),
    onError: (e) => {
      if (e instanceof ApiError && e.code === "SUBSCRIPTION_REQUIRED") navigate("/subscribe");
    },
  });

  const Icon = test.type === "MOCK" ? ClipboardCheck : ListChecks;
  const meta = [`${test.questionCount} ta savol`, formatDuration(test.timeLimitSec)].filter(Boolean).join(" · ");

  return (
    <button
      disabled={start.isPending}
      onClick={() => {
        haptic();
        if (test.locked) navigate("/subscribe");
        else start.mutate();
      }}
      className="card tap flex w-full items-center gap-3 text-left"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
        <Icon size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{test.title}</span>
        <span className="block text-xs text-hint">
          {meta}
          {test.inProgressAttemptId && <span className="font-semibold text-brand"> · davom ettirish</span>}
          {test.isDraft && <span className="font-semibold text-danger"> · qoralama (faqat siz ko'rasiz)</span>}
        </span>
      </span>
      {start.isPending ? (
        <Loader2 size={18} className="animate-spin text-hint" />
      ) : test.locked ? (
        <Lock size={18} className="text-hint" />
      ) : test.bestPercent !== null ? (
        <ScoreBadge percent={test.bestPercent} />
      ) : (
        <ChevronRight size={18} className="text-hint" />
      )}
    </button>
  );
}

export function ScoreBadge({ percent }: { percent: number }) {
  const tone = percent >= 80 ? "bg-success/15 text-success" : percent >= 50 ? "bg-brand-soft text-brand" : "bg-danger/15 text-danger";
  return <span className={`rounded-full px-2 py-1 text-xs font-extrabold ${tone}`}>{percent}%</span>;
}
