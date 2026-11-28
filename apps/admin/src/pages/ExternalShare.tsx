import { channelCaption, leaderboard, missingEssays, type ExternalTestDetail } from "@onatili/shared";
import { useMutation } from "@tanstack/react-query";
import { Copy, FileSpreadsheet, ImageDown } from "lucide-react";
import { useEffect, useState } from "react";
import { Modal, Segmented, Spinner } from "../components/ui";
import { errMsg } from "../lib/api";
import { downloadAuthed } from "../lib/download";
import { fmtDate } from "../lib/format";
import { leaderboardImage, resultCardImage, saveImage, slug } from "../lib/result-image";
import { useToast } from "../lib/toast";

type Limit = "10" | "20" | "all";
type Row = ExternalTestDetail["rows"][number];

/** Natijalarni tashqariga berish: Excel (hamma natija) va kanal uchun rasm + tayyor matn */
export function ResultsShareModal({ t, onClose }: { t: ExternalTestDetail; onClose: () => void }) {
  const toast = useToast();
  const [limit, setLimit] = useState<Limit>("10");
  const [short, setShort] = useState(true);
  const [img, setImg] = useState<{ canvas: HTMLCanvasElement; url: string } | null>(null);
  const opts = { limit: limit === "all" ? null : Number(limit), short };
  const caption = channelCaption(t, opts);
  useEffect(() => {
    let live = true;
    const sub = [t.takenAt ? fmtDate(t.takenAt) : null, `${t.participants} qatnashchi`].filter(Boolean).join(" · ");
    leaderboardImage(t, leaderboard(t, { limit: limit === "all" ? null : Number(limit), short }), sub).then(
      (canvas) => live && setImg({ canvas, url: canvas.toDataURL("image/png") }),
      (e) => toast(errMsg(e), "error"),
    );
    return () => {
      live = false;
    };
  }, [t, limit, short, toast]);
  const fail = (e: unknown) => toast(errMsg(e), "error");
  const excel = useMutation({ mutationFn: () => downloadAuthed(`/admin/external-tests/${t.id}/results.xlsx`, "natijalar.xlsx"), onError: fail });
  const save = useMutation({ mutationFn: async () => img && saveImage(img.canvas, `${slug(t.title)}-natijalar.png`), onError: fail });
  const copy = () =>
    navigator.clipboard.writeText(caption).then(
      () => toast("Matn nusxalandi"),
      () => toast("Nusxalab bo'lmadi: matnni qo'lda belgilang", "error"),
    );
  return (
    <Modal wide title="Natijalarni yuklab olish" onClose={onClose}>
      <div className="space-y-5 text-sm">
        <section className="space-y-2">
          <h3 className="font-extrabold">Barcha natijalar</h3>
          <p className="text-ink-3">Excel: har bir o'quvchi, ballari va bo'limlari. Chop etish yoki botda yo'q o'quvchilarga berish uchun.</p>
          <button className="btn-secondary" disabled={excel.isPending} onClick={() => excel.mutate()}>
            <FileSpreadsheet size={15} /> Excel yuklab olish
          </button>
        </section>
        <section className="space-y-3 border-t border-line pt-4">
          <h3 className="font-extrabold">Kanal uchun</h3>
          {missingEssays(t) > 0 && (
            <p className="rounded-lg bg-amber-50 p-3 font-semibold text-amber-800">
              {missingEssays(t)} ta o'quvchining essesi kiritilmagan: ularning bali faqat testdan, essesi borlar bilan teng solishtirib bo'lmaydi. Kanalga
              joylashdan oldin «Esse ballari»ni to'ldiring.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              value={limit}
              onChange={setLimit}
              options={[
                ["10", "Top 10"],
                ["20", "Top 20"],
                ["all", "Hammasi"],
              ]}
            />
            <label className="flex items-center gap-2 font-semibold">
              <input type="checkbox" checked={short} onChange={(e) => setShort(e.target.checked)} />
              Familiyadan keyin faqat bosh harf
            </label>
          </div>
          <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-line bg-surface-2">
            {img ? <img src={img.url} alt="Natijalar rasmi" className="block w-full" /> : <Spinner className="m-6 text-ink-4" />}
          </div>
          <button className="btn-primary" disabled={!img || save.isPending} onClick={() => save.mutate()}>
            <ImageDown size={15} /> Rasmni yuklab olish
          </button>
          <textarea className="input min-h-[11rem] text-[16px] sm:text-sm" readOnly value={caption} />
          <button className="btn-secondary" onClick={copy}>
            <Copy size={15} /> Matnni nusxalash
          </button>
          <p className="text-xs text-ink-3">Rasmni kanalga joylab, matnni izoh qilib qo'ying. Botda yo'q o'quvchiga: ro'yxatdagi qatorida «Rasm» tugmasi.</p>
        </section>
      </div>
    </Modal>
  );
}

/** Bitta o'quvchining natija kartasi rasm bo'lib (botda yo'q o'quvchiga yuborish uchun) */
export function CardImageButton({ t, row, className = "", label = "Rasm" }: { t: ExternalTestDetail; row: Row; className?: string; label?: string }) {
  const toast = useToast();
  const m = useMutation({
    mutationFn: async () => saveImage(await resultCardImage(t, row), `${slug(row.student?.name ?? row.name)}-natija.png`),
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <button className={className} disabled={m.isPending} onClick={() => m.mutate()} title="Natija kartasi rasm bo'lib" aria-label="Natija rasmi">
      <ImageDown size={14} />
      <span className={label === "Rasm" ? "sm:hidden" : ""}>{label}</span>
    </button>
  );
}
