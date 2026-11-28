import type { GoldDetail, TextMark } from "@onatili/shared";
import { countMarks } from "@onatili/shared";
import { useMutation } from "@tanstack/react-query";
import { PenLine, Save } from "lucide-react";
import { useState } from "react";
import { MarkCounts, TextAnnotator } from "../components/Annotate";
import { errMsg } from "../lib/api";
import { goldApi } from "../lib/gold-api";
import { useToast } from "../lib/toast";
import { GoldImage } from "./GoldEssayPage";

/**
 * Ko'chirish: varoqdagi matn harfma-harf (xatolari bilan), keyin xatolar belgilanadi.
 * Qo'lyozmada AI o'qigan matn tayyor turadi: ustoz qayta yozmaydi, faqat tuzatadi.
 * Belgi matndagi o'ringa bog'langan, shuning uchun matn o'zgarsa belgilar o'chadi.
 */
export function GoldTranscribe({ g, onSaved }: { g: GoldDetail; onSaved: (g: GoldDetail) => void }) {
  const toast = useToast();
  const [text, setText] = useState(g.transcript ?? g.aiText ?? "");
  const fromAi = !g.transcript && !!g.aiText;
  const [marks, setMarks] = useState<TextMark[]>(g.marks);
  const [editing, setEditing] = useState(!g.transcript);
  const save = useMutation({
    mutationFn: (d: { transcript: string; marks: TextMark[] }) => goldApi.saveTranscript(g.id, d),
    onSuccess: (next) => {
      onSaved(next);
      toast("Saqlandi");
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const dirty = text !== (g.transcript ?? "") || JSON.stringify(marks) !== JSON.stringify(g.marks);
  return (
    <div className={`grid grid-cols-1 gap-4 ${g.pages ? "lg:grid-cols-2" : ""}`}>
      {g.pages > 0 && (
        <div className="max-h-[38vh] space-y-3 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:border-0 lg:p-0 lg:shadow-none">
          {Array.from({ length: g.pages }, (_, n) => (
            <GoldImage key={n} id={g.id} n={n} />
          ))}
        </div>
      )}
      <div className="space-y-3">
        {editing ? (
          <>
            {fromAi ? (
              <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
                Matnni AI o'qib qo'ydi, qayta yozmang. Varoqqa qarab faqat AI noto'g'ri o'qigan so'zlarni tuzating. Eng muhimi: AI o'quvchining imlo yoki vergul
                xatosini o'zi «tuzatib» yuborgan joylarni varoqdagidek qaytaring. <code>[?]</code> — AI o'qiy olmagan so'z: o'rniga varoqdagini yozing.
              </p>
            ) : (
              <p className="rounded-lg bg-surface-2 p-3 text-sm text-ink-2">
                Varoqdagi matnni <b>aynan</b> yozing: imlo va tinish belgisi xatolarini tuzatmang. Xatoboshilarni saqlang. O'qib bo'lmaydigan so'z o'rniga{" "}
                <code>[?]</code> qo'ying. O'quvchi o'zi o'chirgan so'zni yozmang.
              </p>
            )}
            <textarea
              className="input min-h-[40vh] font-mono lg:min-h-[50vh] text-[16px] leading-relaxed sm:text-[15px]"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="O'quvchi yozgan matn…"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />
            {marks.length > 0 && text !== (g.transcript ?? "") && (
              <p className="text-sm font-semibold text-amber-800">Matn o'zgardi: saqlasangiz {marks.length} ta belgi o'chadi va qaytadan belgilanadi.</p>
            )}
            <button
              className="btn-primary w-full sm:w-auto"
              disabled={!text.trim() || save.isPending}
              onClick={() => {
                // Matn o'zgargan bo'lsa eski belgilar noto'g'ri joyga tushadi
                const keep = text === (g.transcript ?? "") ? marks : [];
                setMarks(keep);
                save.mutate({ transcript: text, marks: keep }, { onSuccess: () => setEditing(false) });
              }}
            >
              <Save size={16} /> {fromAi ? "Varoq bilan solishtirdim: saqlash" : "Saqlash va xatolarni belgilash"}
            </button>
          </>
        ) : (
          <>
            <p className="rounded-lg bg-surface-2 p-3 text-sm text-ink-2">
              Xato so'zni sichqoncha yoki barmoq bilan belgilang, turini tanlang va «To'g'risi»ga to'g'ri shaklini yozing. Tinish belgisi xatosida so'zni
              to'g'ri belgi bilan yozing (masalan: <code>Albatta,</code>). O'lchovga imlo, punktuatsiya, qo'shimcha va so'z qo'llash xatolari kiradi.
            </p>
            <MarkCounts counts={countMarks({ pages: [], text: marks })} />
            <div className="card p-3 sm:p-4">
              <TextAnnotator text={text} value={marks} onChange={setMarks} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" disabled={!dirty || save.isPending} onClick={() => save.mutate({ transcript: text, marks })}>
                <Save size={16} /> Belgilarni saqlash
              </button>
              <button className="btn-secondary" onClick={() => setEditing(true)}>
                <PenLine size={16} /> Matnni tahrirlash
              </button>
            </div>
            {g.transcribedBy && <p className="text-xs text-ink-3">Ko'chirgan: {g.transcribedBy}</p>}
          </>
        )}
      </div>
    </div>
  );
}
