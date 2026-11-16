#!/usr/bin/env bash
# Staging: o'zgarishni Telegram ichida, production'ga TEGMASDAN sinash.
# Serverda /home/ubuntu/onatili-staging papkasida ishlaydi (prod papkasidan alohida).
#
#   scripts/staging.sh deploy [branch]  # noutbukdan: branch (default: joriy) serverdagi staging'ga chiqadi
#   scripts/staging.sh up       # shu mashinada: build, ko'tarish, migratsiya, seed (birinchi marta)
#   scripts/staging.sh down     # konteynerlar va tunnelni to'xtatadi (ma'lumot qoladi)
#   scripts/staging.sh reset    # bazani butunlay tozalab, noldan ko'taradi
#   scripts/staging.sh tunnel   # faqat tunnelni (qayta) ochadi
#   scripts/staging.sh status   # nima ishlayapti
#   scripts/staging.sh logs [servis...]
#
# Serverda: STAGING_WEB_BIND=172.18.0.1:18098, STAGING_TUNNEL=0. edge-caddy shu manzilga proxy qiladi.
# Noutbukda (zaxira yo'l): STAGING_WEB_BIND=127.0.0.1:8098, STAGING_TUNNEL=1. Noutbuk serverga
# o'zi ssh -R bilan ulanadi, uzilsa 5 soniyada qayta ulanadi.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
ENV_FILE="$ROOT/.env.staging"
RUN="$ROOT/.deploy/staging"; mkdir -p "$RUN"
TUNNEL_PID="$RUN/tunnel.pid"
TUNNEL_LOG="$RUN/tunnel.log"
COMPOSE=(docker compose -f docker-compose.staging.yml)
PROD_BOT="sherzodabduxalimovbot"

[[ -f "$ENV_FILE" ]] || { echo "✗ .env.staging yo'q: cp .env.staging.example .env.staging va to'ldiring"; exit 1; }
# Kalit yo'q bo'lsa bo'sh qaytaradi (set -e/pipefail skriptni to'xtatmasin)
envval() { { grep -E "^$1=" "$ENV_FILE" || true; } | head -1 | cut -d= -f2- | sed 's/[[:space:]]*#.*$//; s/^"//; s/"$//'; }
SSH_HOST="$(envval STAGING_SSH_HOST)"; SSH_HOST="${SSH_HOST:-onatili-yangi}"
REMOTE_BIND="$(envval STAGING_REMOTE_BIND)"; REMOTE_BIND="${REMOTE_BIND:-172.18.0.1:18098}"
PUBLIC_URL="$(envval MINIAPP_URL)"
REMOTE_DIR="$(envval STAGING_REMOTE_DIR)"; REMOTE_DIR="${REMOTE_DIR:-/home/ubuntu/onatili-staging}"
WEB_BIND="$(envval STAGING_WEB_BIND)"; WEB_BIND="${WEB_BIND:-127.0.0.1:8098}"
TUNNEL="$(envval STAGING_TUNNEL)"; TUNNEL="${TUNNEL:-0}"
LOCAL_PORT="${WEB_BIND##*:}"
export STAGING_WEB_BIND="$WEB_BIND"

# Prod bot tokeni adashib yozilgan bo'lsa, ishga tushirmaymiz: aks holda prod bot 409 beradi
# va haqiqiy o'quvchilarga staging'dan xabar ketadi
guard_bot() {
  local token me
  token="$(envval BOT_TOKEN)"
  [[ -n "$token" ]] || { echo "✗ .env.staging: BOT_TOKEN bo'sh (test bot tokeni kerak)"; exit 1; }
  me="$(curl -s -4 -m 15 "https://api.telegram.org/bot${token}/getMe" | grep -oE '"username":"[^"]+"' | cut -d'"' -f4 || true)"
  [[ -n "$me" ]] || { echo "✗ BOT_TOKEN ishlamayapti (getMe javob bermadi)"; exit 1; }
  if [[ "$me" == "$PROD_BOT" ]]; then
    echo "✗ .env.staging da PRODUCTION bot (@$PROD_BOT) tokeni turibdi. Test bot tokenini yozing."; exit 1
  fi
  [[ "$(envval BOT_USERNAME)" == "$me" ]] || echo "⚠ BOT_USERNAME=$(envval BOT_USERNAME), lekin token @$me ga tegishli. .env.staging ni to'g'rilang."
  echo "✓ test bot: @$me"
}

tunnel_running() { [[ -f "$TUNNEL_PID" ]] && kill -0 "$(cat "$TUNNEL_PID")" 2>/dev/null; }

