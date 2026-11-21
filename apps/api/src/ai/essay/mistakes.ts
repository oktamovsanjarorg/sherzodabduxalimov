import type { ErrorTypeKey } from "@onatili/shared";
import { PUNCT_RULES } from "./schemas";
import { type verifiedQuotes, uniqBy } from "./scoring";
import { norm, type Segmented } from "./text";

/** UI va varoqdagi belgilar uchun yagona xatolar ro'yxati, matndagi tartibda */
export function buildMistakes(v: ReturnType<typeof verifiedQuotes>, seg: Segmented) {
  const order = (s: string | null | undefined) => {
    const i = seg.sentences.findIndex((x) => x.id === s);
    return i < 0 ? 9999 : i;
  };
  const lit = uniqBy(v.errors, (e) => `${e.type}|${norm(e.wrong)}|${norm(e.right)}`).map((e) => ({
    at: order(e.s),
    wrong: e.wrong,
    right: e.right,
    type: e.type as ErrorTypeKey,
    note: [e.type === "punctuation" && e.rule && e.rule in PUNCT_RULES ? `Punktuatsiya: ${PUNCT_RULES[e.rule as keyof typeof PUNCT_RULES]}` : null, e.note].filter(Boolean).join(". ") || null,
  }));
  const reg = { colloquial: "so'zlashuv uslubi", official: "rasmiy-idoraviy uslub (kanselyarizm)", scientific: "ilmiy uslub", artistic: "badiiy uslub" } as const;
  const style = v.styleIssues
    .filter((x) => x.fix && norm(x.fix) !== norm(x.quote))
    .map((x) => ({ at: order(x.s), wrong: x.quote, right: x.fix!, type: "style" as ErrorTypeKey, note: `Publitsistik uslubdan chekinish: ${reg[x.register]}` }));
  const purity = v.purity
    .filter((x) => x.fix && norm(x.fix) !== norm(x.quote))
    .map((x) => ({ at: order(x.s), wrong: x.quote, right: x.fix!, type: "word" as ErrorTypeKey, note: `Til sofligi: ${x.kind}` }));
  return [...lit, ...style, ...purity]
    .sort((a, b) => a.at - b.at)
    .slice(0, 40)
    .map(({ at: _at, ...m }) => ({ ...m, wrong: m.wrong.slice(0, 200), right: m.right.slice(0, 200), note: m.note?.slice(0, 300) ?? null }));
}
