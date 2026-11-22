import { ANNOUNCE_CAPTION_MAX, ANNOUNCE_TEXT_MAX } from "@onatili/shared";
import { Bold, Code, ImagePlus, Italic, Strikethrough, User, X } from "lucide-react";
import { useRef } from "react";

const TEMPLATES: [string, string][] = [
  ["Dars bekor", "Assalomu alaykum, {ism}!\n\n**Bugungi dars bo'lmaydi.** Keyingi dars odatdagi vaqtda.\n\nNoqulaylik uchun uzr."],
  ["Dars vaqti o'zgardi", "Assalomu alaykum, {ism}!\n\nDiqqat: **dars vaqti o'zgardi**.\nYangi vaqt: __...__\n\nIltimos, kechikmang."],
  ["Yangi test", "{ism}, ilovada **yangi test** joylandi. Imkon qadar tezroq yechib chiqing: natijani ustoz ko'radi."],
  ["To'lov eslatmasi", "Assalomu alaykum, {ism}!\n\nShu oy uchun **to'lov muddati** yaqinlashdi. To'lovni ilova orqali qilsangiz bo'ladi."],
  ["Tabrik", "Hurmatli {ism}!\n\nSizni bayram bilan chin qalbimdan tabriklayman! 🎉"],
];

/** Matn maydoni: belgilash tugmalari, {ism}, tayyor andozalar va rasm */
export function MessageEditor({
  text,
  onText,
  photo,
  onPhoto,
  onRemovePhoto,
  uploading,
}: {
  text: string;
  onText: (t: string) => void;
  photo: string | null;
  onPhoto: (f: File) => void;
  onRemovePhoto: () => void;
  uploading: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const max = photo ? ANNOUNCE_CAPTION_MAX : ANNOUNCE_TEXT_MAX;

  /** Tanlangan qismni belgilar bilan o'raydi (tanlanmagan bo'lsa kursor joyiga qo'yadi) */
  const wrap = (open: string, close = open) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const inner = text.slice(a, b) || (close ? "matn" : "");
    onText(text.slice(0, a) + open + inner + close + text.slice(b));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + open.length, a + open.length + inner.length);
    });
  };

  const tools = [
    { label: "Qalin", Icon: Bold, run: () => wrap("**") },
    { label: "Kursiv", Icon: Italic, run: () => wrap("__") },
    { label: "O'chirilgan", Icon: Strikethrough, run: () => wrap("~~") },
    { label: "Kod", Icon: Code, run: () => wrap("`") },
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {TEMPLATES.map(([name, body]) => (
          <button key={name} type="button" className="h-8 rounded-full bg-surface-3 px-3 text-xs font-bold text-ink-2 hover:bg-surface-4" onClick={() => onText(body)}>
            {name}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-line focus-within:border-brand">
        <div className="flex flex-wrap items-center gap-1 border-b border-line bg-surface-2 px-2 py-1">
          {tools.map((t) => (
            <button key={t.label} type="button" title={t.label} aria-label={t.label} className="btn-ghost h-8 w-8 p-0" onClick={t.run}>
              <t.Icon size={15} />
            </button>
          ))}
          <button type="button" title="Oluvchining ismi" className="btn-ghost h-8 gap-1 px-2 text-xs font-bold" onClick={() => wrap("{ism}", "")}>
            <User size={14} /> {"{ism}"}
          </button>
          <span className="flex-1" />
          <button type="button" className="btn-ghost h-8 gap-1 px-2 text-xs font-bold" disabled={uploading} onClick={() => fileRef.current?.click()}>
            <ImagePlus size={15} /> {uploading ? "Yuklanmoqda…" : photo ? "Rasmni almashtirish" : "Rasm"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPhoto(f);
              e.target.value = "";
            }}
          />
        </div>
        <textarea
          ref={ref}
          aria-label="Xabar matni"
          className="block min-h-[180px] w-full resize-y border-0 bg-surface px-3 py-2 text-[15px] outline-none"
          value={text}
          maxLength={ANNOUNCE_TEXT_MAX}
          placeholder="Xabar matni. {ism} o'rniga har kimning o'z ismi qo'yiladi."
          onChange={(e) => onText(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-ink-3">**qalin**, __kursiv__, ~~o'chirilgan~~, `kod`</span>
        <span className={text.length > max ? "font-bold text-red-600" : "text-ink-3"}>
          {text.length} / {max}
          {photo && text.length > max && " — rasm bilan Telegram ko'pi bilan 1000 belgi ko'rsatadi"}
        </span>
      </div>
      {photo && (
        <div className="relative inline-block">
          <img src={photo} alt="Biriktirilgan rasm" className="h-24 rounded-lg border border-line object-cover" />
          <button type="button" aria-label="Rasmni olib tashlash" className="absolute -right-2 -top-2 rounded-full bg-ink p-1 text-page" onClick={onRemovePhoto}>
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
