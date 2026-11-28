import { essayTo75, leaderboard, type ExternalTestDetail } from "@onatili/shared";
import { buildXlsx, type Cell, type Sheet } from "../export/xlsx";

/**
 * Offline test natijalari Excel faylda: botga qo'shilmagan o'quvchilarga berish yoki chop etish uchun.
 * Milliy shkalada test, yozma va umumiy ball, daraja; har bo'lim alohida ustun.
 */
export function resultsXlsx(t: ExternalTestDetail): { file: Buffer; name: string } {
  const milliy = t.rows.some((r) => r.testScore != null);
  const sections = t.rows[0]?.sectionScores ?? [];
  const columns: Sheet["columns"] = [
    { header: "№", width: 5 },
    { header: "Ism", width: 28 },
    { header: "Username", width: 16 },
    { header: "To'g'ri", width: 8 },
    { header: "Xato", width: 7 },
    { header: "Bo'sh", width: 7 },
    { header: "Foiz", width: 8 },
    ...(milliy
      ? [
          { header: "Test (75)", width: 10 },
          { header: "Esse (24)", width: 10 },
          { header: "Yozma (75)", width: 11 },
          { header: "Umumiy ball", width: 12 },
          { header: "Daraja", width: 9 },
        ]
      : []),
    ...sections.map((s, i) => ({ header: s.title || `${i + 1}-bo'lim`, width: 14 })),
  ];
  // Tartib va o'rin kanal rasmidagidek: Milliy bo'lsa umumiy ball (esse bilan), aks holda foiz
  const byId = new Map(t.rows.map((r) => [r.id, r]));
  const order = leaderboard(t, { limit: null, short: false }).flatMap((b) => {
    const r = byId.get(b.id);
    return r ? [{ place: b.place, r }] : [];
  });
  const rows: Cell[][] = order.map(({ place, r }) => [
    place,
    r.student?.name ?? r.name,
    r.username ? `@${r.username}` : null,
    r.correct,
    r.wrong,
    r.blank,
    r.percent,
    ...(milliy ? [r.testScore, r.essayScore, r.essayScore != null ? essayTo75(r.essayScore) : null, r.scaledScore, r.grade ?? "—"] : []),
    // Bo'lim: Milliy bo'lsa sertifikatdagi ball, aks holda to'g'ri/jami
    ...sections.map((_, i) => {
      const s = r.sectionScores[i];
      if (!s) return null;
      return s.points != null ? Math.round(s.points * 1000) / 1000 : `${s.correct}/${s.max}`;
    }),
  ]);
  const date = (t.takenAt ?? new Date().toISOString()).slice(0, 10);
  return { file: buildXlsx([{ name: "Natijalar", columns, rows }]), name: `natijalar-${date}.xlsx` };
}
