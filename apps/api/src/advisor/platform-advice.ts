/**
 * Platforma bo'yicha tavsiyalar: faqat bazadagi faktlardan, har biri «nega» va «nima qilish» bilan.
 * Chegara qiymatlar (50%, 3 marta, 14 kun) ustoz amaliyotidan: o'zgarsa shu yerda.
 */
import { formatScore, sectionScore, sortAdvice, type Advice, type ExternalRasch, type ExternalSection, type PlatformAdvice } from "@onatili/shared";
import { Prisma } from "@onatili/db";
import type { PrismaService } from "../prisma/prisma.service";
import { dateDaysAgo, daysAgo, essayFacts, fullName, names, pct, topicAccuracy } from "./facts";

export async function platformAdvice(prisma: PrismaService): Promise<PlatformAdvice> {
  const advice: Advice[] = [];
  const add = (a: Advice) => advice.push(a);
  const pulse: PlatformAdvice["pulse"] = [];

  const students = await prisma.user.findMany({
    where: { role: "STUDENT", isBlocked: false },
    select: {
      id: true, firstName: true, lastName: true, createdAt: true, lastAppAt: true, botJoinedAt: true,
      student: { select: { id: true, groupId: true, group: { select: { isActive: true } }, parents: { where: { status: "APPROVED" }, select: { id: true } } } },
    },
  });
  const total = students.length;

  // ---- Kontent: o'quvchi ilovada nimani ko'ra oladi ----
  const [lessonsPub, lessonsDraft, testsPub, testsDraft, coursesPub] = await Promise.all([
    prisma.lesson.count({ where: { isPublished: true, topic: { course: { isPublished: true } } } }),
    prisma.lesson.count({ where: { OR: [{ isPublished: false }, { topic: { course: { isPublished: false } } }] } }),
    prisma.test.count({ where: { isPublished: true } }),
    prisma.test.count({ where: { isPublished: false } }),
    prisma.course.count({ where: { isPublished: true } }),
  ]);
  if (lessonsPub === 0)
    add({
      key: "content:no-lessons", level: "urgent", area: "content", count: 1,
      title: "O'quvchilar ilovada birorta ham dars ko'ra olmaydi",
      why: `Nashr qilingan dars 0 ta${lessonsDraft ? `, qoralamada ${lessonsDraft} ta` : ""}${coursesPub ? "" : ", nashr qilingan kurs ham yo'q"}. ${total} o'quvchi ilovani ochsa bo'sh sahifa ko'radi.`,
      action: { label: "Darslarni nashr qilish", to: "/content" },
    });
  if (testsPub === 0)
    add({
      key: "content:no-tests", level: "urgent", area: "content", count: 1,
      title: "Ilovada ishlash mumkin bo'lgan test yo'q",
      why: `Nashr qilingan test 0 ta${testsDraft ? `, qoralamada ${testsDraft} ta` : ""}. O'quvchi o'zini sinab ko'ra olmaydi, natijalar statistikasi ham yig'ilmaydi.`,
      action: { label: "Testlar", to: "/tests" },
    });
  pulse.push({ label: "Ochiq darslar", value: String(lessonsPub), hint: lessonsDraft ? `${lessonsDraft} qoralama` : undefined });
  pulse.push({ label: "Ochiq testlar", value: String(testsPub), hint: testsDraft ? `${testsDraft} qoralama` : undefined });

  // ---- Faollik ----
  const week = students.filter((s) => s.lastAppAt && s.lastAppAt > daysAgo(7)).length;
  pulse.push({ label: "Haftada ilovani ochgan", value: `${week}/${total}`, hint: `${pct(week, total)}%` });
  const neverOpened = students.filter((s) => s.botJoinedAt && !s.lastAppAt);
  if (neverOpened.length >= 3)
    add({
      key: "activity:never-opened", level: "important", area: "activity", count: neverOpened.length,
      title: `${neverOpened.length} o'quvchi botga kirgan, lekin ilovani bir marta ham ochmagan`,
      why: `Masalan: ${names(neverOpened.map(fullName))}. Ko'pincha «ilova qayerda» ekanini bilmaydi: darsda bir marta ko'rsatib qo'yish yetarli.`,
      action: { label: "O'quvchilar", to: "/students" },
    });
  const idleOnline = students.filter((s) => !(s.student?.groupId && s.student.group?.isActive) && s.createdAt < daysAgo(14) && (!s.lastAppAt || s.lastAppAt < daysAgo(14)));
  if (idleOnline.length)
    add({
      key: "activity:idle-online", level: "important", area: "activity", count: idleOnline.length,
      title: `${idleOnline.length} online o'quvchi 14 kundan beri ilovaga kirmagan`,
      why: `${names(idleOnline.map(fullName))}. Online o'quvchi uchun ilova yagona dars joyi: uzoq jimlik ketib qolishdan oldingi belgi.`,
      action: { label: "Online o'quvchilar", to: "/students?group=none" },
    });

  // ---- Davomat (oxirgi 30 kun) ----
  const att = await prisma.attendance.findMany({
    where: { date: { gte: dateDaysAgo(30) } },
    select: { status: true, groupId: true, group: { select: { name: true } }, student: { select: { id: true, user: { select: { firstName: true, lastName: true } } } } },
  });
  const came = att.filter((a) => a.status === "PRESENT" || a.status === "LATE").length;
  if (att.length) pulse.push({ label: "Davomat (30 kun)", value: `${pct(came, att.length)}%` });
  const absent = new Map<string, { name: string; n: number }>();
  for (const a of att) if (a.status === "ABSENT") absent.set(a.student.id, { name: fullName(a.student.user), n: (absent.get(a.student.id)?.n ?? 0) + 1 });
  const chronic = [...absent.values()].filter((x) => x.n >= 3).sort((a, b) => b.n - a.n);
  if (chronic.length)
    add({
      key: "attendance:chronic", level: "urgent", area: "attendance", count: chronic.length,
      title: `${chronic.length} o'quvchi oxirgi 30 kunda 3 va undan ko'p dars qoldirgan`,
      why: names(chronic.map((c) => `${c.name} (${c.n})`), 5) + ". Ota-onasi bilan gaplashish kerak: qoldirilgan mavzular keyingi testlarda chiqadi.",
      action: { label: "Davomat", to: "/attendance" },
    });
  const groups = new Map<string, { name: string; ok: number; n: number }>();
  for (const a of att) {
    const g = groups.get(a.groupId) ?? { name: a.group.name, ok: 0, n: 0 };
    g.n++;
    if (a.status === "PRESENT" || a.status === "LATE") g.ok++;
    groups.set(a.groupId, g);
  }
  for (const [id, g] of groups)
    if (g.n >= 20 && pct(g.ok, g.n) < 80)
      add({
        key: `attendance:group:${id}`, level: "important", area: "attendance", count: 1,
        title: `${g.name}: davomat ${pct(g.ok, g.n)}%`,
        why: `Oxirgi 30 kunda ${g.n} belgidan ${g.n - g.ok} tasi «kelmadi». 80% dan past: dars vaqti yoki jadvalni o'quvchilar bilan qayta ko'rib chiqing.`,
        action: { label: "Guruh davomati", to: `/attendance?group=${id}` },
      });

  // ---- O'zlashtirish: mavzular va offline (milliy) testlar ----
  const weakTopics = (await topicAccuracy(prisma, { since: daysAgo(60) }, 10)).filter((t) => t.percent < 55).slice(0, 3);
  for (const t of weakTopics)
    add({
      key: `learning:topic:${t.topicId}`, level: "important", area: "learning", count: 1,
      title: `«${t.title}» mavzusi o'zlashtirilmagan: ${t.percent}% to'g'ri`,
      why: `Oxirgi 60 kunda ${t.answers} ta javobdan ${t.percent}% to'g'ri. Mavzuni darsda qayta tushuntirib, qisqa takroriy test berish kerak.`,
      action: { label: "Mavzu darslari", to: "/content" },
    });
  await externalAdvice(prisma, add, pulse);

  // ---- Esse ----
  const [waiting, reviews] = await Promise.all([
    prisma.essay.findMany({ where: { mode: "TEACHER", status: "SUBMITTED" }, select: { createdAt: true } }),
    prisma.essayReview.findMany({ where: { createdAt: { gte: daysAgo(60) } }, select: { criteria: true, mistakes: true } }),
  ]);
  const late = waiting.filter((e) => e.createdAt < daysAgo(2));
  if (late.length)
    add({
      key: "essays:late", level: "urgent", area: "essays", count: late.length,
      title: `${late.length} esse 2 kundan beri tekshirilmagan`,
      why: "Ustoz tekshiruvi pullik: o'quvchi va ota-ona javobni kutmoqda. Kechikish ishonchni pasaytiradi.",
      action: { label: "Esselar", to: "/essays?tab=hw" },
    });
  const ef = essayFacts(reviews);
  if (reviews.length >= 5 && ef.criteria[0] && ef.criteria[0].percent < 60)
    add({
      key: `essays:criterion:${ef.criteria[0].key}`, level: "idea", area: "essays", count: 1,
      title: `Esselarda eng zaif mezon: «${ef.criteria[0].label}» (${ef.criteria[0].percent}%)`,
      why: `Oxirgi 60 kundagi ${reviews.length} ta baholashda. ${ef.mistakes[0] ? `Eng ko'p xato turi: ${ef.mistakes[0].label.toLowerCase()} (${ef.mistakes[0].share}%). ` : ""}Shu mezonga bitta namunaviy dars ajratsangiz, butun guruh bali ko'tariladi.`,
      action: { label: "Esse tahlili", to: "/essays" },
    });

  // ---- Ota-onalar va to'lov ----
  const noParent = students.filter((s) => s.student && !s.student.parents.length).length;
  if (total && noParent / total > 0.3)
    add({
      key: "parents:missing", level: "important", area: "parents", count: noParent,
      title: `${noParent} o'quvchida (${pct(noParent, total)}%) ota-ona ulanmagan`,
      why: "Ota-ona ulanmasa, davomat, natija va to'lov eslatmalari ularga bormaydi. Ota-onalar majlisida havolani tarqatish eng tez yo'l.",
      action: { label: "O'quvchilar", to: "/students" },
    });
  const receipts = await prisma.payment.count({ where: { status: "PENDING", receiptUrl: { not: null } } });
  if (receipts)
    add({
      key: "payments:receipts", level: "urgent", area: "payments", count: receipts,
      title: `${receipts} ta to'lov cheki tasdiq kutmoqda`,
      why: "Tasdiqlanmaguncha o'quvchining obunasi ochilmaydi.",
      action: { label: "To'lovlar", to: "/payments" },
    });

  return { generatedAt: new Date().toISOString(), pulse, advice: sortAdvice(advice) };
}

