/**
 * Bitta o'quvchi bo'yicha yo'nalish: kuchli/zaif tomonlar (offline test bo'limlari, mavzular, esse mezonlari),
 * xavf belgilari (davomat, faollik, pasayish) va keyingi aniq qadamlar (shu mavzudagi ko'rilmagan dars/test).
 */
import { NotFoundException } from "@nestjs/common";
import { MILLIY_LEVELS, formatScore, sectionScore, sortAdvice, type Advice, type ExternalSection, type StudentAdvice } from "@onatili/shared";
import type { PrismaService } from "../prisma/prisma.service";
import { dateDaysAgo, daysAgo, essayFacts, pct, topicAccuracy, DAY } from "./facts";

type Item = { label: string; percent: number; source: string };

export async function studentAdvice(prisma: PrismaService, studentId: string): Promise<StudentAdvice> {
  const sp = await prisma.studentProfile.findUnique({
    where: { id: studentId },
    select: {
      user: { select: { id: true, firstName: true, lastName: true, lastAppAt: true, createdAt: true } },
      group: { select: { name: true, isActive: true } },
      parents: { where: { status: "APPROVED" }, select: { id: true } },
      attendance: { where: { date: { gte: dateDaysAgo(30) } }, select: { status: true } },
      externalResults: {
        orderBy: { test: { takenAt: "desc" } },
        take: 3,
        select: { answers: true, scaledScore: true, testScore: true, essayScore: true, grade: true, test: { select: { title: true, sections: true } } },
      },
    },
  });
  if (!sp?.user) throw new NotFoundException("O'quvchi topilmadi");
  const userId = sp.user.id;
  const advice: Advice[] = [];
  const add = (a: Omit<Advice, "count"> & { count?: number }) => advice.push({ count: 1, ...a });
  const strengths: Item[] = [];
  const weaknesses: Item[] = [];
  const place = (i: Item) => (i.percent >= 75 ? strengths.push(i) : i.percent < 55 ? weaknesses.push(i) : null);

  // ---- Offline (milliy) test: bo'limlar va keyingi darajagacha qancha ----
  const ext = sp.externalResults[0];
  if (ext) {
    for (const s of ext.test.sections as unknown as ExternalSection[]) place({ label: s.title ?? "Bo'lim", percent: Math.round(sectionScore(s, ext.answers).percent), source: ext.test.title });
    const score = ext.scaledScore ?? 0;
    const next = [...MILLIY_LEVELS].reverse().find((l) => l.min > score);
    if (next)
      add({
        key: `s:milliy-next`, level: "important", area: "learning",
        title: `${next.code} darajagacha ${formatScore(Math.round((next.min - score) * 10) / 10)} ball yetmaydi`,
        why: `${ext.test.title}: ${formatScore(score)} ball${ext.grade ? ` (${ext.grade})` : ""}.${ext.essayScore == null ? " Esse bali hali kiritilmagan, umumiy ball faqat testdan." : ""} Eng tez o'sish zaif bo'limdan keladi.`,
      });
    const prev = sp.externalResults[1]?.scaledScore;
    if (prev != null && score < prev - 3)
      add({ key: "s:milliy-drop", level: "urgent", area: "learning", title: `Mock natijasi tushdi: ${formatScore(prev)} → ${formatScore(score)}`, why: "Oldingi offline testga nisbatan 3 balldan ko'p pasaygan. Sababini o'quvchi bilan gaplashib aniqlang." });
  }

  // ---- Ilovadagi testlar: mavzular va pasayish ----
  const topics = await topicAccuracy(prisma, { userId, since: daysAgo(180) }, 4);
  for (const t of topics) place({ label: t.title, percent: t.percent, source: "ilovadagi testlar" });
  const attempts = await prisma.attempt.findMany({
    where: { userId, status: { in: ["SUBMITTED", "EXPIRED"] }, maxScore: { gt: 0 }, test: { gradingScale: { not: "MILLIY_SERTIFIKAT" } } },
    orderBy: { finishedAt: "desc" },
    take: 6,
    select: { score: true, maxScore: true },
  });
  const recent = attempts.map((a) => pct(a.score ?? 0, a.maxScore!));
  if (recent.length >= 4) {
    const now = (recent[0] + recent[1]) / 2;
    const before = (recent[2] + recent[3]) / 2;
    if (now < before - 15) add({ key: "s:tests-drop", level: "important", area: "learning", title: `Test natijalari pasaymoqda: ${Math.round(before)}% → ${Math.round(now)}%`, why: "Oxirgi 2 ta test oldingi 2 tadan 15 foizdan ko'p past." });
  }

  // ---- Esse ----
  const reviews = await prisma.essayReview.findMany({ where: { essay: { userId } }, orderBy: { createdAt: "desc" }, take: 10, select: { criteria: true, mistakes: true } });
  const ef = essayFacts(reviews);
  for (const c of ef.criteria) place({ label: `Esse: ${c.label}`, percent: c.percent, source: `${reviews.length} ta esse` });
  if (!reviews.length) add({ key: "s:no-essay", level: "idea", area: "essays", title: "Hali birorta esse yozmagan", why: "Milliy sertifikatda yozma ish 75 ballning yarmini beradi. Haftasiga bitta esse yozdirish kerak." });
  else if (ef.mistakes[0]) add({ key: "s:essay-mistake", level: "idea", area: "essays", title: `Esselarda ko'p xato: ${ef.mistakes[0].label.toLowerCase()} (${ef.mistakes[0].share}%)`, why: `Oxirgi ${reviews.length} ta essedagi ${ef.totalMistakes} xatodan. Shu turdagi qoidalarga qisqa mashq bering.` });

  // ---- Davomat, faollik, ota-ona ----
  const absent = sp.attendance.filter((a) => a.status === "ABSENT").length;
  if (absent >= 2) add({ key: "s:absent", level: absent >= 3 ? "urgent" : "important", area: "attendance", title: `Oxirgi 30 kunda ${absent} marta darsga kelmagan`, why: `${sp.attendance.length} ta darsdan. Ota-onasiga qo'ng'iroq qiling.`, count: absent });
  const idle = sp.user.lastAppAt ? Math.floor((Date.now() - sp.user.lastAppAt.getTime()) / DAY) : null;
  if (idle === null) add({ key: "s:never-app", level: "important", area: "activity", title: "Ilovani bir marta ham ochmagan", why: "Darslar, testlar va esse tekshiruvi ilovada. Darsda telefonidan ochib ko'rsating." });
  else if (idle >= 10) add({ key: "s:idle", level: "important", area: "activity", title: `${idle} kundan beri ilovaga kirmagan`, why: "Uy vazifasi va testlarni ilovada bajarmayapti." });
  if (!sp.parents.length) add({ key: "s:no-parent", level: "important", area: "parents", title: "Ota-onasi ulanmagan", why: "Natija va davomat haqida ota-onaga xabar bormaydi. O'quvchi sahifasidagi havolani ota-onaga yuboring." });

  // ---- Keyingi qadamlar: eng zaif mavzudagi ko'rilmagan darslar va ishlanmagan testlar ----
  const weakTopicIds = topics.filter((t) => t.percent < 55).slice(0, 2).map((t) => t.topicId);
  const next: StudentAdvice["next"] = [];
  if (weakTopicIds.length) {
    const [lessons, tests] = await Promise.all([
      prisma.lesson.findMany({ where: { topicId: { in: weakTopicIds }, isPublished: true, progress: { none: { userId, completedAt: { not: null } } } }, orderBy: { order: "asc" }, take: 3, select: { id: true, title: true } }),
      prisma.test.findMany({ where: { topicId: { in: weakTopicIds }, isPublished: true, attempts: { none: { userId } } }, take: 2, select: { id: true, title: true } }),
    ]);
    for (const l of lessons) next.push({ label: `Darsni ko'rish: ${l.title}`, to: `/lessons/${l.id}` });
    for (const t of tests) next.push({ label: `Testni ishlash: ${t.title}`, to: `/tests/${t.id}` });
  }
  const worst = [...weaknesses].sort((a, b) => a.percent - b.percent)[0];
  if (worst) next.push({ label: `${worst.label} — ${worst.percent}%: shu bo'yicha alohida mashq` });

  strengths.sort((a, b) => b.percent - a.percent);
  weaknesses.sort((a, b) => a.percent - b.percent);
  return { generatedAt: new Date().toISOString(), strengths: strengths.slice(0, 6), weaknesses: weaknesses.slice(0, 6), advice: sortAdvice(advice), next };
}
