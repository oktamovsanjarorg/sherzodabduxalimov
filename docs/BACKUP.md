# Zaxira nusxa (backup) va tiklash

## Nima saqlanadi
- **Baza** (o'quvchilar, to'lovlar, davomat, natijalar, darslar, testlar, esselar) — `pg_dump`
- **Media** (cheklar, esse rasmlari, videolar) — `tar.gz`

## Qachon va qayerda
- Har kuni 03:00 (Toshkent) — `scripts/backup.sh` (cron, o'rnatilgan nusxa: `/home/ubuntu/.onatili/backup.sh`)
- Serverda: `/home/ubuntu/onatili-backups/` — 14 kunlik, 8 haftalik, 12 oylik
- Server tashqarisida: shifrlangan nusxa (AES-256) egalarga **Telegram'da fayl** bo'lib keladi
- Xato bo'lsa egalarga ogohlantirish keladi; jurnal: `/home/ubuntu/onatili-backups/backup.log`

## Shifrlash kaliti
`/home/ubuntu/.onatili/backup.key`. **Uning nusxasi server tashqarisida (parol menejeri, qog'oz) saqlanishi shart**:
server yo'qolsa, Telegram'dagi faylni faqat shu kalit bilan ochish mumkin.

## Tiklash
```bash
scripts/restore.sh --test                          # oxirgi nusxani vaqtinchalik bazaga tiklab tekshirish (prod'ga tegmaydi)
KEY_FILE=kalit.txt scripts/restore.sh --decrypt onatili-XXXX.tar.enc   # Telegram'dagi faylni ochish -> ./restored
scripts/restore.sh --prod ./restored               # PROD'ni almashtirish (avval joriy holat ham saqlanadi, "HA" tasdig'i)
```

## Himoya choralari (ilovada)
- To'lov tarixi bor o'quvchini o'chirib bo'lmaydi (bloklash mumkin); o'quvchilar topshirgan testni o'chirib bo'lmaydi
- Barcha muhim o'zgarishlar `AuditLog` jadvalida (kim, qachon, nima)
- So'rovlar chegarasi: IP'dan daqiqasiga 600, kirish uchun 30
- Baza va Redis faqat server ichida (127.0.0.1); `.env` faqat egasiga o'qiladi (600)
