import type { GoldDetail } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ImageOff, ImagePlus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ConfirmButton, PageHeader, Segmented, Spinner } from "../components/ui";
import { errMsg } from "../lib/api";
import { goldApi } from "../lib/gold-api";
import { useToast } from "../lib/toast";
import { GoldRate } from "./GoldRate";
import { GoldTranscribe } from "./GoldTranscribe";

type Tab = "pages" | "text" | "rate";

/** Bitta sinov essesi: varoqlar → ko'chirish → baholash */
export function GoldEssayPage() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["gold", id], queryFn: () => goldApi.detail(id) });
  const [tab, setTab] = useState<Tab | null>(null);
  // Birinchi ochilganda: hali bajarilmagan birinchi qadam. Keyin o'zi almashmaydi (rasm yuklayotganda sakramasin)
  const first = useRef<Tab | null>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const set = (g: GoldDetail) => {
    qc.setQueryData(["gold", id], g);
    void qc.invalidateQueries({ queryKey: ["gold"], exact: true });
  };
  const remove = useMutation({
    mutationFn: () => goldApi.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["gold"], exact: true });
      navigate("/essays?tab=gold");
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  if (q.isPending) return <Spinner className="text-ink-4" />;
  if (q.isError) return <p className="text-sm text-red-700">{errMsg(q.error)}</p>;
  const g = q.data;
  first.current ??= !g.pages && !g.transcript ? "pages" : !g.transcript ? "text" : "rate";
  const current: Tab = tab ?? first.current;
  return (
    <>
      <Link to="/essays?tab=gold" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-ink-3 hover:text-ink">
        <ArrowLeft size={16} /> Sinov to'plami
      </Link>
      <PageHeader
        title="Sinov essesi"
        subtitle={g.topic}
        actions={
          <ConfirmButton onConfirm={() => remove.mutate()}>
            <Trash2 size={16} /> O'chirish
          </ConfirmButton>
        }
      />
      <Segmented
        className="mb-4"
        value={current}
        onChange={setTab}
        options={
          [
            ["pages", `Varoqlar (${g.pages})`],
            ["text", g.transcript ? `Ko'chirish · ${g.marks.length} xato` : "Ko'chirish"],
            ["rate", g.myRating ? "Baholash ✓" : "Baholash"],
          ] as const
        }
      />
      {current === "pages" && (
        <GoldPages
          g={g}
          onChange={(next) => {
            // Varoq o'chsa tartib raqamlari suriladi: eski rasmlar keshda qolmasin
            qc.removeQueries({ queryKey: ["gold-page", id] });
            set(next);
          }}
        />
      )}
      {current === "text" && <GoldTranscribe g={g} onSaved={set} />}
      {current === "rate" && <GoldRate g={g} onSaved={set} />}
    </>
  );
}

function GoldPages({ g, onChange }: { g: GoldDetail; onChange: (g: GoldDetail) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      let last: GoldDetail | null = null;
      for (const f of Array.from(files)) last = await goldApi.addPage(g.id, f);
      if (last) onChange(last);
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(false);
    }
  };
  const remove = useMutation({ mutationFn: (n: number) => goldApi.removePage(g.id, n), onSuccess: onChange, onError: (e) => toast(errMsg(e), "error") });
  return (
    <div className="space-y-3">
      {!g.fromBot && (
        <label className={`btn-secondary w-full sm:w-auto ${busy ? "pointer-events-none opacity-60" : ""}`}>
          <ImagePlus size={18} /> {busy ? "Yuklanmoqda…" : "Varoq rasmini qo'shish"}
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => void upload(e.target.files)} />
        </label>
      )}
      {!g.pages && (
        <p className="text-sm text-ink-3">
          {g.fromBot ? "Bu esse botda yozib yuborilgan: varoq yo'q, matn o'quvchiniki." : "Varoqlarni tartib bilan yuklang."}
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: g.pages }, (_, n) => (
          <div key={n}>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-bold text-ink-4">{n + 1}-varoq</p>
              {!g.fromBot && (
                <button className="btn-ghost btn-sm text-red-700" onClick={() => remove.mutate(n)} disabled={remove.isPending}>
                  <Trash2 size={14} /> Olib tashlash
                </button>
              )}
            </div>
            <GoldImage id={g.id} n={n} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function GoldImage({ id, n }: { id: string; n: number }) {
  const img = useQuery({ queryKey: ["gold-page", id, n], queryFn: () => goldApi.page(id, n), staleTime: Infinity, gcTime: 10 * 60_000 });
  if (img.isPending)
    return (
      <div className="flex h-48 items-center justify-center rounded-xl bg-surface-3">
        <Spinner className="text-ink-4" />
      </div>
    );
  if (!img.data)
    return (
      <div className="flex h-20 items-center justify-center gap-2 rounded-xl bg-surface-3 text-sm text-ink-3">
        <ImageOff size={16} /> Rasm yuklanmadi
      </div>
    );
  return <img src={img.data} alt={`${n + 1}-varoq`} className="w-full rounded-xl border border-line" />;
}
