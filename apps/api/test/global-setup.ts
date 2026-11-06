import { PrismaClient } from "@onatili/db";

/** Testlar o'chirgan narsalar korzinkaga tushadi: ishga tushirish tugagach shu vaqt ichidagilarini tozalaymiz */
export default function setup() {
  const started = new Date();
  return async () => {
    const prisma = new PrismaClient();
    await prisma.trashItem.deleteMany({ where: { createdAt: { gte: started } } });
    await prisma.$disconnect();
  };
}
