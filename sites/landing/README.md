# Landing: sherzodabduxalimov.uz

Ustozning profil sayti. Statik fayllar (`public/`), build yo'q.

- Serverda: konteyner `ustoz-web` (`/home/ubuntu/ustoz-site/docker-compose.yml`). U `/home/ubuntu/onatili-prod/sites/landing/public` ni o'qiydi: `main` ga tushgan o'zgarish prod deploy bilan birga 2 daqiqada chiqadi. Serverda fayllarni qo'lda tahrirlamang.
- Tashqi trafik `infra/edge/Caddyfile` dagi `sherzodabduxalimov.uz` bloki orqali keladi.
- Lokal korish: `cd sites/landing/public && python3 -m http.server 8090`
- Sertifikatlar: asl rasmlar `sertifikatlar/` ga (gitga tushmaydi), keyin `sh tools/build-certs.sh`.
