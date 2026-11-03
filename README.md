# Ona tili platformasi — Telegram Mini App

Ustoz Sherzod Abduxalimov uchun ona tili va adabiyot ta'lim platformasi. Reja va bosqichlar: [docs/PLAN.md](docs/PLAN.md).

## Tuzilma
| Papka | Vazifasi |
|---|---|
| `apps/api` | NestJS (Fastify) REST API, port 4100 |
| `apps/bot` | grammY Telegram bot |
| `apps/miniapp` | O'quvchi Mini App: React, Vite, Tailwind. Port 5180 |
| `apps/admin` | Admin panel (ustoz, yordamchilar): `/admin`, port 5181 |
| `apps/api/src/worker.ts` | Video worker: ffmpeg orqali AES-128 HLS |
| `packages/db` | Prisma sxema, migratsiyalar, seed |
| `packages/shared` | Umumiy tiplar, Zod sxemalar, initData tekshiruvi (`/server`) |

## Ishga tushirish (lokal)
```bash
corepack enable && pnpm install
cp .env.example .env           # BOT_TOKEN, JWT_SECRET va boshqalarni to'ldiring
pnpm db:up                     # Postgres :5434, Redis :6381
pnpm db:migrate && pnpm db:seed
pnpm dev:init-data             # brauzerda Telegram'siz sinash uchun test initData
pnpm --filter @onatili/api dev
pnpm --filter @onatili/miniapp dev   # http://127.0.0.1:5180
```

### Telegram ichida sinash
1. BotFather'da test bot yarating va tokenini `.env` dagi `BOT_TOKEN` ga yozing.
2. HTTPS tunnel oching: `cloudflared tunnel --url http://127.0.0.1:5180`. Chiqqan manzilni `MINIAPP_URL` ga yozing.
3. Botni ishga tushiring: `pnpm --filter @onatili/bot dev`. Keyin botga `/start` yuboring.

## Testlar
`pnpm test`: initData imzo tekshiruvi (unit) va auth/RBAC (e2e). E2E testlar uchun ishlab turgan Postgres kerak.

## Muhim qoidalar
- Ruxsatlar faqat backend'da tekshiriladi (`@Roles()`, global `AuthGuard`). Ochiq endpoint'lar `@Public()` bilan belgilanadi.
- API dev rejimda swc orqali ishlaydi. tsx ishlatilmaydi, chunki u NestJS uchun kerakli decorator metadata'ni chiqarmaydi.
- Server portlari boshqa loyihalar bilan to'qnashmaydi: 5432, 5433, 6380, 80 va 443 band.

## Production (shu server)
```bash
docker compose up -d --build     # postgres, redis, api, bot, web
docker compose logs -f bot api
```
- Tashqi trafik: `mb-caddy` (`/home/ubuntu/mb-platform/Caddyfile`), keyin `sherzodabduxalimov.uzbek-talim.uz` → `onatili-web:80` (`mb-platform_default` tarmog'i orqali).
- `onatili-web` (nginx) Mini App statik fayllarini beradi va `/api/` ni `onatili-api:4100` ga yo'naltiradi.
- Migratsiyalar API konteyneri ishga tushganda avtomatik qo'llanadi (`prisma migrate deploy`).
- Caddyfile o'zgarganda: `docker exec mb-caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile && docker exec mb-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile`
- Serverda IPv6 ishlamaydi. Tashqi API'larga (Telegram, AI) ulanishda IPv4 majburiy qilinadi.
- Bot faqat bitta nusxada ishlashi kerak. Konteyner ishlayotganda `pnpm --filter @onatili/bot dev` ni ishga tushirmang, aks holda Telegram 409 xatosini beradi.

## Admin panel
- Kirish: botga `/admin` yoziladi. Bot 5 daqiqalik bir martalik havola yuboradi.
- Egalar (TEACHER) `.env` dagi `OWNER_USERNAMES` orqali belgilanadi. Egalar yordamchilarni (ASSISTANT) "Xodimlar" sahifasidan qo'shadi.

## Video himoyasi
- Yuklash 8 MB'lik bo'laklarda bajariladi. Internet uzilsa, yuklash qolgan joyidan davom etadi (`apps/admin/src/lib/uploader.ts`).
- Worker videoni 720p/480p HLS'ga aylantiradi va AES-128 bilan shifrlaydi. Kalit `videos/<id>/enc.key` da saqlanadi, `hls/` ichiga tushmaydi.
- Kalit va pleylistlar faqat 3 soatlik HMAC token bilan beriladi. Token dars ochilganda, obuna tekshirilgandan keyin chiqariladi.
- Pleyerning o'ng yuqori burchagida doimiy «Sherzod-Abduxalimov» belgisi turadi (ustozning talabi). Ilova fonga o'tganda video pauza qilinadi.
- Cheklov: web-ilovada skrinshot va ekran yozuvini 100% to'sib bo'lmaydi. Belgi doimiy bo'lgani uchun video tarqalsa, kim tarqatganini aniqlab bo'lmaydi.

## Dev va prod bazalari
- Lokal dev va testlar `onatili_dev` bazasidan foydalanadi (`.env`). Production `onatili` bazasida ishlaydi, compose `DATABASE_URL` ni o'zi beradi.
- Navbat prefikslari ham alohida: dev uchun `onatili-dev`, e2e testlar uchun `onatili-e2e`, prod uchun `onatili`.
- Yangi migratsiya qo'shish: `prisma migrate diff --from-schema-datasource ... --to-schema-datamodel ... --script` bilan SQL yasaladi, keyin `prisma migrate deploy` bilan qo'llanadi (muhit interaktiv emas).
