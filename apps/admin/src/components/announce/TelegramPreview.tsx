import { renderAnnounce } from "@onatili/shared";
import { ExternalLink, LayoutGrid } from "lucide-react";

/** Xabar Telegram'da qanday ko'rinishi: rasm, matn (belgilashlar bilan) va tugma */
export function TelegramPreview({
  text,
  photo,
  buttonText,
  buttonUrl,
  name = "Ali",
}: {
  text: string;
  photo?: string | null;
  buttonText?: string | null;
  buttonUrl?: string | null;
  name?: string;
}) {
  // renderAnnounce matnni to'liq escape qiladi va faqat b/i/s/code teglarini qo'shadi: innerHTML xavfsiz
  const html = renderAnnounce(text || "Xabar matni shu yerda ko'rinadi", {
    name,
  });
  return (
    <div className="rounded-2xl bg-[#d9e4ec] p-3 dark:bg-[#0e1621]" aria-label="Telegram'dagi ko'rinishi">
      <div className="max-w-[340px] overflow-hidden rounded-2xl rounded-bl-md bg-white text-[15px] leading-snug text-[#111] shadow-sm dark:bg-[#182533] dark:text-[#e9eef3]">
        {photo && <img src={photo} alt="" className="max-h-72 w-full object-cover" />}
        <div
          className={`whitespace-pre-wrap break-words px-3 py-2 [&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1 ${text ? "" : "opacity-50"}`}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <p className="px-3 pb-1.5 text-right text-[11px] text-[#8a9aa9]">bot · hozir</p>
      </div>
      {buttonText && (
        <div className="mt-1 flex max-w-[340px] items-center justify-center gap-1.5 rounded-xl bg-white/70 px-3 py-2 text-sm font-semibold text-[#2481cc] dark:bg-[#182533]/80 dark:text-[#6ab3f3]">
          {buttonUrl?.startsWith("app:") ? <LayoutGrid size={14} /> : <ExternalLink size={14} />} {buttonText}
        </div>
      )}
    </div>
  );
}
