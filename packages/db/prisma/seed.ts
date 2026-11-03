/**
 * Namunaviy (demo) kontent: interfeysni sinash uchun. Haqiqiy kontent admin paneldan kiritiladi.
 * Idempotent: qayta ishga tushirilsa, dublikat yaratmaydi.
 */
import { PrismaClient, type QuestionType } from "@prisma/client";

const prisma = new PrismaClient();

type Q = {
  id: string;
  topicId: string;
  type?: QuestionType;
  text: string;
  explanation?: string;
  correctText?: string;
  options?: { text: string; ok?: boolean }[];
};

async function question(q: Q) {
  await prisma.question.upsert({
    where: { id: q.id },
    update: {},
    create: {
      id: q.id,
      topicId: q.topicId,
      type: q.type ?? "SINGLE",
      text: q.text,
      explanation: q.explanation,
      correctText: q.correctText,
      options: q.options
        ? { create: q.options.map((o, i) => ({ text: o.text, isCorrect: Boolean(o.ok), order: i + 1 })) }
        : undefined,
    },
  });
}

async function test(id: string, data: { type: "TOPIC" | "MOCK"; title: string; topicId?: string; isFree: boolean; timeLimitSec?: number }, questionIds: string[]) {
  await prisma.test.upsert({
    where: { id },
    update: {},
    create: {
      id,
      ...data,
      isPublished: true,
      questions: { create: questionIds.map((questionId, i) => ({ questionId, order: i + 1 })) },
    },
  });
}