/** Oxirgi offline (skaner) test: guruhning eng zaif bo'limi, hech kim yecholmagan savollar, kiritilmagan esse */
async function externalAdvice(prisma: PrismaService, add: (a: Advice) => void, pulse: PlatformAdvice["pulse"]) {
  const t = await prisma.externalTest.findFirst({
    where: { rasch: { not: Prisma.DbNull } },
    orderBy: { takenAt: "desc" },
    select: { id: true, title: true, sections: true, rasch: true, results: { select: { answers: true, essayScore: true, scaledScore: true } } },
  });
  if (!t || !t.results.length) return;
  const sections = t.sections as unknown as ExternalSection[];
  const avg = sections
    .map((s) => ({ title: s.title ?? "Bo'lim", percent: Math.round(t.results.reduce((a, r) => a + sectionScore(s, r.answers).percent, 0) / t.results.length) }))
    .sort((a, b) => a.percent - b.percent);
  const scores = t.results.map((r) => r.scaledScore).filter((x): x is number => x != null);
  if (scores.length) pulse.push({ label: t.title, value: `${formatScore(Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10)} ball`, hint: `${t.results.length} o'quvchi o'rtachasi` });
  const weak = avg[0];
  if (weak && weak.percent < 60)
    add({
      key: `learning:external:${t.id}:section`, level: "important", area: "learning", count: 1,
      title: `${t.title}: «${weak.title}» bo'limi eng zaif (o'rtacha ${weak.percent}%)`,
      why: `Bo'limlar: ${avg.map((a) => `${a.title} ${a.percent}%`).join(", ")}. Keyingi mockgacha shu bo'limga darslarning katta qismini ajrating.`,
      action: { label: "Natijalar", to: `/external/${t.id}` },
    });
  const rasch = t.rasch as unknown as ExternalRasch;
  const hard = rasch.items.filter((i) => i.correctPct < 15).map((i) => i.q);
  if (hard.length)
    add({
      key: `learning:external:${t.id}:hard`, level: "idea", area: "learning", count: hard.length,
      title: `${t.title}: ${hard.length} ta savolni deyarli hech kim yecholmagan`,
      why: `Savollar: ${hard.join(", ")} (15% dan kam to'g'ri). Bu mavzular darsda o'tilmagan yoki tushuntirish yetmagan bo'lishi mumkin: alohida tahlil darsi qiling.`,
      action: { label: "Rasch tahlili", to: `/external/${t.id}` },
    });
  const noEssay = t.results.filter((r) => r.essayScore == null).length;
  if (noEssay)
    add({
      key: `learning:external:${t.id}:essay`, level: "important", area: "essays", count: noEssay,
      title: `${t.title}: ${noEssay} o'quvchining esse bali kiritilmagan`,
      why: "Esse kiritilmaguncha umumiy ball va daraja faqat test qismidan: o'quvchi va ota-ona noto'g'ri natija ko'radi.",
      action: { label: "Esse ballari", to: `/external/${t.id}` },
    });
}
