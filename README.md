# Ona tili platformasi — Telegram Mini App

Ustoz Sherzod Abduxalimov uchun ona tili va adabiyot ta'lim platformasi. Reja va bosqichlar: [docs/PLAN.md](docs/PLAN.md).

## Tuzilma
| Papka | Vazifasi |
|---|---|
| `apps/api` | NestJS (Fastify) REST API, port 4100 |
| `apps/bot` | grammY Telegram bot |
| `apps/miniapp` | O'quvchi Mini App: React, Vite, Tailwind. Port 5180 |
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
