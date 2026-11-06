import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, ClipboardList, FileQuestion, FileText, FolderOpen, GraduationCap, Layers, RotateCcw, Trash2, Users } from "lucide-react";
import { ConfirmButton, Empty, PageHeader, Spinner } from "../components/ui";
import { api, errMsg, type TrashRow } from "../lib/api";
import { fmtShortDateTime } from "../lib/format";
import { useToast } from "../lib/toast";

const KIND: Record<string, { label: string; Icon: typeof Users; open?: (id: string) => string }> = {
  STUDENT: { label: "O'quvchi", Icon: GraduationCap },
  LESSON: { label: "Dars", Icon: BookOpen },
  QUESTION: { label: "Savol", Icon: FileQuestion },
  TEST: { label: "Test", Icon: ClipboardList },
  TOPIC: { label: "Mavzu", Icon: Layers },
  COURSE: { label: "Kurs", Icon: FolderOpen },
  GROUP: { label: "Guruh", Icon: Users },
  PASSAGE: { label: "Matn", Icon: FileText },
};
const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));

/** Korzinka: o'chirilgan narsalar 30 kun saqlanadi va bir bosishda joyiga tiklanadi */
export function TrashPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["trash"], queryFn: api.trash });
  const refreshAll = () => qc.invalidateQueries();
  const restore = useMutation({
    mutationFn: (r: TrashRow) => api.restoreTrash(r.id),
    onSuccess: (_d, r) => {
      toast(`${KIND[r.kind]?.label ?? "Yozuv"} tiklandi: ${r.title}`);
      refreshAll();
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const purge = useMutation({
    mutationFn: (r: TrashRow) => api.purgeTrash(r.id),
    onSuccess: () => {
      toast("Butunlay o'chirildi");
      qc.invalidateQueries({ queryKey: ["trash"] });
    },
    onError: (e) => toast(errMsg(e), "error"),
  });

  return (
    <>
      <PageHeader
        title="Korzinka"
        subtitle="O'chirilgan o'quvchilar, darslar, savollar, testlar va guruhlar 30 kun shu yerda turadi. «Tiklash» — barcha ma'lumotlari bilan (natijalar, davomat, to'lovlar, video) joyiga qaytadi. 30 kundan keyin o'zi butunlay o'chadi."
      />
      {list.isPending && <Spinner className="text-slate-400" />}
      {list.isError && <p className="text-sm text-red-600">{errMsg(list.error)}</p>}
      {list.data?.length === 0 && <Empty title="Korzinka bo'sh" hint="O'chirilgan narsalar shu yerga tushadi." />}
      {!!list.data?.length && (
        <div className="card divide-y divide-slate-100">
          {list.data.map((r) => {
            const k = KIND[r.kind] ?? { label: r.kind, Icon: Trash2 };
            const left = daysLeft(r.purgeAt);
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                  <k.Icon size={17} />
                </span>
                <div className="min-w-0 flex-1 basis-56">
                  <p className="truncate font-semibold">{r.title}</p>
                  <p className="text-xs text-slate-500">
                    {k.label} · o'chirildi {fmtShortDateTime(r.createdAt)}
                    {r.deletedBy ? ` · ${r.deletedBy}` : ""} · {r.rows} ta yozuv bilan ·{" "}
                    <span className={left <= 3 ? "font-bold text-red-600" : ""}>{left} kundan keyin butunlay o'chadi</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button className="btn-primary btn-sm" disabled={restore.isPending} onClick={() => restore.mutate(r)}>
                    <RotateCcw size={14} /> Tiklash
                  </button>
                  <ConfirmButton label="Qaytarib bo'lmaydi. O'chirilsinmi?" className="btn-ghost btn-sm text-red-600" onConfirm={() => purge.mutate(r)}>
                    <Trash2 size={14} /> Butunlay
                  </ConfirmButton>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
