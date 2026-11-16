# Landing: sherzodabduxalimov.uz

Ustozning profil sayti. Statik fayllar (`public/`), build yo'q.

- Serverda: `/home/ubuntu/ustoz-site`, konteyner `ustoz-web` (caddy, `public/` faqat o'qish uchun ulangan).
- Tashqi trafik `infra/edge/Caddyfile` dagi `sherzodabduxalimov.uz` bloki orqali keladi.
- Lokal korish: `cd sites/landing/public && python3 -m http.server 8090`
- Sertifikatlar: asl rasmlar `sertifikatlar/` ga (gitga tushmaydi), keyin `sh tools/build-certs.sh`.
