#!/usr/bin/env bash
# Staging: o'zgarishni Telegram ichida, production'ga TEGMASDAN sinash. Noutbukda ishlaydi.
#
#   scripts/staging.sh up       # build, ko'tarish, migratsiya, seed (birinchi marta), tunnel
#   scripts/staging.sh down     # konteynerlar va tunnelni to'xtatadi (ma'lumot qoladi)
#   scripts/staging.sh reset    # bazani butunlay tozalab, noldan ko'taradi
#   scripts/staging.sh tunnel   # faqat tunnelni (qayta) ochadi
#   scripts/staging.sh status   # nima ishlayapti
#   scripts/staging.sh logs [servis...]
#
# Tunnel: noutbuk prod serverga o'zi SSH orqali ulanadi (ssh -R), shuning uchun
# hotspot/Wi-Fi almashsa yoki public IP o'zgarsa ham manzil o'zgarmaydi. Ulanish
# uzilsa, 5 soniyadan keyin qayta ulanadi.
#   https://staging.sherzodabduxalimov.uzbek-talim.uz -> edge-caddy -> 172.18.0.1:18098 (server) -> 127.0.0.1:8098 (noutbuk)
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
ENV_FILE="$ROOT/.env.staging"
RUN="$ROOT/.deploy/staging"; mkdir -p "$RUN"
TUNNEL_PID="$RUN/tunnel.pid"
TUNNEL_LOG="$RUN/tunnel.log"
COMPOSE=(docker compose -f docker-compose.staging.yml)
LOCAL_PORT=8098
PROD_BOT="sherzodabduxalimovbot"

[[ -f "$ENV_FILE" ]] || { echo "✗ .env.staging yo'q: cp .env.staging.example .env.staging va to'ldiring"; exit 1; }
envval() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed 's/[[:space:]]*#.*$//; s/^"//; s/"$//'; }
SSH_HOST="$(envval STAGING_SSH_HOST)"; SSH_HOST="${SSH_HOST:-onatili-yangi}"
REMOTE_BIND="$(envval STAGING_REMOTE_BIND)"; REMOTE_BIND="${REMOTE_BIND:-172.18.0.1:18098}"
PUBLIC_URL="$(envval MINIAPP_URL)"

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
  # Qayta ulanuvchi tsikl. Alohida jarayon guruhida: down butun guruhni o'ldiradi
  setsid nohup bash -c '
    while true; do
      echo "$(date -Is) ulanmoqda"
      ssh -N -o BatchMode=yes -o ExitOnForwardFailure=yes \
          -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o ConnectTimeout=15 \
          -R "$1:127.0.0.1:$2" "$3"
      echo "$(date -Is) uzildi (kod $?), 5 s dan keyin qayta"
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
    curl -fsS -m 5 "http://127.0.0.1:$LOCAL_PORT/api/health" 2>/dev/null | grep -q '"ok"' && return 0
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
  tunnel_up
  echo
  echo "✅ STAGING TAYYOR"
  echo "   Mini App:  $PUBLIC_URL  (test botda /start)"
  echo "   Admin:     $PUBLIC_URL/admin  (test botga /admin yozing)"
  echo "   Lokal:     http://127.0.0.1:$LOCAL_PORT"
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
  if tunnel_running; then echo "tunnel: ishlayapti ($(tail -1 "$TUNNEL_LOG"))"; else echo "tunnel: o'chiq"; fi
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 10 "$PUBLIC_URL/api/health" || true)"
  echo "tashqi manzil: $PUBLIC_URL/api/health -> HTTP $code"
}

case "${1:-up}" in
  up) cmd_up ;;
  down) cmd_down ;;
  reset) cmd_reset ;;
  tunnel) tunnel_down; tunnel_up ;;
  status) cmd_status ;;
  logs) shift; "${COMPOSE[@]}" logs -f --tail 100 "$@" ;;
  *) echo "foydalanish: $0 {up|down|reset|tunnel|status|logs}"; exit 1 ;;
esac
