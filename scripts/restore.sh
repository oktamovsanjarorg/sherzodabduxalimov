#!/usr/bin/env bash
# Zaxira nusxadan tiklash.
#
#   restore.sh --test                     eng oxirgi nusxani VAQTINCHALIK bazaga tiklab tekshiradi (prod'ga tegmaydi)
#   restore.sh --decrypt FAYL.tar.enc     Telegram'dan olingan shifrlangan faylni ochadi (parol kerak) -> ./restored/
#   restore.sh --prod PAPKA               PROD bazani shu nusxa bilan ALMASHTIRADI (oldin joriy holatning nusxasi olinadi)
set -Eeuo pipefail
ROOT="/home/ubuntu/onatili-backups"
KEY="/home/ubuntu/.onatili/backup.key"
PG="docker exec -i onatili-postgres"
counts() {
  $PG psql -U onatili -d "$1" -tAc "select 'o''quvchi='||(select count(*) from \"User\" where role='STUDENT')||' to''lov='||(select count(*) from \"Payment\")||' natija='||(select count(*) from \"Attempt\")||' dars='||(select count(*) from \"Lesson\")||' savol='||(select count(*) from \"Question\")"
}

case "${1:-}" in
  --test)
    DIR="${2:-$(ls -1dt "$ROOT"/daily/*/ | head -1)}"
    echo "Tekshirilmoqda: $DIR"
    (cd "$DIR" && sha256sum -c --quiet SHA256SUMS) && echo "Nazorat summasi: OK"
    $PG psql -U onatili -d postgres -qc "drop database if exists onatili_restore_test" -c "create database onatili_restore_test"
    $PG pg_restore -U onatili -d onatili_restore_test --no-owner < "$DIR/db.dump"
    echo "Nusxada:   $(counts onatili_restore_test)"
    echo "Hozir prod: $(counts onatili)"
    tar -tzf "$DIR/media.tar.gz" > /dev/null && echo "Media arxivi: OK ($(tar -tzf "$DIR/media.tar.gz" | wc -l) fayl)"
    $PG psql -U onatili -d postgres -qc "drop database onatili_restore_test"
    echo "Tiklash sinovi muvaffaqiyatli"
    ;;
  --decrypt)
    mkdir -p restored
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:${KEY_FILE:-$KEY}" -in "$2" | tar -C restored -xf -
    (cd restored && sha256sum -c SHA256SUMS)
    echo "Ochildi: ./restored (db.dump, media.tar.gz). Tiklash: restore.sh --prod ./restored"
    ;;
  --prod)
    DIR="$2"
    [[ -s "$DIR/db.dump" ]] || { echo "db.dump topilmadi"; exit 1; }
    read -r -p "PROD baza $DIR dagi nusxa bilan almashtiriladi. Davom etish uchun HA deb yozing: " ok
    [[ "$ok" == "HA" ]] || exit 1
    /home/ubuntu/.onatili/backup.sh || true   # joriy holat ham saqlab qolinsin
    docker stop onatili-api onatili-worker onatili-bot
    $PG psql -U onatili -d postgres -qc "drop database onatili with (force)" -c "create database onatili"
    $PG pg_restore -U onatili -d onatili --no-owner < "$DIR/db.dump"
    [[ -s "$DIR/media.tar.gz" ]] && docker run --rm -i --entrypoint sh -v onatili_onatili_media:/data onatili-app:latest -c "tar -C /data -xzf -" < "$DIR/media.tar.gz"
    docker start onatili-api onatili-worker onatili-bot
    echo "Tiklandi: $(counts onatili)"
    ;;
  *) sed -n '2,7p' "$0"; exit 1 ;;
esac
