#!/usr/bin/env bash
# Prod serverda bir marta: CI'ga bog'langan auto-deploy + staging tunneli uchun sshd va Caddy.
set -Eeuo pipefail

echo "▶ 1/3 auto-deploy (faqat CI yashil commit chiqadi)"
cp ~/.onatili/auto-deploy.sh ~/.onatili/auto-deploy.sh.bak
git -C ~/onatili-prod fetch -q origin main
git -C ~/onatili-prod show origin/main:scripts/auto-deploy.sh > ~/.onatili/auto-deploy.sh.new
bash -n ~/.onatili/auto-deploy.sh.new
chmod +x ~/.onatili/auto-deploy.sh.new
mv ~/.onatili/auto-deploy.sh.new ~/.onatili/auto-deploy.sh
grep -q check-runs ~/.onatili/auto-deploy.sh && echo "✓ auto-deploy yangilandi"

echo "▶ 2/3 sshd: tunnel 172.18.0.1 ga bog'lana olsin (tashqaridan ko'rinmaydi)"
printf 'Match User ubuntu\n  GatewayPorts clientspecified\n' | sudo tee /etc/ssh/sshd_config.d/70-onatili-staging-tunnel.conf >/dev/null
sudo sshd -t
sudo systemctl reload ssh
echo "✓ sshd: $(sudo sshd -T -C user=ubuntu,host=x,addr=1.1.1.1 | grep -i '^gatewayports')"

echo "▶ 3/3 Caddy: staging bloki"
if grep -q '^staging.sherzodabduxalimov' ~/edge/Caddyfile; then
  echo "✓ blok allaqachon bor"
else
  cp ~/edge/Caddyfile ~/edge/Caddyfile.bak
  cat >> ~/edge/Caddyfile <<'EOF'

# Staging: noutbukdan teskari SSH tunnel (scripts/staging.sh). Noutbuk o'chiq bo'lsa 502 o'rniga yozuv
staging.sherzodabduxalimov.uzbek-talim.uz {
	encode zstd gzip
	header -Server
	reverse_proxy 172.18.0.1:18098
	handle_errors {
		respond "Staging o'chiq (noutbukda scripts/staging.sh up)" 503
	}
}
EOF
  if docker exec edge-caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
    docker exec edge-caddy caddy reload --config /etc/caddy/Caddyfile
    echo "✓ Caddy qayta yuklandi"
  else
    cat ~/edge/Caddyfile.bak > ~/edge/Caddyfile   # inode o'zgarmasin: konteyner fayl mount qilgan
    echo "✗ Caddyfile xato, eski holatga qaytarildi"; exit 1
  fi
fi
echo "✅ server tayyor"
