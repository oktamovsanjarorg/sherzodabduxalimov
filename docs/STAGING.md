# Staging

Staging **noutbukda** ishlaydi, tashqariga **teskari SSH tunnel** orqali chiqadi (2026-11-19 dan). Prod server faqat trafikni uzatadi: unda staging konteynerlari ishlamaydi, yuk deyarli yo'q. Har bir o'zgarish avval staging'da Telegram ichida sinaladi, keyin `main` ga tushadi. `main` ga tushgan narsa 2 daqiqada production'ga chiqadi ([DEPLOY.md](DEPLOY.md)).

```
feature branch → scripts/staging.sh up (noutbukda) → test botda sinash → main ga merge → production
```

**Qoida:** production serverda kod tahrirlanmaydi. `/home/ubuntu/onatili-prod` faqat `deploy.sh` orqali yangilanadi. Serverdagi eski `/home/ubuntu/onatili-staging` to'xtatilgan (zaxira, keyin o'chiriladi).

## Manzil
`https://staging.sherzodabduxalimov.uzbek-talim.uz`

```
Telegram → DNS (63.186.202.165) → edge-caddy (HTTPS)
         → 172.18.0.1:18098 (server) ══ ssh -R ══> noutbuk 127.0.0.1:8098 → onatili-staging web
```

Noutbuk o'chiq bo'lsa, manzil «Staging o'chiq» (503) deydi. Serverda `ubuntu` uchun `GatewayPorts clientspecified` yoqilgan, shuning uchun tunnel 172.18.0.1 ga bog'lana oladi.

## Ishlatish (noutbukda)
`.env.staging` da: `STAGING_WEB_BIND=127.0.0.1:8098`, `STAGING_TUNNEL=1`, test bot tokeni.
```bash
git checkout feat/nimadir
scripts/staging.sh up        # build, ko'tarish, migratsiya, tunnel
scripts/staging.sh logs api bot
scripts/staging.sh down      # to'xtatish (ma'lumot qoladi), tunnel ham yopiladi
```
Bitta test bot faqat bitta joyda ishlay oladi: serverdagi eski staging yoqilmasin.

## Birinchi sozlash (server)
1. BotFather'da test bot oching.
2. Serverda: `git clone git@github.com:oktamovsanjarorg/sherzodabduxalimov.git ~/onatili-staging`
3. `~/onatili-staging/.env.staging` ni `.env.staging.example` dan to'ldiring (`BOT_TOKEN`, `BOT_USERNAME`, `JWT_SECRET`, `STAGING_WEB_BIND=172.18.0.1:18098`, `STAGING_TUNNEL=0`), `chmod 600`.
4. Noutbukdan: `scripts/staging.sh deploy`

Skript production bot tokenini taniydi va bunday holatda ishga tushmaydi.

## Serverdagi buyruqlar (`~/onatili-staging` ichida yoki `staging.sh remote ...`)
| Buyruq | Vazifasi |
|---|---|
| `scripts/staging.sh up` | build, ko'tarish, migratsiya, birinchi marta seed |
| `scripts/staging.sh down` | to'xtatish (ma'lumot qoladi) |
| `scripts/staging.sh reset` | bazani o'chirib, noldan ko'tarish |
| `scripts/staging.sh status` | konteynerlar, tashqi manzil |
| `scripts/staging.sh logs api bot` | jurnallar |

## Zaxira yo'l: noutbukda
`.env.staging` da `STAGING_WEB_BIND=127.0.0.1:8098`, `STAGING_TUNNEL=1`, keyin noutbukda `scripts/staging.sh up`. Noutbuk serverga `ssh -R` bilan ulanadi. Bundan oldin serverdagi staging'ni to'xtating (`staging.sh remote down`): bitta test bot ikki joyda ishlay olmaydi, port ham band bo'ladi.

## Production'dan farqi
- Alohida test bot, alohida `JWT_SECRET`, `QUEUE_PREFIX=onatili-staging`.
- Baza bo'sh, faqat seed (demo kontent). Haqiqiy o'quvchilar ma'lumoti staging'ga tushmaydi.
- Worker 0.5 CPU bilan cheklangan.
- Server: 2 vCPU, 4 GB. Staging ishlab turganda ~300 MB RAM oladi.
- Volumlar alohida: `onatili-staging_staging_pg`, `onatili-staging_staging_media`.

## Server tomoni (bir marta)
Yangi serverda bir buyruq bilan: `ssh onatili-yangi 'bash -s' < scripts/server-setup.sh` (auto-deploy, sshd, Caddy). DNS yozuvini eskiz.uz panelida qo'lda qo'shing.
- `/etc/ssh/sshd_config.d/70-onatili-staging-tunnel.conf`: `ubuntu` uchun `GatewayPorts clientspecified`. Faqat noutbuk zaxira yo'li uchun kerak.
- `~/edge/Caddyfile` (repo'da `infra/edge/Caddyfile`): `staging.sherzodabduxalimov.uzbek-talim.uz` bloki, u `172.18.0.1:18098` ga proxy qiladi.
- DNS (eskiz.uz): `staging.sherzodabduxalimov` A → `63.186.202.165`.
