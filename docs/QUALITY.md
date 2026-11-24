# Sifat qoidalari va "tayyor" ta'rifi

Maqsad: kod tartibi odamning xotirasiga emas, avtomatik tekshiruvga tayansin.

## Avtomatik tekshiruvlar

| Qayerda         | Nima                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| commit (husky)  | `lint-staged`: o'zgargan fayllarga `eslint --fix` + `prettier`; `commitlint`: conventional commit xabari      |
| CI (har PR)     | `format:check` → `lint` → `build` → migratsiya + seed → **schema drift** → `typecheck` → `test` → Docker      |
| deploy (server) | faqat CI yashil commit; health check o'tmasa avvalgi versiyaga qaytadi; build keshi 3 GB dan oshsa tozalanadi |

## ESLint qoidalari (`eslint.config.mjs`)

- `typescript-eslint` strict, `any` taqiqlangan, ishlatilmagan o'zgaruvchi xato (`_` bilan boshlansa — ruxsat).
- `max-lines: 300` (testlar 500), `max-lines-per-function: 60` (React komponenti 150, testlarda cheklanmaydi).
- `react-hooks/rules-of-hooks` xato, `exhaustive-deps` ogohlantirish.
- Chegaralar: `apps/admin`, `apps/miniapp`, `apps/bot` → `@onatili/db` va `@prisma/*` taqiqlangan. `packages/shared` → DB va NestJS taqiqlangan.

### Eski kod (`eslint-suppressions.json`)

Qoidalar 2026-11-23 da kiritildi. O'sha kundagi buzilishlar (asosan `!` non-null, katta fayllar) shu faylda qayd etilgan: ular xato bermaydi, lekin **yangi** buzilish darhol CI'ni qizil qiladi. Fayl faqat kamayadi:

```bash
# faylni bo'lib yoki tuzatib bo'lgach
pnpm exec eslint . --prune-suppressions
```

Bo'lish navbati (katta va xavfli birinchi): `students.service.ts` → `StudentDetailPage.tsx` → `PaymentsPage.tsx` → `billing.service.ts` → `admin-content.service.ts` → `EssayPage.tsx`, `AttemptPage.tsx` → qolganlari. Avval test, keyin bo'lish; bitta PR <= 400 qator.

## Bog'liqliklar

- Barcha versiyalar aniq (`^`/`~` yo'q). Yangilash — alohida PR, test bilan.
- `minimumReleaseAge: 4320` — chiqqaniga 3 kun bo'lmagan versiya o'rnatilmaydi (supply-chain hujumlariga qarshi).
- Node versiyasi: `.nvmrc` (CI va Dockerfile bir xil — 22).

## "Tayyor" ta'rifi (Definition of Done)

- [ ] `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build` yashil
- [ ] Yangi biznes qoidasi — kamida bitta test bilan (e2e yoki unit)
- [ ] Sxema o'zgargan bo'lsa — migratsiya bor, `drift` toza
- [ ] UI o'zgargan bo'lsa — telefon kengligida (360px) va iPhone WebKit'da ko'rilgan; yuklanish, bo'sh va xato holatlari bor
- [ ] Prodga chiqqani tekshirilgan (bundle yoki route), natija foydalanuvchiga tekshirilgan/tekshirilmagan deb ajratib aytilgan
- [ ] Repo public: shaxsiy ma'lumot va kalit yo'q
