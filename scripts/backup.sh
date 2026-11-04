#!/usr/bin/env bash
# Kunlik zaxira nusxa (backup): baza + media (cheklar, esse rasmlari, videolar).
#
#  1. Postgres: pg_dump (custom format), so'ng pg_restore --list bilan butunligi tekshiriladi
#  2. Media: tar.gz
#  3. Serverda saqlanadi: 14 kunlik + 8 haftalik (yakshanba) + 12 oylik (oyning 1-kuni)
#  4. Server tashqarisiga (offsite): baza nusxasi AES-256 bilan shifrlanib, egalarga Telegram orqali yuboriladi
#     (bot fayl chegarasi ~50 MB; media katta bo'lsa faqat baza yuboriladi)
#  5. Xato bo'lsa egalarga ogohlantirish keladi
#
# Cron: 0 22 * * * /home/ubuntu/.onatili/backup.sh >> /home/ubuntu/onatili-backups/backup.log 2>&1   (Toshkent 03:00)
# Tiklash: scripts/restore.sh
set -Eeuo pipefail

ROOT="/home/ubuntu/onatili-backups"
KEY="/home/ubuntu/.onatili/backup.key"
ENV_FILE="/home/ubuntu/onatili-prod/.env"
TS="$(date -u +%Y%m%d-%H%M)"
DOW="$(date -u +%u)"   # 7 = yakshanba
DOM="$(date -u +%d)"
mkdir -p "$ROOT"/{daily,weekly,monthly}
umask 077

BOT_TOKEN="$(grep -E '^BOT_TOKEN=' "$ENV_FILE" | head -1 | cut -d= -f2- | sed 's/[[:space:]]*#.*$//' | tr -d '"')"

# Egalar (TEACHER) Telegram ID'lari
owners() {
  docker exec onatili-postgres psql -U onatili -d onatili -tAc \
    "select \"telegramId\" from \"User\" where role='TEACHER' and \"isBlocked\"=false and \"telegramId\" is not null"
}
tg_text() {
  for chat in $(owners); do
    curl -4 -s -m 30 -o /dev/null "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${chat}" --data-urlencode "text=$1" || true
  done
}
tg_file() {
  local file="$1" caption="$2"
  for chat in $(owners); do
    curl -4 -s -m 300 -o /dev/null -F "chat_id=${chat}" -F "caption=${caption}" -F "document=@${file}" \
      "https://api.telegram.org/bot${BOT_TOKEN}/sendDocument" || true
  done
}
fail() {
  echo "!!! $(date -Is) backup xato: $1"
  tg_text "⚠️ Zaxira nusxa (backup) olinmadi: $1. Serverni tekshirish kerak."
  exit 1
}
trap 'fail "kutilmagan xato (qator $LINENO)"' ERR

echo "=== $(date -Is) backup boshlandi"
DIR="$ROOT/daily/$TS"
mkdir -p "$DIR"

# 1. Baza
docker exec onatili-postgres pg_dump -U onatili -d onatili -Fc -Z 9 > "$DIR/db.dump" || fail "pg_dump"
docker exec -i onatili-postgres pg_restore --list < "$DIR/db.dump" > /dev/null || fail "nusxa buzuq (pg_restore --list)"
[[ -s "$DIR/db.dump" ]] || fail "bo'sh nusxa"

# 2. Media
docker exec onatili-api tar -C /data -czf - media > "$DIR/media.tar.gz" || fail "media tar"

# Hajm va qatorlar soni (hisobot uchun)
COUNTS="$(docker exec onatili-postgres psql -U onatili -d onatili -tAc \
  "select (select count(*) from \"User\" where role='STUDENT')||' o''quvchi, '||(select count(*) from \"Payment\")||' to''lov, '||(select count(*) from \"Attempt\")||' test natijasi, '||(select count(*) from \"Attendance\")||' davomat'")"
DB_SIZE="$(du -h "$DIR/db.dump" | cut -f1)"
MEDIA_SIZE="$(du -h "$DIR/media.tar.gz" | cut -f1)"
(cd "$DIR" && sha256sum db.dump media.tar.gz > SHA256SUMS)

# 3. Haftalik va oylik nusxalar (qattiq havola: joy egallamaydi)
if [[ "$DOW" == "7" ]]; then cp -al "$DIR" "$ROOT/weekly/$TS"; fi
if [[ "$DOM" == "01" ]]; then cp -al "$DIR" "$ROOT/monthly/$TS"; fi
{ ls -1dt "$ROOT"/daily/*/ 2>/dev/null || true; } | tail -n +15 | xargs -r rm -rf
{ ls -1dt "$ROOT"/weekly/*/ 2>/dev/null || true; } | tail -n +9 | xargs -r rm -rf
{ ls -1dt "$ROOT"/monthly/*/ 2>/dev/null || true; } | tail -n +13 | xargs -r rm -rf

# 4. Server tashqarisiga: shifrlangan nusxa Telegram orqali
[[ -s "$KEY" ]] || fail "shifrlash kaliti yo'q ($KEY)"
OUT="$ROOT/onatili-${TS}.tar.enc"
tar -C "$DIR" -cf - db.dump SHA256SUMS $( [[ $(stat -c %s "$DIR/media.tar.gz") -lt 30000000 ]] && echo media.tar.gz ) \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$KEY" > "$OUT"
if [[ $(stat -c %s "$OUT") -lt 49000000 ]]; then
  tg_file "$OUT" "🗄 Zaxira nusxa ${TS} (UTC). ${COUNTS}. Baza ${DB_SIZE}, media ${MEDIA_SIZE}. Shifrlangan: ochish uchun parol kerak. Bu faylni o'chirmang."
else
  tg_text "🗄 Zaxira nusxa ${TS} serverda saqlandi (${COUNTS}), lekin Telegram uchun juda katta. Tashqi saqlash (R2/B2) ulash vaqti keldi."
fi
rm -f "$OUT"

echo "=== $(date -Is) backup tayyor: $DIR (baza ${DB_SIZE}, media ${MEDIA_SIZE}; ${COUNTS})"
