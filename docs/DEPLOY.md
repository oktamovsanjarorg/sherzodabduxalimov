# Deploy (CI/CD)

## Qanday ishlaydi
1. `main` ga push bo'ladi, GitHub Actions ishga tushadi:
   - `check`: build, typecheck, testlar (Postgres va Redis bilan).
   - `docker`: app va web image'lari build qilinadi.
2. Ikkalasi o'tsa, `deploy` job'i serverga SSH orqali `deploy <sha>` buyrug'ini yuboradi.
3. Serverda `authorized_keys` dagi forced command faqat `scripts/deploy-ssh.sh` ni ishga tushira oladi.
4. `scripts/deploy.sh` ish tartibi (`/home/ubuntu/onatili-prod`):
   - `git checkout <sha>`;
   - `docker compose build`, keyin `up -d`;
   - health check (nginx → api);
   - muvaffaqiyatsiz bo'lsa, **avvalgi commit'ga qaytaradi**.
   - Jurnal: `/home/ubuntu/onatili-prod/.deploy/deploy.log`.

Production faqat `/home/ubuntu/onatili-prod` dan ishga tushiriladi. Dev papkasidan `docker compose up` qilmang.

## Bir martalik sozlash (server egasi bajaradi)
```bash
# 1) Faqat deploy qila oladigan kalit (shell, port forwarding va hokazo taqiqlangan)
ssh-keygen -q -t ed25519 -N "" -C github-actions-deploy@onatili -f ~/.ssh/github_actions_deploy
echo "command=\"/home/ubuntu/onatili-prod/scripts/deploy-ssh.sh\",restrict $(cat ~/.ssh/github_actions_deploy.pub)" >> ~/.ssh/authorized_keys

# 2) GitHub secret'lari uchun qiymatlar
cat ~/.ssh/github_actions_deploy                                         # -> DEPLOY_SSH_KEY
echo "54.206.159.221 $(cut -d' ' -f1-2 /etc/ssh/ssh_host_ed25519_key.pub)" # -> DEPLOY_KNOWN_HOSTS
# DEPLOY_HOST = 54.206.159.221
```
GitHub → repo → Settings → Secrets and variables → Actions → New repository secret: `DEPLOY_HOST`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`.

AWS Security Group'da 22-port GitHub Actions uchun ochiq bo'lishi kerak.

## Qo'lda deploy
```bash
/home/ubuntu/onatili-prod/scripts/deploy.sh          # origin/main
/home/ubuntu/onatili-prod/scripts/deploy.sh <sha>    # aniq commit (orqaga qaytarish uchun ham)
```
