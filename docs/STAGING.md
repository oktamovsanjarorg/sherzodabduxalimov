# Staging

Staging noutbukda ishlaydi, production esa serverda. Har bir o'zgarish avval staging'da Telegram ichida sinaladi, keyin `main` ga tushadi. `main` ga tushgan narsa 2 daqiqada production'ga chiqadi ([DEPLOY.md](DEPLOY.md)).

```
feature branch → scripts/staging.sh up → test botda sinash → main ga merge → production
```

**Qoida:** production serverda kod tahrirlanmaydi. `/home/ubuntu/onatili-prod` faqat `deploy.sh` orqali yangilanadi.

## Manzil
`https://staging.sherzodabduxalimov.uzbek-talim.uz`

```
Telegram → DNS (63.186.202.165) → edge-caddy (HTTPS)
         → 172.18.0.1:18098 (server, faqat docker tarmog'ida)
         → teskari SSH tunnel → noutbuk 127.0.0.1:8098 (onatili-staging web)
```

Noutbuk serverga o'zi ulanadi (`ssh -R`). Shuning uchun hotspot, Wi-Fi yoki public IP almashsa ham manzil o'zgarmaydi. Ulanish uzilsa, tunnel 5 soniyada qayta ulanadi. Noutbuk o'chiq bo'lsa, sahifada "Staging o'chiq" yozuvi chiqadi. Production'ga bu ta'sir qilmaydi.

## Birinchi sozlash
1. BotFather'da test bot oching (masalan `@sherzodabduxalimov_staging_bot`).
2. `cp .env.staging.example .env.staging`, keyin `BOT_TOKEN`, `BOT_USERNAME` va `JWT_SECRET` ni to'ldiring (`openssl rand -hex 32`).
3. `scripts/staging.sh up`

Skript production bot tokenini taniydi va bunday holatda ishga tushmaydi.

## Buyruqlar
| Buyruq | Vazifasi |
|---|---|
| `scripts/staging.sh up` | build, ko'tarish, migratsiya, birinchi marta seed, tunnel |
| `scripts/staging.sh down` | to'xtatish (ma'lumot qoladi) |
| `scripts/staging.sh reset` | bazani o'chirib, noldan ko'tarish |
| `scripts/staging.sh tunnel` | tunnelni qayta ochish |
| `scripts/staging.sh status` | konteynerlar, tunnel, tashqi manzil |
| `scripts/staging.sh logs api bot` | jurnallar |

## Production'dan farqi
- Alohida test bot, alohida `JWT_SECRET`, `QUEUE_PREFIX=onatili-staging`.
- Baza bo'sh, faqat seed (demo kontent). Haqiqiy o'quvchilar ma'lumoti staging'ga tushmaydi.
- Worker 0.5 CPU bilan cheklangan.
- Volumlar alohida: `onatili-staging_staging_pg`, `onatili-staging_staging_media`.

## Server tomoni (bir marta qilingan)
- `/etc/ssh/sshd_config.d/70-onatili-staging-tunnel.conf`: `ubuntu` uchun `GatewayPorts clientspecified`. Tunnel `172.18.0.1` ga bog'lanadi. Bu IP tashqaridan ko'rinmaydi.
- `~/edge/Caddyfile`: `staging.sherzodabduxalimov.uzbek-talim.uz` bloki, u `172.18.0.1:18098` ga proxy qiladi.
- DNS (eskiz.uz): `staging.sherzodabduxalimov` A → `63.186.202.165`.
