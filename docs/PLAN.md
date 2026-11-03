# Ona-tili platformasi — Telegram Mini App (reja)

## Context
Ustoz Sherzod Abduxalimov uchun ona-tili fanidan shaxsiy ta'lim platformasi. Auditoriya: abituriyentlar (asosan online, offline guruhlar ham bor).
Tanlov: **Telegram Mini App + Bot**. Bu tezroq chiqadi, alohida ilova o'rnatish kerak emas va login Telegram orqali avtomatik bo'ladi.
PDF eskizlaridan: Videodars, Mavzulashtirilgan test, Mock test, Davomat, Esse tekshirish (AI, keyin ustoz, keyin ball) pullik qismga kiradi. Pastki navigatsiyada 3 ta tab bor, o'rtadagisi "Asosiy". Keyingi bosqich: G'azal, Matn, Kitob.
Papka bo'sh, ya'ni loyiha noldan boshlanadi.

## Texnologiyalar (tasdiqlangan: TypeScript full-stack)
| Qatlam | Tanlov |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Mini App (o'quvchi) | React 18 + Vite + TypeScript, `@telegram-apps/sdk-react`, TanStack Query, Zustand, React Router, Tailwind CSS |
| Admin panel (ustoz va yordamchilar) | Alohida web-ilova: React + Vite + **shadcn/ui** + TanStack Table. Desktop uchun, chunki kontent yuklash kompyuterda qulayroq. Telegram Login Widget yoki parol + 2FA bilan kiriladi |
| Backend API | **NestJS** (Fastify adapter), REST + OpenAPI, Zod validatsiya |
| DB | **PostgreSQL 16** + **Prisma** ORM |
| Navbat / cron | Redis + BullMQ: AI tekshiruv, ota-ona hisobotlari, eslatmalar |
| Bot | **grammY**: Mini App'ni ochish, bildirishnomalar, ota-ona boti (bitta botda rollar bilan) |
| Video | Boshida Telegram kanal yoki privat YouTube (unlisted) havola. Keyinroq Bunny Stream yoki Cloudflare Stream (himoyalangan HLS, yuklab olib bo'lmaydi) |
| Fayllar | S3-mos saqlash: Cloudflare R2 |
| AI | `AiProvider` interfeysi. Boshlanishi **DeepSeek API** (arzon). Kerak bo'lsa `.env` orqali Claude API'ga almashtiriladi |
| Deploy | Docker Compose, VPS (Hetzner yoki mahalliy), Caddy (HTTPS). Mini App HTTPS talab qiladi |

## Monorepo tuzilishi
```
apps/
  miniapp/      # o'quvchi Mini App
  admin/        # ustoz paneli
  api/          # NestJS
  bot/          # grammY bot
packages/
  db/           # Prisma schema + client
  shared/       # umumiy tiplar, Zod sxemalar, konstantalar
  ui/           # dizayn tokenlari
docker-compose.yml
```

## Rollar va ruxsatlar
- `STUDENT`: online yoki offline (guruhga biriktirilgan)
- `PARENT`: faqat o'z farzandining davomati va natijalari
- `ASSISTANT`: test va dars tahriri, esse tekshirish, davomat. To'lov va sozlamalarga kira olmaydi
- `TEACHER` (owner): hammasiga kira oladi
Backend'da RBAC guard'lari bor, har bir endpoint rol bo'yicha cheklanadi.

## Ma'lumotlar modeli (asosiy)
- `User` (telegramId, ism, telefon, rol), `StudentProfile` (online/offline, groupId, parentLinkCode)
- `Group` (offline guruh, jadval), `ParentLink` (parent ↔ student)
- `Course` → `Module/Topic` → `Lesson` (video url, matn, fayllar, tartib, `isFree`)
- `QuestionBank`: `Question` (turi: bitta/ko'p javob, moslashtirish, matnli; mavzu; qiyinlik; izoh), `Option`
- `Test` (turi: TOPIC | MOCK; vaqt limiti; savollar; ball tizimi), `Attempt`, `AttemptAnswer`
- `Essay` (mavzu, matn yoki rasm, status: SUBMITTED → AI_CHECKED → REVIEWED), `EssayReview` (AI bahosi va izohi, ustoz bahosi va izohi, mezonlar bo'yicha ballar)
- `Attendance` (groupId, studentId, sana, status: KELDI/KELMADI/KECHIKDI/SABABLI)
- `Plan` (tarif), `Subscription` (boshlanish, tugash, status), `Payment` (method: MANUAL | CLICK | PAYME, summa, chek rasmi, status)
- `AuditLog`: kim nimani o'zgartirgani

## O'quvchi Mini App — joylashuv
Pastki navigatsiya, 3 tab (eskizdagidek):
1. **Darslar**: kurs, mavzu, dars (video + konspekt + mavzu testi)
2. **Asosiy** (o'rtada, default): salomlashuv, obuna holati, "Bugungi vazifa", davom ettirish kartasi, tezkor tugmalar (Mock test, Esse yuborish), qisqa statistika
3. **Profil**: statistika (grafiklar, mavzular bo'yicha zaif joylar), to'lov va obuna, davomat (offline uchun), sozlamalar

Testlar va Mock alohida to'liq ekranli rejimda ochiladi: taymer, savollar xaritasi, Telegram BackButton bilan chiqishdan oldin tasdiq so'raladi.

## Dizayn tamoyillari
- Telegram `themeParams` ishlatiladi: ilova foydalanuvchining kunduzgi yoki tungi rejimiga moslashadi. Brend rangi bitta (masalan, chuqur ko'k yoki zumrad), qolganlari neytral
- Mobile-first, 360px'dan boshlab. Bosiladigan elementlar kamida 44px. Telegram MainButton asosiy harakat uchun ("Testni boshlash", "Yuborish")
- Shrift: Inter yoki Manrope (o'zbek lotin harflari `oʻ gʻ` to'g'ri chiqadi)
- Yuklanish holatlari skeleton bilan, sahifalar orasida tez o'tish (prefetch)
- Interfeys to'liq o'zbek tilida (lotin). i18n tuzilmasi keyinchalik kirill alifbosi uchun ham tayyor turadi

## Admin panel — bo'limlar
- **Dashboard**: faol o'quvchilar, daromad, o'rtacha ball, tekshirilmagan esselar soni
- **Kontent**: kurs/mavzu/dars CRUD, drag-and-drop bilan tartiblash, video havola
- **Savollar banki**: CRUD, Excel/Word'dan ommaviy import (shablon bo'yicha), **"AI bilan tekshirish"** tugmasi (savol xatosi, noaniq javob, imlo; AI taklifini ustoz qabul qiladi yoki rad etadi)
- **Testlar va Mock**: bankdan savollar yig'ish, vaqt va ball sozlamalari, nashr qilish
- **Esselar navbati**: AI bahosi va izohi oldindan to'ldirilgan, ustoz tahrirlab tasdiqlaydi, o'quvchiga bildirishnoma boradi
- **Davomat**: guruh va sana tanlanadi, ro'yxatda bir bosishda holat belgilanadi, saqlanganda ota-onalarga bot orqali avtomatik xabar ketadi. Haftalik yoki oylik hisobot cron orqali yuboriladi
- **O'quvchilar va guruhlar**: online/offline, ota-onani ulash kodi
- **To'lovlar**: qo'lda tasdiqlash navbati (chek rasmi, tasdiqlash yoki rad etish, obuna avtomatik faollashadi)
- **Statistika** va **Sozlamalar** (tariflar, yordamchilar, AI provider)

## AI qatlami
- `AiProvider` interfeysi: `gradeEssay(text, rubric)` va `reviewQuestion(q)`. Implementatsiyalar: `DeepSeekProvider` (default) va `ClaudeProvider`. Qaysi biri ishlashini `AI_PROVIDER` env o'zgaruvchisi belgilaydi
- Ishlar BullMQ navbatida asinxron bajariladi, qayta urinish va timeout bor. Natija JSON sxema bilan qaytadi (mezon bo'yicha ball va izoh)
- **AI hech qachon yakuniy baho qo'ymaydi**: oxirgi so'z har doim ustozda. AI o'chiq bo'lsa ham esse oqimi ishlayveradi
- Shu serverdagi Claude Code production backend sifatida ishlatilmaydi: bu obuna shartlariga to'g'ri kelmaydi va ishonchli emas

## To'lovlar
1. **1-bosqich**: qo'lda. O'quvchi karta raqamiga pul o'tkazadi, chek rasmini yuklaydi, admin tasdiqlaydi, obuna faollashadi
2. **2-bosqich**: Click (Merchant API: prepare/complete callback'lari). Buning uchun yuridik shaxs yoki YaTT va Click bilan shartnoma kerak
3. **3-bosqich**: Payme (xuddi shu `PaymentProvider` interfeysi orqali)
- Google Pay: O'zbekistonda merchant sifatida qabul qilib bo'lmaydi. Xorijiy kartalarni Click/Payme orqali qabul qilish mumkin
- Obuna modeli: oylik tarif. Ba'zi darslar `isFree` qilib ochiq qoldiriladi (sinov uchun)

## Xavfsizlik va chegaralar
- Mini App `initData` server tomonda HMAC orqali tekshiriladi, keyin qisqa muddatli JWT beriladi
- Pullik kontentga kirish backend'da obuna bo'yicha tekshiriladi, faqat UI'da yashirish yetarli emas
- Mock test paytida javoblar serverda saqlanadi, vaqt server bo'yicha hisoblanadi. To'g'ri javoblar test tugamaguncha klientga yuborilmaydi
- Rate limit, fayl hajmi va turi cheklovi, DB'ning kunlik backup'i
- MVP'ga kirmaydi: o'yinlar, g'azal/kitob bo'limi, native ilova

## Bosqichlar
- **0 (1 hafta)**: monorepo, Docker, DB schema, bot va Mini App skeleti, Telegram auth, CI
- **1. MVP (3–4 hafta)**: darslar, mavzu testlari, Asosiy va Profil, admin kontent va savollar banki, qo'lda to'lov va obuna
- **2 (2–3 hafta)**: Mock test (taymer, natija tahlili), statistika, offline guruhlar, davomat, ota-ona boti
- **3 (2 hafta)**: esse va AI, savollarni AI bilan tekshirish, Click integratsiyasi
- **4+**: Payme, himoyalangan video hosting, G'azal/Matn/Kitob bo'limi, qo'llanmalar, o'yinlar (gamification: streak, reyting)

## Tekshirish (verification)
- Unit testlar: Vitest (shared, api servislari). E2E: Playwright (Mini App brauzerda mock `initData` bilan, admin panel)
- Lokal ishlab chiqish: `docker compose up` (postgres, redis), `pnpm dev`. Mini App'ni Telegram'da sinash uchun HTTPS tunnel (cloudflared) va BotFather'da test bot
- Har bosqich oxirida ustoz bilan demo: real oqim sinaladi (dars yuklash, o'quvchi test topshiradi, statistika chiqadi; davomat belgilanadi, ota-onaga xabar boradi)

## Birinchi qadam (tasdiqlangandan keyin)
0-bosqich: monorepo skeleti, Prisma schema, NestJS'da Telegram auth, grammY bot `/start` va Mini App tugmasi, Mini App'da 3 tabli bo'sh layout.
