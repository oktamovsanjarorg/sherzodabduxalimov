#!/usr/bin/env bash
# Pull-based CD: server o'zi GitHub'dagi main'ni tekshiradi va yangi commit bo'lsa deploy qiladi.
# Cron (har 2 daqiqada): */2 * * * * /home/ubuntu/onatili-prod/scripts/auto-deploy.sh >> /home/ubuntu/onatili-prod/.deploy/auto.log 2>&1
# GitHub'da secret ham, serverga tashqi SSH kirishi ham kerak emas.
# Xavfsizlik: deploy.sh health check qiladi va o'tmasa avvalgi versiyaga qaytaradi.
# Bir xil commit ikkinchi marta urinilmaydi (muvaffaqiyatsiz bo'lsa ham), keyingi commit kutiladi.
set -Eeuo pipefail
DIR="/home/ubuntu/onatili-prod"
STATE="$DIR/.deploy"
mkdir -p "$STATE"
cd "$DIR"

# GitHub vaqtincha javob bermasa: jim chiqib ketamiz, keyingi safar yana tekshiriladi
git fetch --quiet origin main 2>/dev/null || exit 0
TARGET="$(git rev-parse origin/main)"
CURRENT="$(cat "$STATE/current" 2>/dev/null || true)"
TRIED="$(cat "$STATE/last-attempt" 2>/dev/null || true)"

[[ "$TARGET" == "$CURRENT" || "$TARGET" == "$TRIED" ]] && exit 0

# Boshqa deploy (masalan, qo'lda) ketayotgan bo'lsa: bu urinish hisoblanmaydi, keyingi safar qayta tekshiriladi
flock -n "$STATE/lock" true || exit 0

echo "$TARGET" > "$STATE/last-attempt"
echo "=== $(date -Is) yangi commit: ${TARGET:0:7} (hozirgi: ${CURRENT:0:7})"
"$DIR/scripts/deploy.sh" "$TARGET"