tunnel_up() {
  if tunnel_running; then echo "✓ tunnel allaqachon ishlayapti"; return; fi
  : > "$TUNNEL_LOG"
  # ControlMaster=no: aks holda ssh umumiy (mux) ulanishga qo'shilib darhol chiqadi, forward eski sessiyada nazoratsiz qoladi
  # Qayta ulanuvchi tsikl. Alohida jarayon guruhida: down butun guruhni o'ldiradi
  setsid nohup bash -c '
    while true; do
      echo "$(date -Is) ulanmoqda"
      ssh -N -o BatchMode=yes -o ExitOnForwardFailure=yes -o ControlMaster=no -o ControlPath=none \
          -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o ConnectTimeout=15 \
          -R "$1:127.0.0.1:$2" "$3"
      rc=$?
      echo "$(date -Is) uzildi (kod $rc), 5 s dan keyin qayta"
      sleep 5
    done' _ "$REMOTE_BIND" "$LOCAL_PORT" "$SSH_HOST" >>"$TUNNEL_LOG" 2>&1 < /dev/null &
  echo $! > "$TUNNEL_PID"
  sleep 3
  if grep -q "remote port forwarding failed" "$TUNNEL_LOG"; then
    echo "⚠ tunnel porti band (eski ulanish serverda hali yopilmagan bo'lishi mumkin), o'zi qayta urinadi. Log: $TUNNEL_LOG"
  else
    echo "✓ tunnel: $REMOTE_BIND (server) -> 127.0.0.1:$LOCAL_PORT"
  fi
}

tunnel_down() {
  if tunnel_running; then kill -- -"$(cat "$TUNNEL_PID")" 2>/dev/null || kill "$(cat "$TUNNEL_PID")" 2>/dev/null || true; fi
  rm -f "$TUNNEL_PID"
}

health() {
  for _ in $(seq 1 40); do
    curl -fsS -m 5 "http://$WEB_BIND/api/health" 2>/dev/null | grep -q '"ok"' && return 0
    sleep 3
  done
  return 1
}

cmd_up() {
  guard_bot
  echo "▶ build va ishga tushirish (birinchi marta bir necha daqiqa)…"
  "${COMPOSE[@]}" up -d --build --remove-orphans
  echo "⏳ health check…"
  health || { echo "✗ API ko'tarilmadi:"; "${COMPOSE[@]}" logs --tail 40 api; exit 1; }
  echo "✓ API sog'lom"
  if [[ ! -f "$RUN/seeded" ]]; then
    echo "▶ seed (demo kontent)…"
    "${COMPOSE[@]}" exec -T api sh -c "cd packages/db && npx tsx prisma/seed.ts" && touch "$RUN/seeded"
  fi
  [[ "$TUNNEL" == "1" ]] && tunnel_up
  echo
  echo "✅ STAGING TAYYOR ($(git rev-parse --short HEAD) $(git log -1 --format=%s | cut -c1-60))"
  echo "   Mini App:  $PUBLIC_URL  (test botda /start)"
  echo "   Admin:     $PUBLIC_URL/admin  (test botga /admin yozing)"
}

cmd_down() {
  tunnel_down
  "${COMPOSE[@]}" down
  echo "✓ staging to'xtatildi (ma'lumot volumlarda qoladi)"
}

cmd_reset() {
  read -r -p "Staging bazasi va media butunlay o'chiriladi. Davom etilsinmi? [y/N] " a
  [[ "$a" == "y" ]] || exit 0
  tunnel_down
  "${COMPOSE[@]}" down -v
  rm -f "$RUN/seeded"
  cmd_up
}

cmd_status() {
  "${COMPOSE[@]}" ps
  if [[ "$TUNNEL" == "1" ]]; then
    if tunnel_running; then echo "tunnel: ishlayapti ($(tail -1 "$TUNNEL_LOG"))"; else echo "tunnel: o'chiq"; fi
  fi
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 10 "$PUBLIC_URL/api/health" || true)"
  echo "tashqi manzil: $PUBLIC_URL/api/health -> HTTP $code"
}

# Noutbukdan: branch GitHub'da bo'lishi kerak (push qilingan). Server o'sha commit'ni oladi va ko'taradi.
cmd_deploy() {
  local branch="${1:-$(git branch --show-current)}" sha
  git fetch -q origin "$branch" || { echo "✗ origin/$branch yo'q: avval git push qiling"; exit 1; }
  sha="$(git rev-parse "origin/$branch")"
  if [[ "$branch" == "$(git branch --show-current)" && "$(git rev-parse HEAD)" != "$sha" ]]; then
    echo "⚠ lokal $branch origin'dan farq qiladi: serverga origin/$branch (${sha:0:7}) chiqadi. Yangisi kerak bo'lsa git push qiling."
  fi
  echo "▶ serverdagi staging: $branch (${sha:0:7})"
  # shellcheck disable=SC2029
  ssh -o ControlMaster=no -o ControlPath=none "$SSH_HOST" \
    "set -e; cd '$REMOTE_DIR' && git fetch -q origin '$branch' && git checkout -q --detach '$sha' && scripts/staging.sh up"
}

remote() {
  # shellcheck disable=SC2029
  ssh -o ControlMaster=no -o ControlPath=none "$SSH_HOST" "cd '$REMOTE_DIR' && scripts/staging.sh $*"
}

case "${1:-up}" in
  up) cmd_up ;;
  down) cmd_down ;;
  reset) cmd_reset ;;
  tunnel) tunnel_down; tunnel_up ;;
  status) cmd_status ;;
  deploy) shift; cmd_deploy "$@" ;;
  remote) shift; remote "$@" ;;
  logs) shift; "${COMPOSE[@]}" logs -f --tail 100 "$@" ;;
  *) echo "foydalanish: $0 {deploy [branch]|remote <buyruq>|up|down|reset|tunnel|status|logs}"; exit 1 ;;
esac