async function main() {
  await prisma.plan.upsert({
    where: { id: "plan-monthly" },
    update: {},
    create: { id: "plan-monthly", name: "Oylik obuna", priceUzs: 150000, durationDays: 30 },
  });

  const course = await prisma.course.upsert({
    where: { id: "course-abituriyent" },
    update: {},
    create: {
      id: "course-abituriyent",
      title: "Abituriyentlar uchun ona tili",
      description: "Milliy sertifikat va DTM imtihonlariga tayyorlov kursi",
      isPublished: true,
    },
  });

  // ---------- 1-mavzu: Fonetika ----------
  const fon = await prisma.topic.upsert({
    where: { id: "topic-fonetika" },
    update: {},
    create: { id: "topic-fonetika", courseId: course.id, title: "Fonetika", order: 1 },
  });

  await prisma.lesson.upsert({
    where: { id: "lesson-unlilar" },
    update: {
      content:
        "# Unli tovushlar\n\nO'zbek tilida **6 ta unli** tovush bor:\n\n- a\n- o\n- u\n- e\n- i\n- oʻ\n\nUnlilar talaffuz qilinganda havo og'iz bo'shlig'ida **to'siqqa uchramaydi**.\n\n## Esda tuting\n\nHar bir bo'g'inda faqat *bitta* unli bo'ladi. Shuning uchun so'zdagi bo'g'inlar soni unlilar soniga teng.",
    },
    create: {
      id: "lesson-unlilar",
      topicId: fon.id,
      title: "Unli tovushlar",
      content: "O'zbek tilida 6 ta unli tovush bor: a, o, u, e, i, oʻ.",
      order: 1,
      isFree: true,
      isPublished: true,
    },
  });

  await prisma.lesson.upsert({
    where: { id: "lesson-harfbirikmalari" },
    update: {},
    create: {
      id: "lesson-harfbirikmalari",
      topicId: fon.id,
      title: "Harfbirikmalari: sh, ch, ng",
      content:
        "Ba'zi tovushlar ikki harf bilan yoziladi. Bunday harflar juftligi **harfbirikmasi** deyiladi.\n\n- **sh**: shahar, osh\n- **ch**: choy, qilich\n- **ng**: tong, ming\n\nHarfbirikmasi ikki harfdan iborat bo'lsa ham, *bitta tovushni* ifodalaydi.",
      order: 2,
      isFree: false,
      isPublished: true,
    },
  });

  await question({
    id: "q-unli-soni",
    topicId: fon.id,
    text: "O'zbek tilida nechta unli tovush bor?",
    explanation: "a, o, u, e, i, oʻ: jami 6 ta.",
    options: [{ text: "5 ta" }, { text: "6 ta", ok: true }, { text: "7 ta" }, { text: "8 ta" }],
  });
  await question({
    id: "q-faqat-unli",
    topicId: fon.id,
    text: "Qaysi qatorda faqat unli tovushlar berilgan?",
    explanation: "a, o, u: uchalasi ham unli. Qolgan qatorlarda undosh tovushlar aralashgan.",
    options: [{ text: "a, o, u", ok: true }, { text: "a, b, d" }, { text: "sh, ch, ng" }, { text: "e, k, i" }],
  });
  await question({
    id: "q-unlilarni-tanlang",
    topicId: fon.id,
    type: "MULTIPLE",
    text: "Quyidagilardan qaysilari unli tovush?",
    explanation: "a va oʻ: unli. q va ng: undosh.",
    options: [{ text: "a", ok: true }, { text: "q" }, { text: "oʻ", ok: true }, { text: "ng" }],
  });
  await question({
    id: "q-kitob-bogin",
    topicId: fon.id,
    type: "TEXT",
    text: "«Kitob» so'zida nechta bo'g'in bor? Raqam bilan yozing.",
    explanation: "Ki-tob: ikkita unli (i, o), demak ikkita bo'g'in.",
    correctText: "2|ikki|ikkita",
  });
  await question({
    id: "q-harfbirikma",
    topicId: fon.id,
    text: "Qaysi harfbirikmasi bitta tovushni ifodalaydi?",
    explanation: "sh: bitta tovush. st, nk, rt: ikkitadan tovush.",
    options: [{ text: "st" }, { text: "sh", ok: true }, { text: "nk" }, { text: "rt" }],
  });

  await test("test-fonetika-1", { type: "TOPIC", title: "Fonetika: 1-test", topicId: fon.id, isFree: true }, [
    "q-unli-soni",
  ]);
  // Mavjud bazada 1-testga yangi savollarni ham qo'shamiz
  for (const [i, qid] of ["q-faqat-unli", "q-unlilarni-tanlang", "q-kitob-bogin"].entries()) {
    await prisma.testQuestion.upsert({
      where: { testId_questionId: { testId: "test-fonetika-1", questionId: qid } },
      update: {},
      create: { testId: "test-fonetika-1", questionId: qid, order: i + 2 },
    });
  }

  // ---------- 2-mavzu: Leksikologiya ----------
  const lex = await prisma.topic.upsert({
    where: { id: "topic-leksika" },
    update: {},
    create: { id: "topic-leksika", courseId: course.id, title: "Leksikologiya", order: 2 },
  });
  await prisma.lesson.upsert({
    where: { id: "lesson-sinonim" },
    update: {},
    create: {
      id: "lesson-sinonim",
      topicId: lex.id,
      title: "Sinonim va antonimlar",
      content:
        "## Sinonimlar\n\nShakli har xil, ma'nosi yaqin so'zlar: *chiroyli – go'zal*, *katta – ulkan*.\n\n## Antonimlar\n\nMa'nosi qarama-qarshi so'zlar: *issiq – sovuq*, *katta – kichik*.",
      order: 1,
      isFree: false,
      isPublished: true,
    },
  });
  await question({
    id: "q-sinonim",
    topicId: lex.id,
    text: "«Chiroyli» so'zining sinonimini toping.",
    options: [{ text: "go'zal", ok: true }, { text: "xunuk" }, { text: "katta" }, { text: "tez" }],
  });
  await question({
    id: "q-antonim",
    topicId: lex.id,
    text: "Antonim juftlikni toping.",
    explanation: "Issiq va sovuq: ma'nosi qarama-qarshi. Qolganlari sinonim juftliklar.",
    options: [{ text: "katta – ulkan" }, { text: "issiq – sovuq", ok: true }, { text: "tez – chaqqon" }, { text: "go'zal – chiroyli" }],
  });
  await test("test-leksika-1", { type: "TOPIC", title: "Leksikologiya: 1-test", topicId: lex.id, isFree: false }, [
    "q-sinonim",
    "q-antonim",
  ]);

  // ---------- Mock ----------
  await test(
    "mock-demo-1",
    { type: "MOCK", title: "Demo mock: 1-variant", isFree: true, timeLimitSec: 600 },
    ["q-unli-soni", "q-faqat-unli", "q-unlilarni-tanlang", "q-kitob-bogin", "q-harfbirikma", "q-sinonim", "q-antonim"],
  );

  console.log("Seed tayyor");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
