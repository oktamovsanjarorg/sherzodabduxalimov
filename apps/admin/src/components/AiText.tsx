import { Fragment } from "react";

/** AI matni: oddiy markdown (**qalin**, "- " va "1. " ro'yxatlar) */
export function AiText({ text }: { text: string }) {
  const bold = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>));
  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-ink">
      {text
        .split("\n")
        .filter((l) => l.trim())
        .map((l, i) => {
          const t = l.trim().replace(/^#+\s*/, "");
          if (/^[-*•]\s+/.test(t))
            return (
              <p key={i} className="pl-4 -indent-3">
                • {bold(t.replace(/^[-*•]\s+/, ""))}
              </p>
            );
          if (/^\d+\.\s/.test(t) || /^\*\*/.test(t))
            return (
              <p key={i} className="pt-2 font-semibold">
                {bold(t)}
              </p>
            );
          return <p key={i}>{bold(t)}</p>;
        })}
    </div>
  );
}
