import { ESSAY_MAX_SCORE, essayTo75, formatScore, type ExternalTestDetail } from "@onatili/shared";
import { useMutation } from "@tanstack/react-query";
import { FileUp } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Modal, Spinner } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { useToast } from "../lib/toast";
import { norm } from "./ExternalMilliy";

/**
 * Kiritilgan qiymat → 24 ballik baho. 75 ballik shkalada 0 dan keyingi eng kichik qiymat 28,
 * shuning uchun 24 dan kattasi 75 lik deb olinadi (62 → 17,5). Xato bo'lsa NaN.
 */
function to24(s: string): number | null {
  if (s.trim() === "") return null;
  const x = Number(s.replace(",", "."));
  const v = x <= ESSAY_MAX_SCORE ? x : x >= 28 && x <= 75 ? (x - 27) / 2 : NaN;
  return Number.isFinite(v) && v >= 0 && Math.round(v * 2) === v * 2 ? v : NaN;
}

type FileResult = Awaited<ReturnType<typeof api.externalEssayFile>>;

/** Yozma ish ballari: fayldan (Excel/CSV), ro'yxatni joylab yoki har o'quvchiga qo'lda */
export function EssayModal({ t, onClose, onDone }: { t: ExternalTestDetail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(t.rows.map((r) => [r.id, r.essayScore != null ? formatScore(r.essayScore) : ""])));
  const [paste, setPaste] = useState("");
  const [fromFile, setFromFile] = useState<FileResult | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const byName = useMemo(() => new Map(t.rows.flatMap((r) => [[norm(r.name), r.id], ...(r.student ? [[norm(r.student.name), r.id] as const] : [])])), [t.rows]);
  const bad = t.rows.filter((r) => Number.isNaN(to24(v[r.id] ?? "")));
  const changed = t.rows.filter((r) => to24(v[r.id] ?? "") !== r.essayScore);
  const save = useMutation({
    mutationFn: () => api.externalEssays(t.id, changed.map((r) => ({ resultId: r.id, score: to24(v[r.id] ?? "") }))),
    onSuccess: (r) => (toast(`Saqlandi: ${r.updated} ta`), onDone(), onClose()),
    onError: (e) => toast(errMsg(e), "error"),
  });
  const upload = useMutation({
    mutationFn: async (f: File) => {
      const bytes = new Uint8Array(await f.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return api.externalEssayFile(t.id, { fileName: f.name, base64: btoa(bin) });
    },
    onSuccess: (r) => {
      setFromFile(r);
      setV((p) => ({ ...p, ...Object.fromEntries(r.items.map((i) => [i.resultId, formatScore(i.score24)])) }));
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const applyPaste = () => {
    let ok = 0;
    const miss: string[] = [];
    for (const l of paste.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) {
      const m = /^(.*?)[\s;,\t]+(\d+(?:[.,]\d)?)$/.exec(l);
      const id = m && byName.get(norm(m[1]));
      if (m && id) (ok++, setV((p) => ({ ...p, [id]: m[2] })));
      else miss.push(m?.[1] ?? l);
    }
    toast(miss.length ? `${ok} ta qo'yildi, topilmadi: ${miss.slice(0, 3).join(", ")}${miss.length > 3 ? "…" : ""}` : `${ok} ta qo'yildi`, miss.length ? "error" : undefined);
  };
  const fileIds = new Set(fromFile?.items.map((i) => i.resultId));
  return (
    <Modal
      wide
      title="Yozma ish (esse) ballari"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Bekor qilish</button>
          <button className="btn-primary" disabled={!changed.length || bad.length > 0 || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Spinner />} Saqlash{changed.length ? ` (${changed.length})` : ""}
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-ink-3">
        Ball 24 ballik mezonda (17,5) yoki 75 ballik shkalada (62) yozilishi mumkin: 24 dan kattasi 75 lik deb olinadi. Umumiy ball = (test + yozma) / 2.
      </p>
      <input ref={input} type="file" accept=".xlsx,.csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
      <button className="btn-secondary mb-3 h-auto min-h-11 w-full whitespace-normal py-2 text-center" disabled={upload.isPending} onClick={() => input.current?.click()}>
        {upload.isPending ? <Spinner /> : <FileUp size={16} />} Fayldan yuklash (Excel yoki CSV: ism va ball ustunlari)
      </button>
      {fromFile && (
        <div className="mb-3 rounded-lg bg-surface-2 p-3 text-sm">
          <p>
            <b className="text-emerald-700">{fromFile.items.length} ta o'quvchiga ball qo'yildi</b> (pastda yashil). Tekshirib, «Saqlash»ni bosing.
          </p>
          {fromFile.missing > 0 && <p className="text-amber-700">Testdagi {fromFile.missing} ta o'quvchining bahosi faylda topilmadi: qo'lda yozing yoki bo'sh qoldiring.</p>}
          {fromFile.bad.length > 0 && <p className="text-red-700">Ball noto'g'ri: {fromFile.bad.join(", ")}</p>}
          {fromFile.unmatched.length > 0 && (
            <details className="mt-1 text-ink-3">
              <summary className="cursor-pointer">Faylda bor, bu testda yo'q: {fromFile.unmatched.length} ta (boshqa guruh yoki ism boshqacha yozilgan)</summary>
              <p className="mt-1 text-xs">{fromFile.unmatched.join(", ")}</p>
            </details>
          )}
        </div>
      )}
      <details className="mb-3 rounded-lg border border-line p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Ro'yxatni joylash</summary>
        <textarea className="input mt-2 h-28" aria-label="Esse ballari ro'yxati" placeholder={"Har qatorda ism va ball:\nAliyev Vali 17,5\nKarimova Aziza 62"} value={paste} onChange={(e) => setPaste(e.target.value)} />
        <button className="btn-secondary btn-sm mt-2" disabled={!paste.trim()} onClick={applyPaste}>Ismlar bo'yicha qo'yish</button>
      </details>
      <ul className="max-h-[45vh] divide-y divide-line overflow-y-auto rounded-lg border border-line text-sm">
        {t.rows.map((r) => {
          const x = to24(v[r.id] ?? "");
          const wrong = Number.isNaN(x);
          return (
            <li key={r.id} className={`flex items-center gap-3 px-3 py-1.5 ${fileIds.has(r.id) ? "bg-emerald-50" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className="break-words sm:truncate">{r.student?.name ?? r.name}</p>
                {x != null && !wrong && <p className="text-xs text-ink-3 sm:hidden">{`${formatScore(x)}/24 → ${essayTo75(x)}`}</p>}
              </div>
              <span className="hidden w-24 text-right text-xs text-ink-3 sm:block">{x != null && !wrong ? `${formatScore(x)}/24 → ${essayTo75(x)}` : ""}</span>
              <input
                className={`input h-10 w-20 shrink-0 text-right sm:h-8 ${wrong ? "border-red-500" : ""}`}
                inputMode="decimal"
                aria-label={`${r.name}: esse bali`}
                value={v[r.id] ?? ""}
                onChange={(e) => setV((p) => ({ ...p, [r.id]: e.target.value }))}
              />
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
