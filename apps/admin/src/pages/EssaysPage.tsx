import type { AdminEssay } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Badge, Empty, Field, Modal, PageHeader, Spinner } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { useToast } from "../lib/toast";

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

export function EssaysPage() {
  const [tab, setTab] = useState<"pending" | "reviewed">("pending");
  const [open, setOpen] = useState<AdminEssay | null>(null);
  const list = useQuery({ queryKey: ["essays", tab], queryFn: () => api.essays(tab), refetchInterval: tab === "pending" ? 30_000 : false });

  return (
    <>
      <PageHeader title="Esselar" subtitle="Mock testlardagi esselar. Ball qo'yilgach, o'quvchiga umumiy natija va daraja bot orqali yuboriladi." />
      <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm font-bold">
        {([["pending", "Tekshirilmagan"], ["reviewed", "Tekshirilgan"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 ${tab === k ? "bg-brand text-white" : "text-slate-600"}`}>
            {l}
          </button>
        ))}
      </div>
      {list.isPending && <Spinner className="text-slate-400" />}
      {list.data?.length === 0 && <Empty title={tab === "pending" ? "Tekshiriladigan esse yo'q" : "Hali esse tekshirilmagan"} />}
      <div className="space-y-2">
        {list.data?.map((e) => (
          <button key={`${e.attemptId}-${e.questionId}`} onClick={() => setOpen(e)} className="card flex w-full items-center gap-3 p-4 text-left transition hover:border-brand">
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{e.student.name}</p>
              <p className="truncate text-xs text-slate-500">
                {e.testTitle} · {e.words} ta so'z · {new Date(e.submittedAt).toLocaleString("uz-UZ")}
              </p>
            </div>
            {e.points !== null ? <Badge tone="green">{fmt(e.points)}/{fmt(e.maxPoints)}</Badge> : <Badge tone="amber">{fmt(e.maxPoints)} ball</Badge>}
            <ChevronRight size={18} className="text-slate-400" />
          </button>
        ))}
      </div>
      {open && <ReviewModal essay={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function ReviewModal({ essay, onClose }: { essay: AdminEssay; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [points, setPoints] = useState(essay.points !== null ? fmt(essay.points) : "");
  const [comment, setComment] = useState(essay.reviewComment ?? "");
  const value = Number(points.replace(",", "."));
  const valid = points.trim() !== "" && Number.isFinite(value) && value >= 0 && value <= essay.maxPoints;

  const save = useMutation({
    mutationFn: () => api.reviewEssay(essay.attemptId, essay.questionId, { points: value, comment: comment.trim() || null }),
    onSuccess: (r) => {
      toast(`Saqlandi · umumiy natija ${fmt(r.score)} ball. O'quvchiga yuborildi`);
      qc.invalidateQueries({ queryKey: ["essays"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (e) => toast(errMsg(e), "error"),
  });

  return (
    <Modal
      title={essay.student.name}
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Yopish</button>
          <button className="btn-primary" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Spinner />} Bahoni saqlash
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <details className="rounded-xl bg-slate-50 p-3 text-sm">
          <summary className="cursor-pointer font-bold text-slate-700">Topshiriq ({essay.testTitle})</summary>
          <p className="mt-2 whitespace-pre-line text-slate-700">{essay.prompt.replace(/\*\*|#\s?/g, "")}</p>
        </details>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="label mb-0">Esse</span>
            <span className="text-xs font-semibold text-slate-500">{essay.words} ta so'z</span>
          </div>
          <div className="max-h-[45vh] overflow-y-auto whitespace-pre-line rounded-xl border border-slate-200 bg-white p-4 text-[15px] leading-relaxed">
            {essay.text}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
          <Field label={`Ball (0 – ${fmt(essay.maxPoints)})`}>
            <input className="input text-lg font-bold" inputMode="decimal" value={points} onChange={(e) => setPoints(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="0" />
            <div className="mt-2 flex flex-wrap gap-1">
              {[0.25, 0.5, 0.75, 1].map((f) => (
                <button key={f} type="button" className="btn-sm btn border border-slate-200 text-slate-600" onClick={() => setPoints(fmt(essay.maxPoints * f))}>
                  {fmt(essay.maxPoints * f)}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Izoh (o'quvchiga yuboriladi)">
            <textarea className="textarea min-h-[110px]" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Kuchli tomonlari, xatolari, tavsiyalar…" />
          </Field>
        </div>
        {points.trim() !== "" && !valid && <p className="text-sm font-semibold text-red-600">Ball 0 dan {fmt(essay.maxPoints)} gacha bo'lishi kerak</p>}
      </div>
    </Modal>
  );
}
