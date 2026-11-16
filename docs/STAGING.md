# Staging

Staging ham, production ham serverda ishlaydi, lekin alohida papkalarda: `/home/ubuntu/onatili-staging` va `/home/ubuntu/onatili-prod`. Har bir o'zgarish avval staging'da Telegram ichida sinaladi, keyin `main` ga tushadi. `main` ga tushgan narsa 2 daqiqada production'ga chiqadi ([DEPLOY.md](DEPLOY.md)).

```
feature branch → git push → scripts/staging.sh deploy → test botda sinash → main ga merge → production
```

**Qoida:** production serverda kod tahrirlanmaydi. `/home/ubuntu/onatili-prod` faqat `deploy.sh` orqali yangilanadi. `/home/ubuntu/onatili-staging` ham qo'lda tahrirlanmaydi, faqat `staging.sh deploy` orqali yangilanadi.

## Manzil
`https://staging.sherzodabduxalimov.uzbek-talim.uz`

```
Telegram → DNS (63.186.202.165) → edge-caddy (HTTPS)
         → 172.18.0.1:18098 (server, faqat docker tarmog'ida) → onatili-staging web
```

Noutbuk o'chiq bo'lsa ham staging ishlaydi. Build server internetida bo'ladi.

## Ishlatish (noutbukdan)
```bash
git push                                # branch GitHub'da bo'lishi kerak
scripts/staging.sh deploy               # joriy branch
scripts/staging.sh deploy feat/boshqa   # boshqa branch
scripts/staging.sh remote status        # serverdagi holat
scripts/staging.sh remote logs api bot  # serverdagi jurnallar
```
`deploy` serverda `git checkout <sha>` qiladi, keyin `scripts/staging.sh up` (build, migratsiya, birinchi marta seed). Build vaqtida (bir necha daqiqa) server CPU si band bo'ladi, prod sekinlashishi mumkin.

Noutbukda ham `.env.staging` kerak (faqat `STAGING_SSH_HOST` va `STAGING_REMOTE_DIR` o'qiladi, qolgani serverdagi nusxada).

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
