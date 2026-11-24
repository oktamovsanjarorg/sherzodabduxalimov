import { z } from "zod";

const level = z.enum(["full", "shallow", "missing"]).catch("missing");
const coverage = z.enum(["full", "partial", "none"]).catch("none");
const fit = z.enum(["fit", "partlyUnfit", "unfit", "none"]).catch("none");
const str = z.string().nullish().catch(null);
const sid = z.coerce.string().nullish().catch(null);
const arr = <T extends z.ZodTypeAny>(t: T) =>
  z
    .array(t.nullable().catch(null))
    .catch([])
    .default([])
    .transform((a) => a.filter((x): x is NonNullable<z.output<T>> => x != null));

const view = z
  .object({
    position: str,
    paragraphs: z.array(z.coerce.number()).catch([]).default([]),
    coverage,
    claim: str,
    evidence: str,
    analysis: str,
    evidenceFit: fit,
    note: str,
  })
  .catch({ position: null, paragraphs: [], coverage: "none", claim: null, evidence: null, analysis: null, evidenceFit: "none", note: null });

export const analysisSchema = z.object({
  special: z.enum(["OFF_TOPIC", "COPIED", "ONLY_INTRO"]).nullish().catch(null),
  paragraphsSplit: z.boolean().catch(true).default(true),
  paragraphs: arr(z.object({ n: z.coerce.number(), role: z.string().catch("other"), summary: str })),
  intro: z
    .object({
      level,
      topicOpened: z.boolean().catch(false),
      viewsHinted: z.boolean().catch(false),
      thesis: str,
      copiedFromPrompt: z.boolean().catch(false),
      note: str,
    })
    .catch({ level: "missing", topicOpened: false, viewsHinted: false, thesis: null, copiedFromPrompt: false, note: null }),
  pro: view,
  con: view,
  personal: z.object({ coverage, stance: str, solution: str, note: str }).catch({ coverage: "none", stance: null, solution: null, note: null }),
  body: z.object({ level, note: str }).catch({ level: "missing", note: null }),
  conclusion: z
    .object({ level, societyImpact: z.boolean().catch(false), repeatsOnly: z.boolean().catch(false), finalVerdict: str, note: str })
    .catch({ level: "missing", societyImpact: false, repeatsOnly: false, finalVerdict: null, note: null }),
  styleIssues: arr(
    z.object({ s: sid, register: z.enum(["colloquial", "official", "scientific", "artistic"]).catch("colloquial"), quote: z.string(), fix: str }),
  ),
  dominantRegister: z.enum(["publicistic", "colloquial", "official", "scientific", "artistic"]).catch("publicistic").default("publicistic"),
  structureIssues: arr(z.object({ where: str, issue: z.string(), quote: str })),
  repetitions: arr(z.object({ s: z.array(z.coerce.string()).catch([]).default([]), quote: z.string(), note: str })),
  purity: arr(z.object({ s: sid, quote: z.string(), kind: z.string().catch("parasite"), fix: str })),
  lexicon: z
    .object({
      good: z.array(z.string()).catch([]).default([]),
      misused: arr(z.object({ quote: z.string(), note: str })),
      overloadedParagraphs: z.array(z.coerce.number()).catch([]).default([]),
      level: z.coerce.number().catch(1),
    })
    .catch({ good: [], misused: [], overloadedParagraphs: [], level: 1 }),
});
export type Analysis = z.output<typeof analysisSchema>;

export const PUNCT_RULES = {
  kirish: "kirish so'z va birikmalar",
  uyushiq: "uyushiq bo'laklar",
  qoshma: "qo'shma gap qismlari orasida",
  ergash: "ergashgan qo'shma gap",
  undalma: "undalma",
  ajratilgan: "ajratilgan bo'laklar (izoh, aniqlovchi, hol)",
  kochirma: "ko'chirma va o'zlashtirma gap",
  oxiri: "gap oxiridagi belgi",
  ortiqcha: "ortiqcha tinish belgisi",
  tire: "tire (ega va kesim orasida va b.)",
  qoshtirnoq: "qo'shtirnoq",
  boshqa: "boshqa qoida",
} as const;

export const literacySchema = z.object({
  errors: arr(
    z.object({
      s: sid,
      type: z.enum(["spelling", "punctuation", "affix", "word"]).catch("spelling"),
      wrong: z.string(),
      right: z.string(),
      rule: z.string().nullish().catch(null),
      note: str,
    }),
  ),
});
export type LiteracyError = z.output<typeof literacySchema>["errors"][number];

export const verifySchema = z.object({
  checks: arr(z.object({ i: z.coerce.number(), valid: z.boolean().catch(false), right: str, note: str })),
});

export const writerSchema = z.object({
  criteria: arr(z.object({ key: z.string(), comment: z.string() })),
  feedback: z.string().catch("").default(""),
  tips: arr(z.object({ focus: str, text: z.string(), example: str })),
});
