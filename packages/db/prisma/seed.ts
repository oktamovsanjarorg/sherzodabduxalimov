import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

  const topic = await prisma.topic.upsert({
    where: { id: "topic-fonetika" },
    update: {},
    create: { id: "topic-fonetika", courseId: course.id, title: "Fonetika", order: 1 },
  });

  await prisma.lesson.upsert({
    where: { id: "lesson-unlilar" },
    update: {},
    create: {
      id: "lesson-unlilar",
      topicId: topic.id,
      title: "Unli tovushlar",
      content: "O'zbek tilida 6 ta unli tovush bor: a, o, u, e, i, oʻ.",
      order: 1,
      isFree: true,
      isPublished: true,
    },
  });

  const q = await prisma.question.upsert({
    where: { id: "q-unli-soni" },
    update: {},
    create: {
      id: "q-unli-soni",
      topicId: topic.id,
      text: "O'zbek tilida nechta unli tovush bor?",
      explanation: "a, o, u, e, i, oʻ — jami 6 ta.",
      options: {
        create: [
          { text: "5 ta", order: 1 },
          { text: "6 ta", isCorrect: true, order: 2 },
          { text: "7 ta", order: 3 },
          { text: "8 ta", order: 4 },
        ],
      },
    },
  });

  await prisma.test.upsert({
    where: { id: "test-fonetika-1" },
    update: {},
    create: {
      id: "test-fonetika-1",
      type: "TOPIC",
      title: "Fonetika: 1-test",
      topicId: topic.id,
      isFree: true,
      isPublished: true,
      questions: { create: [{ questionId: q.id, order: 1 }] },
    },
  });

  console.log("Seed tayyor");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
