#!/usr/bin/env bash
# authorized_keys'dagi "forced command": GitHub Actions kaliti faqat shu skriptni ishga tushira oladi.
# SSH orqali kelgan buyruqdan faqat "deploy <sha>" qabul qilinadi, boshqa hamma narsa rad etiladi.
set -euo pipefail
read -r ACTION SHA EXTRA <<<"${SSH_ORIGINAL_COMMAND:-}"
if [[ "$ACTION" != "deploy" || -n "${EXTRA:-}" || ! "${SHA:-}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Ruxsat etilmagan buyruq" >&2
  exit 1
fi
exec /home/ubuntu/onatili-prod/scripts/deploy.sh "$SHA"
