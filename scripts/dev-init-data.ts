/**
 * Lokal dev: brauzerda (Telegram'siz) Mini App'ni ochish uchun imzolangan initData yasaydi
 * va apps/miniapp/.env.local ga yozadi. Ishlatish: pnpm dev:init-data
 * Faqat dev uchun. Production'da Telegram o'zi initData beradi.
 */
import { writeFileSync } from "node:fs";
import { signInitData } from "@onatili/shared/server";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error(".env da BOT_TOKEN yo'q");

const initData = signInitData(
  {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: 1000001, first_name: "Test", last_name: "O'quvchi", username: "test_student" }),
  },
  token,
);
writeFileSync("apps/miniapp/.env.local", `VITE_DEV_INIT_DATA=${initData}\n`);
console.log("apps/miniapp/.env.local yozildi (24 soat amal qiladi)");
