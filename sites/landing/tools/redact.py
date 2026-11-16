import os, re, subprocess
from PIL import Image, ImageFilter
src, out = "/in", "/tmp/red"
os.makedirs(out, exist_ok=True)
G = 0.0276  # qatorlar orasidagi masofa (rasm balandligiga nisbatan)
for f in sorted(os.listdir(src)):
    im = Image.open(os.path.join(src, f)).convert("RGB"); W, H = im.size
    tsv = subprocess.run(["tesseract", os.path.join(src, f), "-", "--psm", "11", "tsv"], capture_output=True, text=True).stdout
    ky = None
    for line in tsv.splitlines()[1:]:
        p = line.split("\t")
        if len(p) == 12 and re.fullmatch(r"\d{12,15}", p[11].strip()):
            ky = (int(p[7]) + int(p[9]) / 2) / H; break
    if ky is None: ky = 0.353
    boxes = [(0.55, ky - 2.5*G, 0.93, ky - 0.9*G),   # sertifikat raqami
             (0.33, ky - 0.8*G, 0.63, ky + 0.8*G),   # shaxsiy kod
             (0.74, ky - 1.3*G, 0.965, ky + 4.1*G),  # rasm
             (0.35, ky + 15.3*G, 0.65, ky + 20.8*G)] # QR
    for x0, y0, x1, y1 in boxes:
        b = (int(max(0, x0) * W), int(max(0, y0) * H), int(min(1, x1) * W), int(min(1, y1) * H))
        r = im.crop(b)
        small = r.resize((max(1, r.width // 16), max(1, r.height // 16)))
        im.paste(small.resize(r.size, Image.NEAREST).filter(ImageFilter.GaussianBlur(5)), b)
    im.save(os.path.join(out, f), quality=90)
    print(f, round(ky, 3))
