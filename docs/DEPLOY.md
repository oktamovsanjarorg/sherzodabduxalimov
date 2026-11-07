# Deploy

Production serveri: AWS `t4g.medium` (ARM, 2 vCPU, 4 GB), `eu-central-1`, `63.186.202.165`.

## Qanday ishlaydi
1. `main` ga push bo'ladi. GitHub Actions faqat tekshiradi (build, typecheck, testlar, docker image), serverga ulanmaydi.
2. Serverdagi cron har 2 daqiqada `~/.onatili/auto-deploy.sh` ni ishga tushiradi. U `origin/main` ni tekshiradi va yangi commit bo'lsa `scripts/deploy.sh` ni chaqiradi.
3. `scripts/deploy.sh` ish tartibi (`/home/ubuntu/onatili-prod`):
   - `git checkout <sha>`;
   - `docker compose build`, keyin `up -d`;
   - health check (nginx → api);
   - muvaffaqiyatsiz bo'lsa, **avvalgi commit'ga qaytaradi**.
   - Jurnallar: `.deploy/auto.log` va `.deploy/deploy.log`.

Bitta commit ikkinchi marta urinilmaydi, hatto muvaffaqiyatsiz bo'lsa ham. Keyingi commit kutiladi.

Production faqat `/home/ubuntu/onatili-prod` dan ishga tushiriladi. Dev papkasidan `docker compose up` qilmang.

## Git'da yo'q server fayllari
- `docker-compose.override.yml`: worker CPU limiti, tashqi media volume, log limitlari.
- `~/edge/`: `edge-caddy` (HTTPS, reverse proxy).
- `~/.onatili/auto-deploy.sh`: `scripts/auto-deploy.sh` nusxasi. Skript o'zgarsa, qo'lda yangilang.
- `~/onatili-backups/backup.sh`: amaldagi zaxira skripti (`scripts/backup.sh` dan farq qiladi).

## Zaxira
Har kuni 22:00 UTC (Toshkent 03:00): baza va media `~/onatili-backups` ga (14 kun) va S3 ga (90 kun) yoziladi. Xato bo'lsa, egalarga Telegram orqali ogohlantirish keladi. Jurnal: `~/onatili-backups/backup.log`.

## Qo'lda deploy
```bash
/home/ubuntu/onatili-prod/scripts/deploy.sh          # origin/main
/home/ubuntu/onatili-prod/scripts/deploy.sh <sha>    # aniq commit (orqaga qaytarish uchun ham)
```
