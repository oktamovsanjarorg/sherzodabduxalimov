#!/usr/bin/env bash
# Production deploy: berilgan commit'ni (yoki origin/main) build qiladi va ishga tushiradi.
# Health check o'tmasa, avvalgi versiyaga qaytaradi.
#
#   scripts/deploy.sh [SHA]
#
# Serverda /home/ubuntu/onatili-prod papkasida ishlaydi (dev papkasidan alohida).
set -Eeuo pipefail

# git checkout skript faylining o'zini o'zgartiradi: bash uni qatorma-qator o'qigani uchun
# avval vaqtinchalik nusxaga ko'chib, o'shandan ishlaymiz
if [[ -z "${DEPLOY_REEXEC:-}" ]]; then
  tmp="$(mktemp /tmp/onatili-deploy.XXXXXX.sh)"
  cp "$0" "$tmp"
  DEPLOY_REEXEC=1 exec bash "$tmp" "$@"
fi

DIR="${DEPLOY_DIR:-/home/ubuntu/onatili-prod}"
LOG="$DIR/.deploy/deploy.log"
mkdir -p "$DIR/.deploy"
exec > >(tee -a "$LOG") 2>&1

cd "$DIR"
# Bir vaqtda ikkita deploy bo'lmasin
exec 9>"$DIR/.deploy/lock"
flock -n 9 || { echo "Boshqa deploy ketmoqda, to'xtatildi"; exit 1; }

TARGET="${1:-origin/main}"
if [[ "$TARGET" != "origin/main" && ! "$TARGET" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "Noto'g'ri commit: $TARGET"; exit 2
fi

echo "=== $(date -Is) deploy boshlandi: $TARGET"
PREV="$(git rev-parse HEAD)"
git fetch --quiet origin main
git checkout --quiet --detach "$TARGET"
NEW="$(git rev-parse HEAD)"
echo "Avvalgi: ${PREV:0:7}  Yangi: ${NEW:0:7}"

health() {
  # web konteyneri ichidan nginx -> api zanjirini tekshiramiz
  for _ in $(seq 1 30); do
    if docker exec onatili-web wget -qO- http://127.0.0.1/api/health 2>/dev/null | grep -q '"ok"'; then return 0; fi
    sleep 3
  done
  return 1
}

up() {
  docker compose build --pull=false api web
  docker compose up -d --remove-orphans
}

if up && health; then
  echo "$NEW" > "$DIR/.deploy/current"
  docker image prune -f >/dev/null || true
  echo "=== $(date -Is) muvaffaqiyatli: ${NEW:0:7}"
  exit 0
fi

echo "!!! Health check o'tmadi. ${PREV:0:7} ga qaytarilmoqda"
git checkout --quiet --detach "$PREV"
up && health && echo "=== Qaytarildi: ${PREV:0:7}" || echo "!!! Qaytarish ham muvaffaqiyatsiz, qo'lda tekshiring"
exit 1
