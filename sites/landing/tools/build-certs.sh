#!/bin/sh
# Sertifikatlarni saytga joylaydi.
#   1) Asl rasmlarni /home/ubuntu/ustoz-site/sertifikatlar/ ga tashlang (01.jpg, 02.jpg ...; jpg/png)
#   2) sh /home/ubuntu/ustoz-site/tools/build-certs.sh
# Har bir rasmda sertifikat raqami, shaxsiy kod, o'quvchi rasmi va QR-kod xiralashtiriladi
# (tools/redact.py), EXIF tozalanadi, webp qilinadi va index.html dagi CERTS bloki yangilanadi.
# Asl rasmlar saytga chiqmaydi. Natijani public/certs/ da ko'z bilan tekshiring.
set -e
cd "$(dirname "$0")/.."
docker run --rm -v "$PWD/sertifikatlar:/in:ro" -v "$PWD/public/certs:/out" -v "$PWD/tools:/tools:ro" alpine:3.20 sh -c '
  apk add -q --no-cache imagemagick imagemagick-jpeg imagemagick-webp tesseract-ocr tesseract-ocr-data-eng py3-pillow python3 >/dev/null 2>&1
  python3 /tools/redact.py >/dev/null
  rm -f /out/*.webp /out/list.txt
  for f in $(ls /tmp/red | sort); do
    n="${f%.*}"
    magick "/tmp/red/$f" -strip -resize "x560>" -quality 76 "/out/$n.webp"
    magick "/tmp/red/$f" -strip -resize "1600x1600>" -quality 82 "/out/$n-full.webp"
    echo "$n $(magick identify -format "%w %h" "/out/$n.webp")" >> /out/list.txt
  done
  chown -R '"$(id -u):$(id -g)"' /out'
python3 - <<'PY'
import re
items=[l.split() for l in open("public/certs/list.txt")]
html='\n'.join(f'            <button class="cert" data-n="{n}" data-full="certs/{n}-full.webp"><img src="certs/{n}.webp" width="{w}" height="{h}" alt="Ona tili va adabiyot milliy sertifikati — Sherzod Abduxalimov öquvçisi ({int(n)})" loading="lazy" decoding="async"></button>' for n,w,h in items)
p="public/index.html"; s=open(p).read()
s,k=re.subn(r'<!-- CERTS:START -->.*?<!-- CERTS:END -->', lambda m:'<!-- CERTS:START -->\n'+html+'\n            <!-- CERTS:END -->', s, flags=re.S)
assert k==1, "index.html da CERTS belgilari topilmadi"
open(p,"w").write(s); print(f"{len(items)} ta sertifikat joylandi")
PY
