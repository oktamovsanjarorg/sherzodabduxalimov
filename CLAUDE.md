# Ona tili platformasi — ish qoidalari

Telegram Mini App + admin panel + bot. To'liq sifat qoidalari: [docs/QUALITY.md](docs/QUALITY.md).

## Tuzilma

- `apps/api` — NestJS + Fastify, Prisma, BullMQ (`src/worker.ts` — navbatlar)
- `apps/bot` — grammY bot
- `apps/miniapp` — o'quvchi va ota-ona Mini App (React + Vite)
- `apps/admin` — ustoz/yordamchi admin panel (React + Vite, `/admin`)
- `packages/db` — Prisma sxema va migratsiyalar; `packages/shared` — Zod sxemalar, tiplar, sof funksiyalar
- `sites/landing` — statik landing

## Buyruqlar

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build   # PR'dan oldin
pnpm --filter @onatili/db migrate      # yangi migratsiya (schema.prisma o'zgarganda)
pnpm --filter @onatili/db run drift    # schema.prisma va DB bir xilmi
```

Testlar Postgres + Redis + env talab qiladi (`DATABASE_URL`, `REDIS_URL`, `BOT_TOKEN`, `JWT_SECRET`, qiymatlar `.github/workflows/ci.yml` da).

## Qat'iy qoidalar

- **Repo public.** Karta raqami, ism, telefon, token, kalit — faqat `.env`da, kodga va commitga emas.
- **Interfeys o'zbekcha (lotin).** Kod izohlari ham o'zbekcha.
- **Fayl <= 300 qator, funksiya <= 60 (React komponenti <= 150).** ESLint tekshiradi. Eski kodning buzilishlari `eslint-suppressions.json`da; u faqat kamayadi. Faylni bo'lgach: `pnpm exec eslint . --prune-suppressions`.
- **UI va bot bazaga to'g'ridan-to'g'ri murojaat qilmaydi** — faqat API orqali. Umumiy tip va sxemalar `packages/shared`da.
- **API'da `import type` NestJS DI uchun ishlatilmaydi** (emitDecoratorMetadata). Shu sabab API'da `consistent-type-imports` o'chiq.
- **Ruxsat backend'da** (`@Roles`), UI'da yashirish yetarli emas.
- **AI hech qachon yakuniy baho qo'ymaydi** — oxirgi so'z ustozda. Esse AI sifati faqat haqiqiy ma'lumotda o'lchanadi: `docs/ESSAY_AI_RESEARCH.md`.
- **Demo/seed ma'lumot qo'shilmaydi** (testlardagi fixture'dan tashqari).

## Ish tartibi

1. `main`dan branch → o'zgarish → yuqoridagi tekshiruv yashil.
2. Commit xabari conventional (`feat(admin): ...`, `fix(api): ...`); husky + commitlint tekshiradi.
3. PR → CI yashil → merge → prod server 2 daqiqa ichida o'zi deploy qiladi (`scripts/auto-deploy.sh`, health check o'tmasa avvalgi versiyaga qaytadi).
4. Deploy'ni tekshirish: yangi bundle/route prodda borligini ko'rish. UI o'zgarishi — telefonda yoki WebKit iPhone emulyatsiyasida, Chromium yetarli emas.
5. Tekshirilgan va tekshirib bo'lmaganini alohida ayting.
